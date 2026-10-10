<?php

namespace App\Console\Commands;

use App\Models\Deposit;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\MenuItem;
use App\Models\MoneyLedgerEntry;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\ProductRecipe;
use App\Models\Shift;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use App\Models\Table;
use App\Models\User;
use App\Services\Forecasting\SeededPrng;
use App\Services\Forecasting\SyntheticDemandGenerator;
use Carbon\CarbonInterface;
use Database\Seeders\AuthorizationSeeder;
use Database\Seeders\DefaultMenuAndInventorySeeder;
use Database\Seeders\DefaultTableSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GenerateMockDataCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'data:generate-mock 
                            {--dataset= : Tên dataset mô phỏng (tùy chọn)} 
                            {--seed=42 : Random seed} 
                            {--days=120 : Số ngày sinh dữ liệu trong quá khứ} 
                            {--orders-per-day=20 : Số đơn trung bình mỗi ngày} 
                            {--fresh-mock : Dọn sạch giao dịch cũ trước khi sinh mới}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sinh ngẫu nhiên dữ liệu giao dịch thực tế, chuẩn nghiệp vụ cho 13 trang báo cáo';

    private SeededPrng $prng;

    public function handle(SyntheticDemandGenerator $generator): int
    {
        $datasetName = $this->option('dataset') ? (string) $this->option('dataset') : null;
        $seed = (int) ($this->option('seed') ?? 42);
        $days = max(1, (int) $this->option('days'));
        $ordersPerDay = max(1, (int) $this->option('orders-per-day'));
        $freshMock = (bool) $this->option('fresh-mock');

        $this->prng = new SeededPrng($seed);

        if ($freshMock && empty($datasetName)) {
            $this->error('LỖI: Tùy chọn --fresh-mock chỉ được phép sử dụng cùng với --dataset.');

            return self::FAILURE;
        }

        $this->ensureMasterData();

        if (! empty($datasetName)) {
            return $this->handleSyntheticDataset($generator, $datasetName, $seed, $days, $ordersPerDay, $freshMock);
        }

        return $this->handleRealMockData($days, $ordersPerDay);
    }

    private function handleSyntheticDataset(
        SyntheticDemandGenerator $generator,
        string $datasetName,
        int $seed,
        int $days,
        int $ordersPerDay,
        bool $freshMock
    ): int {
        $existing = SyntheticDataset::where('name', $datasetName)->first();

        if ($freshMock && $existing) {
            $this->info("Đang xóa các giao dịch cũ của dataset '{$datasetName}'...");
            DB::transaction(function () use ($existing) {
                $invoiceIds = Invoice::where('synthetic_dataset_id', $existing->id)->pluck('id');
                if ($invoiceIds->isNotEmpty()) {
                    InvoiceLine::whereIn('invoice_id', $invoiceIds)->delete();
                    Invoice::where('synthetic_dataset_id', $existing->id)->delete();
                }
            });
        }

        $config = [
            'days' => $days,
            'orders_per_day' => $ordersPerDay,
            'start_date' => now()->subDays($days - 1)->toDateString(),
            'weekly' => true,
            'trend' => 0.002,
            'noise' => 0.10,
            'zero_demand_rate' => 0.02,
            'outlier_rate' => 0.01,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.01,
        ];
        $configHash = hash('sha256', (string) json_encode($config));

        $dataset = SyntheticDataset::firstOrCreate(
            ['name' => $datasetName],
            [
                'seed' => $seed,
                'configuration' => $config,
                'configuration_hash' => $configHash,
                'generator_version' => SyntheticDemandGenerator::VERSION,
                'dataset_hash' => '',
                'created_by' => null,
            ]
        );

        $this->info("Đang sinh dữ liệu mô phỏng cho dataset '{$datasetName}' (seed: {$seed})...");
        $demand = $generator->generate($config, $seed);
        $datasetHash = $generator->hash($demand);

        $dataset->update([
            'seed' => $seed,
            'configuration' => $config,
            'configuration_hash' => $configHash,
            'generator_version' => SyntheticDemandGenerator::VERSION,
            'dataset_hash' => $datasetHash,
        ]);

        $generator->persist($dataset, $demand);

        $this->info("Sinh dữ liệu mô phỏng thành công cho dataset '{$datasetName}' (hash: {$datasetHash}).");

        return self::SUCCESS;
    }

    private function handleRealMockData(int $days, int $ordersPerDay): int
    {
        $this->info("Bắt đầu sinh dữ liệu mẫu cho {$days} ngày gần nhất (khoảng {$ordersPerDay} đơn/ngày)...");

        $startDate = now()->subDays($days)->startOfDay();

        // 1. Khởi tạo lô nhập kho ban đầu (PN-...)
        $this->createInitialStockVouchers($startDate);

        $tables = Table::all();
        $menuItems = MenuItem::with('recipes.ingredient')->where('is_available', true)->get();
        $users = User::all();
        $staffUser = $users->firstWhere('email', 'staff@taphoa.local') ?? $users->first();
        $managerUser = $users->firstWhere('email', 'manager@taphoa.local') ?? $users->first();
        $employee = Employee::first();

        $progressBar = $this->output->createProgressBar($days + 1);
        $progressBar->start();

        $totalInvoices = 0;
        $totalOrders = 0;
        $totalRevenue = 0.0;
        $totalExportVouchers = 0;

        $exportSeqCounter = 1;

        for ($d = $days; $d >= 0; $d--) {
            $currentDay = now()->subDays($d);
            $dateStr = $currentDay->format('Ymd');
            $yymmdd = $currentDay->format('ymd');

            // 2. Tạo 2 Ca làm việc (Morning & Evening)
            $shift1 = Shift::create([
                'opened_at' => $currentDay->copy()->setTime(7, 30),
                'closed_at' => $currentDay->copy()->setTime(15, 0),
                'opening_cash' => 1500000,
                'closing_cash' => 1500000,
                'actual_cash' => 1500000,
                'status' => ($d === 0 && now()->hour < 15) ? 'open' : 'closed',
                'opened_by' => $staffUser->id,
                'closed_by' => $managerUser->id,
                'note' => 'Ca sáng '.$currentDay->format('d/m/Y'),
            ]);

            $shift2 = Shift::create([
                'opened_at' => $currentDay->copy()->setTime(15, 0),
                'closed_at' => $currentDay->copy()->setTime(22, 30),
                'opening_cash' => 1500000,
                'closing_cash' => 1500000,
                'actual_cash' => 1500000,
                'status' => ($d === 0) ? 'open' : 'closed',
                'opened_by' => $staffUser->id,
                'closed_by' => ($d === 0) ? null : $managerUser->id,
                'note' => 'Ca chiều tối '.$currentDay->format('d/m/Y'),
            ]);

            $shift1CashSales = 0.0;
            $shift2CashSales = 0.0;

            // 3. Tạo Đơn đặt bàn & Cọc trong ngày
            $this->createReservationsAndDeposits(
                $currentDay,
                $tables,
                $menuItems,
                $staffUser,
                $shift2,
                $employee,
                $dateStr,
                $exportSeqCounter,
                $totalInvoices,
                $totalRevenue,
                $totalExportVouchers,
                $shift2CashSales
            );

            // 4. Sinh đơn hàng trong ngày
            $dailyOrderCount = (int) round($ordersPerDay * ($this->rand(80, 120) / 100));
            $orderSeq = 1;

            for ($i = 0; $i < $dailyOrderCount; $i++) {
                $totalOrders++;
                $randSlot = $this->rand(1, 100);
                if ($randSlot <= 45) {
                    $orderHour = $this->rand(11, 13);
                    $orderMinute = $this->rand(0, 59);
                } elseif ($randSlot <= 90) {
                    $orderHour = $this->rand(18, 21);
                    $orderMinute = $this->rand(0, 59);
                } else {
                    $orderHour = $this->rand(8, 17);
                    $orderMinute = $this->rand(0, 59);
                }

                $orderTime = $currentDay->copy()->setTime($orderHour, $orderMinute);
                if ($orderTime->isFuture()) {
                    continue;
                }

                $currentShift = $orderHour < 15 ? $shift1 : $shift2;

                $isTakeAway = $this->rand(1, 100) > 70 || $tables->isEmpty();
                $table = $isTakeAway ? null : $this->randomItem($tables);

                $tablePrefix = $table ? str_replace('-', '', strtoupper(Str::slug($table->table_number))) : 'MD';
                $orderCode = sprintf('%s-%s-%02d', $tablePrefix, $yymmdd, $orderSeq++);

                $isCancelledOrder = $this->rand(1, 100) <= 4;

                $order = Order::create([
                    'order_code' => $orderCode,
                    'table_id' => $table?->id,
                    'employee_id' => $employee?->id,
                    'status' => $isCancelledOrder ? 'cancelled' : 'paid',
                    'subtotal' => 0,
                    'vat_amount' => 0,
                    'discount_amount' => 0,
                    'total' => 0,
                    'note' => $isCancelledOrder ? 'Khách bận việc đột xuất' : null,
                    'created_at' => $orderTime,
                    'updated_at' => $orderTime->copy()->addMinutes($this->rand(10, 45)),
                ]);

                $itemCount = $this->rand(1, 4);
                $selectedMenuItems = $this->randomItems($menuItems, min($itemCount, $menuItems->count()));

                $orderSubtotal = 0.0;
                $activeOrderItems = [];

                foreach ($selectedMenuItems as $menuItem) {
                    $itemQty = $this->rand(1, 3);
                    $itemUnitPrice = (float) $menuItem->price;
                    $itemSubtotal = $itemQty * $itemUnitPrice;

                    $isCancelledItem = ! $isCancelledOrder && $this->rand(1, 100) <= 3;

                    $orderItem = OrderItem::create([
                        'order_id' => $order->id,
                        'menu_item_id' => $menuItem->id,
                        'quantity' => $itemQty,
                        'unit_price' => $itemUnitPrice,
                        'subtotal' => $itemSubtotal,
                        'discount_amount' => 0,
                        'status' => ($isCancelledOrder || $isCancelledItem) ? 'cancelled' : 'served',
                        'cancellation_reason' => $isCancelledItem ? 'Khách đổi món khác' : ($isCancelledOrder ? 'Đơn hàng bị hủy' : null),
                        'cancelled_by_user_id' => ($isCancelledOrder || $isCancelledItem) ? $staffUser->id : null,
                        'cancelled_at' => ($isCancelledOrder || $isCancelledItem) ? $orderTime->copy()->addMinutes(3) : null,
                        'created_at' => $orderTime,
                        'updated_at' => $orderTime->copy()->addMinutes(5),
                    ]);

                    if (! $isCancelledOrder && ! $isCancelledItem) {
                        $orderSubtotal += $itemSubtotal;
                        $activeOrderItems[] = [
                            'item' => $orderItem,
                            'menuItem' => $menuItem,
                            'quantity' => $itemQty,
                            'unit_price' => $itemUnitPrice,
                            'subtotal' => $itemSubtotal,
                        ];
                    }
                }

                if ($isCancelledOrder || empty($activeOrderItems)) {
                    $order->update([
                        'subtotal' => $orderSubtotal,
                        'total' => $orderSubtotal,
                        'status' => 'cancelled',
                    ]);

                    continue;
                }

                $hasDiscount = $this->rand(1, 100) <= 10;
                $discountAmount = $hasDiscount ? round($orderSubtotal * ($this->rand(5, 10) / 100), 0) : 0.0;
                $orderTotal = max(0.0, $orderSubtotal - $discountAmount);

                $invoiceTime = $orderTime->copy()->addMinutes($this->rand(20, 60));

                $invoiceCode = 'INV-'.$dateStr.strtoupper(Str::random(4));
                $paymentMethod = $this->rand(1, 100) <= 55 ? 'cash' : ($this->rand(1, 100) <= 85 ? 'bank_transfer' : 'mixed');

                $receivedAmount = $paymentMethod === 'cash' ? (ceil($orderTotal / 10000) * 10000) : $orderTotal;
                $changeAmount = max(0.0, $receivedAmount - $orderTotal);

                $invoice = Invoice::create([
                    'invoice_code' => $invoiceCode,
                    'table_name' => $table ? $table->table_number : 'Mang Đi',
                    'payment_method' => $paymentMethod,
                    'subtotal_amount' => $orderSubtotal,
                    'discount_amount' => $discountAmount,
                    'vat_amount' => 0,
                    'total_amount' => $orderTotal,
                    'amount_received' => $receivedAmount,
                    'change_amount' => $changeAmount,
                    'issued_at' => $invoiceTime,
                    'created_at' => $invoiceTime,
                    'updated_at' => $invoiceTime,
                ]);

                $totalInvoices++;
                $totalRevenue += $orderTotal;

                $order->update([
                    'subtotal' => $orderSubtotal,
                    'discount_amount' => $discountAmount,
                    'total' => $orderTotal,
                    'invoice_id' => $invoice->id,
                    'status' => 'paid',
                ]);

                $allocatedDiscount = 0.0;
                $activeCount = count($activeOrderItems);

                foreach ($activeOrderItems as $idx => $activeItem) {
                    $itemDiscount = ($idx === $activeCount - 1)
                        ? round($discountAmount - $allocatedDiscount, 2)
                        : ($orderSubtotal > 0 ? round($discountAmount * ($activeItem['subtotal'] / $orderSubtotal), 2) : 0.0);
                    $allocatedDiscount += $itemDiscount;

                    InvoiceLine::create([
                        'invoice_id' => $invoice->id,
                        'order_item_id' => $activeItem['item']->id,
                        'menu_item_id' => $activeItem['menuItem']->id,
                        'name_snapshot' => $activeItem['menuItem']->name,
                        'quantity' => $activeItem['quantity'],
                        'unit_price' => $activeItem['unit_price'],
                        'subtotal' => $activeItem['subtotal'],
                        'discount_amount' => $itemDiscount,
                        'vat_rate' => 0,
                        'vat_amount' => 0,
                        'created_at' => $invoiceTime,
                        'updated_at' => $invoiceTime,
                    ]);
                }

                if ($paymentMethod === 'mixed') {
                    $halfTotal = round($orderTotal / 2, 0);
                    $remainTotal = $orderTotal - $halfTotal;

                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'method' => 'cash',
                        'amount' => $halfTotal,
                        'received_by' => $staffUser->id,
                        'created_at' => $invoiceTime,
                    ]);
                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'method' => 'bank_transfer',
                        'amount' => $remainTotal,
                        'reference' => 'MB'.$this->rand(10000000, 99999999),
                        'received_by' => $staffUser->id,
                        'created_at' => $invoiceTime,
                    ]);

                    $this->recordLedgerEntry('sale', $halfTotal, 'cash', $staffUser, $currentShift->id, $invoice->id, $order->id, $invoiceTime);
                    $this->recordLedgerEntry('sale', $remainTotal, 'bank_transfer', $staffUser, $currentShift->id, $invoice->id, $order->id, $invoiceTime);

                    if ($currentShift->id === $shift1->id) {
                        $shift1CashSales += $halfTotal;
                    } else {
                        $shift2CashSales += $halfTotal;
                    }
                } else {
                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'method' => $paymentMethod,
                        'amount' => $orderTotal,
                        'reference' => $paymentMethod === 'bank_transfer' ? ('MB'.$this->rand(10000000, 99999999)) : null,
                        'received_by' => $staffUser->id,
                        'created_at' => $invoiceTime,
                    ]);

                    $this->recordLedgerEntry('sale', $orderTotal, $paymentMethod, $staffUser, $currentShift->id, $invoice->id, $order->id, $invoiceTime);

                    if ($paymentMethod === 'cash') {
                        if ($currentShift->id === $shift1->id) {
                            $shift1CashSales += $orderTotal;
                        } else {
                            $shift2CashSales += $orderTotal;
                        }
                    }
                }

                $this->createStockExportVoucher($invoice, $activeOrderItems, $employee, $staffUser->id, $invoiceTime, $dateStr, $exportSeqCounter++);
                $totalExportVouchers++;
            }

            if ($shift1->status === 'closed') {
                $closingCash = 1500000 + $shift1CashSales;
                $diff = $this->rand(-1, 1) * 10000;
                $shift1->update([
                    'closing_cash' => $closingCash,
                    'actual_cash' => $closingCash + $diff,
                ]);
            }

            if ($shift2->status === 'closed') {
                $closingCash = 1500000 + $shift2CashSales;
                $diff = $this->rand(-1, 1) * 10000;
                $shift2->update([
                    'closing_cash' => $closingCash,
                    'actual_cash' => $closingCash + $diff,
                ]);
            }

            $progressBar->advance();
        }

        $progressBar->finish();
        $this->newLine(2);

        Cache::tags(['dashboard'])->flush();
        try {
            Cache::tags(['pos_promotions'])->flush();
        } catch (\Throwable $e) {
            // ignore cache driver without tags support
        }

        $this->table(
            ['Chỉ số thống kê', 'Giá trị phát sinh'],
            [
                ['Số ngày mô phỏng', $days.' ngày'],
                ['Tổng số đơn hàng tạo ra', number_format($totalOrders)],
                ['Tổng số hoá đơn bán hàng', number_format($totalInvoices)],
                ['Tổng doanh thu bán hàng', number_format($totalRevenue, 0, ',', '.').' đ'],
                ['Tổng số phiếu xuất kho tự động (PX-...)', number_format($totalExportVouchers)],
                ['Số ca làm việc (Shifts)', number_format(Shift::count())],
                ['Số lượt cọc & đặt bàn (Deposits)', number_format(Deposit::count())],
                ['Số bút toán sổ quỹ (MoneyLedger)', number_format(MoneyLedgerEntry::count())],
            ]
        );

        $this->info('Sinh dữ liệu mẫu thành công! Tất cả 13 trang báo cáo đã sẵn sàng dữ liệu.');

        return self::SUCCESS;
    }

    /** @phpstan-impure */
    private function rand(int $min, int $max): int
    {
        return $this->prng->nextInt($min, $max);
    }

    /**
     * @phpstan-impure
     *
     * @template T
     *
     * @param  Collection<int, T>  $items
     * @return T|null
     */
    private function randomItem(Collection $items)
    {
        if ($items->isEmpty()) {
            return null;
        }
        $idx = $this->prng->nextInt(0, $items->count() - 1);

        return $items->values()->get($idx);
    }

    /**
     * @phpstan-impure
     *
     * @template T
     *
     * @param  Collection<int, T>  $items
     * @return Collection<int, T>
     */
    private function randomItems(Collection $items, int $count): Collection
    {
        if ($items->isEmpty() || $count <= 0) {
            return collect();
        }
        $count = min($count, $items->count());
        $indices = range(0, $items->count() - 1);
        for ($i = count($indices) - 1; $i > 0; $i--) {
            $j = $this->prng->nextInt(0, $i);
            [$indices[$i], $indices[$j]] = [$indices[$j], $indices[$i]];
        }
        $selectedIndices = array_slice($indices, 0, $count);
        $values = $items->values();

        return collect($selectedIndices)->map(fn ($idx) => $values->get($idx));
    }

    private function ensureMasterData(): void
    {
        if (User::count() === 0) {
            $this->info('Khởi tạo tài khoản và phân quyền mẫu...');
            (new AuthorizationSeeder)->run();
        }

        if (Table::count() === 0) {
            $this->info('Khởi tạo danh sách bàn mẫu...');
            (new DefaultTableSeeder)->run();
        }

        if (MenuItem::count() === 0 || Ingredient::count() === 0) {
            $this->info('Khởi tạo danh mục món, nguyên liệu và công thức pha chế...');
            (new DefaultMenuAndInventorySeeder)->run();
        }

        $user = User::first();
        if ($user && Employee::count() === 0) {
            Employee::create([
                'user_id' => $user->id,
                'employee_code' => 'NV001',
                'full_name' => $user->name,
                'position' => 'Quản lý cửa hàng',
                'is_active' => true,
            ]);
        }

        Supplier::firstOrCreate(
            ['name' => 'Công Ty TNHH Nông Sản & Trái Cây Tươi Xanh'],
            [
                'contact_person' => 'Nguyễn Văn Minh',
                'phone' => '0912345678',
                'email' => 'nongsanxanh@example.com',
                'address' => 'Hà Nội',
                'is_active' => true,
            ]
        );

        Supplier::firstOrCreate(
            ['name' => 'Đại Lý Phân Phối Đồ Uống & Nước Giải Khát'],
            [
                'contact_person' => 'Trần Thị Hằng',
                'phone' => '0987654321',
                'email' => 'giaikhat@example.com',
                'address' => 'Hà Nội',
                'is_active' => true,
            ]
        );
    }

    private function createInitialStockVouchers(CarbonInterface $startDate): void
    {
        $supplier1 = Supplier::first();
        $employee = Employee::first();
        $user = User::first();
        $ingredients = Ingredient::all();

        if ($ingredients->isEmpty()) {
            return;
        }

        $dateStr = $startDate->format('Ymd');
        $voucherCode = "PN-{$dateStr}-001";

        $voucher = StockVoucher::firstOrCreate(
            ['voucher_code' => $voucherCode],
            [
                'type' => 'import',
                'employee_id' => $employee?->id,
                'supplier_id' => $supplier1?->id,
                'is_paid' => true,
                'transacted_at' => $startDate,
                'note' => 'Nhập kho ban đầu cho toàn bộ nguyên vật liệu',
                'created_by' => $user?->id,
            ]
        );

        // Duyệt từng nguyên liệu, thiết lập hạn sử dụng phong phú cho ExpiringReport & LowStockReport
        foreach ($ingredients as $idx => $ing) {
            $baseQty = 50000.0; // Đủ dồi dào để xuất trong 30 ngày mà không bị âm

            // 1 sản phẩm hết hạn (quá hạn 5 ngày trước)
            if ($idx === 0) {
                $expiryDate = now()->subDays(5)->toDateString();
            } elseif ($idx === 1) {
                // 1 sản phẩm sắp hết hạn trong 3 ngày
                $expiryDate = now()->addDays(3)->toDateString();
            } elseif ($idx === 2) {
                // 1 sản phẩm sắp hết hạn trong 6 ngày
                $expiryDate = now()->addDays(6)->toDateString();
            } else {
                $expiryDate = now()->addMonths(6)->toDateString();
            }

            $unitPrice = (float) $ing->cost_price ?: 10000.0;

            StockVoucherItem::updateOrCreate(
                [
                    'voucher_id' => $voucher->id,
                    'ingredient_id' => $ing->id,
                ],
                [
                    'quantity' => $baseQty,
                    'unit_price' => $unitPrice,
                    'expiry_date' => $expiryDate,
                    'quantity_remaining' => $baseQty,
                ]
            );

            $ing->update(['stock_quantity' => $baseQty]);
        }
    }

    /**
     * @param  array<int, array<string, mixed>>  $activeOrderItems
     */
    private function createStockExportVoucher(
        Invoice $invoice,
        array $activeOrderItems,
        ?Employee $employee,
        int $userId,
        CarbonInterface $invoiceTime,
        string $dateStr,
        int $seq
    ): void {
        $menuQuantities = [];
        foreach ($activeOrderItems as $itemRow) {
            $mId = (int) $itemRow['menuItem']->id;
            $menuQuantities[$mId] = ($menuQuantities[$mId] ?? 0) + (int) $itemRow['quantity'];
        }

        if (empty($menuQuantities)) {
            return;
        }

        $recipes = ProductRecipe::whereIn('menu_item_id', array_keys($menuQuantities))->get();
        if ($recipes->isEmpty()) {
            return;
        }

        $ingredientTotals = [];
        foreach ($recipes as $recipe) {
            $used = (float) $recipe->amount * (int) ($menuQuantities[$recipe->menu_item_id] ?? 0);
            $ingredientTotals[$recipe->ingredient_id] = ($ingredientTotals[$recipe->ingredient_id] ?? 0.0) + $used;
        }

        if (empty($ingredientTotals)) {
            return;
        }

        $voucherCode = sprintf('PX-%s-%03d', $dateStr, $seq);

        $voucher = StockVoucher::create([
            'voucher_code' => $voucherCode,
            'type' => 'export',
            'employee_id' => $employee?->id,
            'transacted_at' => $invoiceTime,
            'note' => 'Xuất kho tự động cho Hoá đơn '.$invoice->invoice_code,
            'created_by' => $userId,
        ]);

        foreach ($ingredientTotals as $ingredientId => $totalUsed) {
            $voucher->items()->create([
                'ingredient_id' => $ingredientId,
                'quantity' => -$totalUsed, // số lượng âm theo chuẩn của CheckoutService
                'unit_price' => null,
            ]);

            Ingredient::where('id', $ingredientId)->decrement('stock_quantity', $totalUsed);

            // Giảm quantity_remaining của lô nhập tương ứng theo FIFO
            $importLot = StockVoucherItem::where('ingredient_id', $ingredientId)
                ->where('quantity_remaining', '>', 0)
                ->orderBy('id', 'asc')
                ->first();

            if ($importLot) {
                $newRemaining = max(0.0, (float) $importLot->quantity_remaining - $totalUsed);
                $importLot->update(['quantity_remaining' => $newRemaining]);
            }
        }
    }

    /**
     * @param  Collection<int, Table>  $tables
     * @param  Collection<int, MenuItem>  $menuItems
     */
    private function createReservationsAndDeposits(
        CarbonInterface $currentDay,
        $tables,
        $menuItems,
        User $staffUser,
        Shift $shift,
        ?Employee $employee,
        string $dateStr,
        int &$exportSeqCounter,
        int &$totalInvoices,
        float &$totalRevenue,
        int &$totalExportVouchers,
        float &$shiftCashSales
    ): void {
        if ($tables->isEmpty()) {
            return;
        }

        $names = ['Anh Tuấn', 'Chị Hương', 'Anh Dũng', 'Chị Mai', 'Anh Hoàng', 'Chị Lan', 'Anh Nam'];
        $resCount = $this->rand(1, 2);

        for ($r = 0; $r < $resCount; $r++) {
            $resTable = $this->randomItem($tables);
            if (! $resTable) {
                continue;
            }
            $resTime = $currentDay->copy()->setTime($this->rand(18, 20), $this->rand(0, 3) * 15);
            $resName = $names[$this->rand(0, count($names) - 1)];
            $resPhone = '09'.$this->rand(10000000, 99999999);

            $depositAmounts = [100000, 200000, 500000];
            $depositAmount = $depositAmounts[$this->rand(0, 2)];
            $method = $this->rand(1, 100) <= 60 ? 'bank_transfer' : 'cash';

            // Phân bổ trạng thái cọc
            $randStatus = $this->rand(1, 100);
            if ($currentDay->isToday() && $resTime->isFuture()) {
                $status = 'held';
                $resolvedAt = null;
                $orderStatus = 'reserved';
            } elseif ($randStatus <= 70) {
                $status = 'applied';
                $resolvedAt = $resTime;
                $orderStatus = 'paid';
            } elseif ($randStatus <= 85) {
                $status = 'refunded';
                $resolvedAt = $resTime->copy()->subHours(2);
                $orderStatus = 'cancelled';
                $this->recordLedgerEntry('deposit_refund', $depositAmount, $method, $staffUser, $shift->id, null, null, $resolvedAt);
            } else {
                $status = 'forfeited';
                $resolvedAt = $resTime;
                $orderStatus = 'cancelled';
            }

            $order = Order::create([
                'order_code' => sprintf('%s-%s-RES%02d', str_replace('-', '', strtoupper(Str::slug($resTable->table_number))), $currentDay->format('ymd'), $r + 1),
                'table_id' => $resTable->id,
                'employee_id' => $employee?->id,
                'status' => $orderStatus,
                'reservation_name' => $resName,
                'reservation_phone' => $resPhone,
                'reservation_time' => $resTime,
                'reservation_note' => 'Khách đặt bàn trước kèm cọc',
                'subtotal' => 0,
                'total' => 0,
                'created_at' => $resTime->copy()->subHours($this->rand(4, 24)),
            ]);

            Deposit::create([
                'order_id' => $order->id,
                'amount' => $depositAmount,
                'method' => $method,
                'reference' => $method === 'bank_transfer' ? ('MB'.$this->rand(10000000, 99999999)) : null,
                'status' => $status,
                'received_by_user_id' => $staffUser->id,
                'resolved_by_user_id' => $status !== 'held' ? $staffUser->id : null,
                'resolved_at' => $resolvedAt,
                'note' => 'Tiền cọc giữ bàn '.$resTable->table_number,
                'created_at' => $order->created_at,
            ]);

            $this->recordLedgerEntry('deposit', $depositAmount, $method, $staffUser, $shift->id, null, $order->id, $order->created_at);

            // Nếu đơn đặt bàn đã đến và thanh toán (applied) -> sinh món, hoá đơn, trừ kho hợp lệ
            if ($orderStatus === 'paid' && $menuItems->isNotEmpty()) {
                $selectedItems = $this->randomItems($menuItems, min(2, $menuItems->count()));
                $subtotal = 0.0;
                $activeOrderItems = [];

                foreach ($selectedItems as $menuItem) {
                    $qty = $this->rand(1, 2);
                    $price = (float) $menuItem->price;
                    $itemSub = $qty * $price;
                    $subtotal += $itemSub;

                    $orderItem = OrderItem::create([
                        'order_id' => $order->id,
                        'menu_item_id' => $menuItem->id,
                        'quantity' => $qty,
                        'unit_price' => $price,
                        'subtotal' => $itemSub,
                        'discount_amount' => 0,
                        'status' => 'served',
                        'created_at' => $resTime,
                        'updated_at' => $resTime->copy()->addMinutes(10),
                    ]);

                    $activeOrderItems[] = [
                        'item' => $orderItem,
                        'menuItem' => $menuItem,
                        'quantity' => $qty,
                        'unit_price' => $price,
                        'subtotal' => $itemSub,
                    ];
                }

                $invoiceTime = $resTime->copy()->addMinutes($this->rand(30, 90));
                $invoiceCode = 'INV-'.$dateStr.strtoupper(Str::random(4));

                $invoice = Invoice::create([
                    'invoice_code' => $invoiceCode,
                    'table_name' => $resTable->table_number,
                    'payment_method' => $method,
                    'subtotal_amount' => $subtotal,
                    'discount_amount' => 0,
                    'vat_amount' => 0,
                    'total_amount' => $subtotal,
                    'deposit_amount' => $depositAmount,
                    'amount_received' => $subtotal,
                    'change_amount' => 0,
                    'issued_at' => $invoiceTime,
                    'created_at' => $invoiceTime,
                    'updated_at' => $invoiceTime,
                ]);

                $order->update([
                    'subtotal' => $subtotal,
                    'total' => $subtotal,
                    'invoice_id' => $invoice->id,
                ]);

                foreach ($activeOrderItems as $activeItem) {
                    InvoiceLine::create([
                        'invoice_id' => $invoice->id,
                        'order_item_id' => $activeItem['item']->id,
                        'menu_item_id' => $activeItem['menuItem']->id,
                        'name_snapshot' => $activeItem['menuItem']->name,
                        'quantity' => $activeItem['quantity'],
                        'unit_price' => $activeItem['unit_price'],
                        'subtotal' => $activeItem['subtotal'],
                        'discount_amount' => 0,
                        'vat_rate' => 0,
                        'vat_amount' => 0,
                        'created_at' => $invoiceTime,
                        'updated_at' => $invoiceTime,
                    ]);
                }

                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => $method,
                    'amount' => $subtotal,
                    'received_by' => $staffUser->id,
                    'created_at' => $invoiceTime,
                ]);

                $this->recordLedgerEntry('sale', $subtotal, $method, $staffUser, $shift->id, $invoice->id, $order->id, $invoiceTime);

                if ($method === 'cash') {
                    $shiftCashSales += $subtotal;
                }

                $this->createStockExportVoucher($invoice, $activeOrderItems, $employee, $staffUser->id, $invoiceTime, $dateStr, $exportSeqCounter++);

                $totalInvoices++;
                $totalRevenue += $subtotal;
                $totalExportVouchers++;
            }
        }
    }

    private function recordLedgerEntry(
        string $type,
        float $amount,
        string $method,
        User $actor,
        int $shiftId,
        ?int $invoiceId,
        ?int $orderId,
        CarbonInterface $occurredAt
    ): void {
        MoneyLedgerEntry::create([
            'direction' => $type === 'deposit_refund' ? 'out' : 'in',
            'type' => $type,
            'amount' => $amount,
            'method' => $method,
            'actor_id' => $actor->id,
            'shift_id' => $shiftId,
            'invoice_id' => $invoiceId,
            'order_id' => $orderId,
            'occurred_at' => $occurredAt,
            'warning_flags' => [],
            'created_at' => $occurredAt,
            'updated_at' => $occurredAt,
        ]);
    }
}
