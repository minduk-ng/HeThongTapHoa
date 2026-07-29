<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Events\TableTransferred;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use App\Models\Deposit;
use App\Services\OrderActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;

class POSController extends Controller
{
    public function index(Request $request)
    {
        $isLocal = app()->environment('local');

        $loadTables = function () {
            $tables = Table::with(['mergedIntoTable', 'activeOrders.items' => function ($query) {
                $query->where('status', '!=', 'cancelled')->with('menuItem');
            }])->where('status', '!=', 'maintenance')->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();

            $tables->each(function ($table) use ($tables) {
                if ($table->merged_into_table_id || $tables->contains('merged_into_table_id', $table->id)) {
                    $groupId = $table->merged_into_table_id ?? $table->id;
                    $allGroupTableIds = $tables->filter(fn ($t) => $t->id == $groupId || $t->merged_into_table_id == $groupId)->pluck('id');
                    $allGroupOrders = Order::with(['items' => function ($query) {
                        $query->where('status', '!=', 'cancelled')->with('menuItem');
                    }])->whereIn('table_id', $allGroupTableIds)->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->get();
                    $table->setRelation('activeOrders', $allGroupOrders);
                    $table->setRelation('activeOrder', $allGroupOrders->first());
                }
            });

            $result = $tables->values()->toArray();

            // Inject virtual "Mang đi" table with takeaway orders (table_id IS NULL)
            $takeawayOrders = Order::with(['items' => function ($query) {
                $query->where('status', '!=', 'cancelled')->with('menuItem');
            }])->whereNull('table_id')
                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                ->get();

            array_unshift($result, [
                'id' => 0,
                'table_number' => 'Mang đi',
                'area' => 'Mang đi',
                'capacity' => 0,
                'status' => $takeawayOrders->isNotEmpty() ? 'occupied' : 'available',
                'merged_into_table_id' => null,
                'merged_into_table' => null,
                'reservation_time' => null,
                'reservation_name' => null,
                'reservation_phone' => null,
                'reservation_note' => null,
                'active_orders' => $takeawayOrders->toArray(),
                'active_order' => $takeawayOrders->first()?->toArray(),
            ]);

            return $result;
        };

        if ($isLocal) {
            $tables = $loadTables();
        } else {
            try {
                $tables = \Illuminate\Support\Facades\Cache::tags(['pos_tables'])->remember('pos_tables_list', 1800, $loadTables);
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Redis connection failed in POSController tables loading: " . $e->getMessage());
                $tables = $loadTables();
            }
        }

        $loadCategories = function () {
            return MenuCategory::orderBy('sort_order', 'asc')->get()->toArray();
        };

        $loadProducts = function () {
            $prods = MenuItem::with(['category', 'recipes.ingredient'])->where('is_available', true)->get();

            $prods->transform(function ($product) {
                if ($product->recipes && $product->recipes->count() > 0) {
                    $possibleServings = [];
                    foreach ($product->recipes as $recipe) {
                        if ($recipe->ingredient && (float) $recipe->amount > 0) {
                            $stock = (float) $recipe->ingredient->stock_quantity;
                            $possible = (int) floor($stock / (float) $recipe->amount);
                            $possibleServings[] = max(0, $possible);
                        }
                    }
                    $product->max_servings = count($possibleServings) > 0 ? min($possibleServings) : 999;
                } else {
                    $product->max_servings = 999;
                }

                return $product;
            });

            return $prods->toArray();
        };

        if ($isLocal) {
            $categories = $loadCategories();
            $products = $loadProducts();
        } else {
            try {
                $categories = \Illuminate\Support\Facades\Cache::tags(['pos_products_and_categories'])->remember('pos_categories', 86400, $loadCategories);
                $products = \Illuminate\Support\Facades\Cache::tags(['pos_products_and_categories'])->remember('pos_products', 86400, $loadProducts);
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Redis connection failed in POSController products loading: " . $e->getMessage());
                $categories = $loadCategories();
                $products = $loadProducts();
            }
        }

        return Inertia::render('staff/pos/POSManager', [
            'tables' => $tables,
            'categories' => $categories,
            'products' => $products,
        ]);
    }

    private function generateOrderCode(?Table $table): string
    {
        $normalized = $table ? str_replace('-', '', strtoupper(Str::slug($table->table_number))) : 'MD';
        $dateStr = date('ymd');
        $prefix = "{$normalized}-{$dateStr}-";
        
        $maxSeq = Order::where('order_code', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('order_code')
            ->map(fn ($code) => (int) substr($code, strlen($prefix)))
            ->max() ?? 0;
            
        $seq = str_pad($maxSeq + 1, 2, '0', STR_PAD_LEFT);
        return $prefix . $seq;
    }

    public function cancelReservation(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'deposit_resolution' => 'nullable|in:refund,forfeit',
            'note' => 'nullable|string',
            'idempotency_key' => 'nullable|string',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:cancel_reservation:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return response()->json(['success' => true]);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with(['table', 'deposits' => fn ($q) => $q->where('status', 'held')])->findOrFail($validated['order_id']);

                if ($order->status !== 'reserved') {
                    throw new \Exception('Chỉ có thể hủy đơn đặt bàn', 422);
                }

                $heldDeposits = $order->deposits;
                $hasHeldDeposits = $heldDeposits->sum('amount') > 0;

                if ($hasHeldDeposits && empty($validated['deposit_resolution'])) {
                    throw new \Exception('Vui lòng chọn hướng xử lý cọc', 422);
                }

                $order->update(['status' => 'cancelled']);

                if ($hasHeldDeposits) {
                    foreach ($heldDeposits as $deposit) {
                        $deposit->update([
                            'status' => $validated['deposit_resolution'] === 'refund' ? 'refunded' : 'forfeited',
                            'resolved_by_user_id' => $request->user()?->id,
                            'resolved_at' => now(),
                            'note' => $validated['note'] ?? null,
                        ]);
                    }
                }

                $table = $order->table;
                if ($table && $table->status === 'reserved') {
                    $hasOtherActiveOrders = $table->orders()
                        ->where('id', '!=', $order->id)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'served', 'completed', 'reserved'])
                        ->exists();

                    if (! $hasOtherActiveOrders) {
                        $table->update([
                            'status' => 'available',
                            'reservation_name' => null,
                            'reservation_phone' => null,
                            'reservation_time' => null,
                            'reservation_note' => null,
                        ]);
                    }
                }

                OrderActivityLogger::log($order, 'reservation_cancelled', $request->user()?->id, array_filter([
                    'resolution' => $hasHeldDeposits ? $validated['deposit_resolution'] : null,
                    'note' => $validated['note'] ?? null,
                ]));

                return $table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            Log::error('POS cancelReservation error: '.$e->getMessage());
            $status = $e->getCode() === 422 ? 422 : 500;
            return response()->json(['message' => $e->getMessage()], $status);
        }
    }

    public function checkInReservation(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'idempotency_key' => 'nullable|string',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:check_in_reservation:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return response()->json(['success' => true]);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with('table')->findOrFail($validated['order_id']);

                if ($order->status !== 'reserved') {
                    throw new \Exception('Đơn này không phải đơn đặt bàn chờ check-in', 422);
                }

                $order->update(['status' => 'draft']);

                $table = $order->table;
                if ($table) {
                    $table->update([
                        'status' => 'occupied',
                        'reservation_name' => null,
                        'reservation_phone' => null,
                        'reservation_time' => null,
                        'reservation_note' => null,
                    ]);
                }

                OrderActivityLogger::log($order, 'checked_in', $request->user()?->id);

                return $table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            if ($e->getCode() === 422) {
                return response()->json(['error' => $e->getMessage()], 422);
            }
            Log::error('POS checkInReservation error: '.$e->getMessage());
            return response()->json(['error' => 'Check-in thất bại: ' . $e->getMessage()], 500);
        }
    }

    public function reserve(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|integer|min:1|exists:tables,id',
            'reservation_name' => 'required|string|max:100',
            'reservation_phone' => 'required|string|max:20',
            'reservation_time' => 'required|date',
            'reservation_note' => 'nullable|string',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => 'exists:menu_items,id',
            'items.*.quantity' => 'integer|min:1',
            'items.*.note' => 'nullable|string',
            'deposit' => 'nullable|array',
            'deposit.amount' => 'required_with:deposit|numeric|min:1',
            'deposit.method' => 'required_with:deposit|in:cash,bank_transfer',
            'idempotency_key' => 'nullable|string',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:reserve:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return response()->json(['success' => true]);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $table = Table::findOrFail($validated['table_id']);
                
                $subtotal = 0;
                $vatAmount = 0;
                $total = 0;
                $orderItems = [];

                if (!empty($validated['items'])) {
                    foreach ($validated['items'] as $itemData) {
                        $menuItem = MenuItem::find($itemData['menu_item_id']);
                        if (!$menuItem) continue;
                        
                        $qty = $itemData['quantity'];
                        $price = $menuItem->price;
                        $itemSubtotal = $qty * $price;
                        
                        // VAT calculation similar to sendToKitchen logic if applicable
                        // In POS flow, if sendToKitchen expects VAT, we calculate it here based on vat_rate
                        // Assuming vat_rate exists or is 0
                        $vatRate = $menuItem->vat_rate ?? 0;
                        $itemVat = $itemSubtotal * ($vatRate / 100);
                        
                        $subtotal += $itemSubtotal;
                        $vatAmount += $itemVat;
                        $total += $itemSubtotal + $itemVat;

                        $orderItems[] = [
                            'menu_item_id' => $menuItem->id,
                            'quantity' => $qty,
                            'unit_price' => $price,
                            'subtotal' => $itemSubtotal,
                            'note' => $itemData['note'] ?? null,
                            'status' => 'pending'
                        ];
                    }
                }

                $employeeId = DB::table('employees')->where('id', $request->user()?->id)->exists() ? $request->user()->id : null;
                $orderCode = $this->generateOrderCode($table);
                
                $order = Order::create([
                    'order_code' => $orderCode,
                    'table_id' => $table->id,
                    'employee_id' => $employeeId,
                    'subtotal' => $subtotal,
                    'vat_amount' => $vatAmount,
                    'total' => $total,
                    'status' => 'reserved',
                    'reservation_name' => $validated['reservation_name'],
                    'reservation_phone' => $validated['reservation_phone'],
                    'reservation_time' => $validated['reservation_time'],
                    'reservation_note' => $validated['reservation_note'] ?? null,
                ]);

                foreach ($orderItems as $item) {
                    $item['order_id'] = $order->id;
                    OrderItem::create($item);
                }

                $depositTotal = 0;
                if (!empty($validated['deposit'])) {
                    Deposit::create([
                        'order_id' => $order->id,
                        'amount' => $validated['deposit']['amount'],
                        'method' => $validated['deposit']['method'],
                        'status' => 'held',
                        'received_by_user_id' => $request->user()?->id,
                    ]);
                    $depositTotal = $validated['deposit']['amount'];
                    
                    OrderActivityLogger::log($order, 'deposit_received', $request->user()?->id, [
                        'amount' => $validated['deposit']['amount'],
                        'method' => $validated['deposit']['method']
                    ]);
                }

                OrderActivityLogger::log($order, 'reserved', $request->user()?->id, [
                    'name' => $validated['reservation_name'],
                    'time' => $validated['reservation_time'],
                ]);

                if ($table->status === 'available') {
                    $table->update([
                        'status' => 'reserved',
                        'reservation_name' => $validated['reservation_name'],
                        'reservation_phone' => $validated['reservation_phone'],
                        'reservation_time' => $validated['reservation_time'],
                        'reservation_note' => $validated['reservation_note'] ?? null,
                    ]);
                }

                return ['order' => $order, 'deposit_total' => $depositTotal, 'table' => $table];
            });
            
            Cache::tags(['pos_tables'])->flush();

            $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result['table']));

            return response()->json([
                'success' => true,
                'order' => array_merge($result['order']->toArray(), ['deposit_total' => $result['deposit_total']])
            ]);

        } catch (\Throwable $e) {
            Log::error('POS reserve error: '.$e->getMessage());
            return response()->json(['error' => 'Đặt bàn thất bại: ' . $e->getMessage()], 500);
        }
    }

    public function deposit(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'amount' => 'required|numeric|min:1',
            'method' => 'required|in:cash,bank_transfer',
            'idempotency_key' => 'nullable|string',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:deposit:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return response()->json(['success' => true]);
            }
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with('table')->findOrFail($validated['order_id']);

                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Không thể đặt cọc cho đơn đã thanh toán hoặc đã hủy', 422);
                }

                $order->deposits()->create([
                    'amount' => $validated['amount'],
                    'method' => $validated['method'],
                    'status' => 'held',
                    'received_by_user_id' => $request->user()?->id,
                ]);

                OrderActivityLogger::log($order, 'deposit_received', $request->user()?->id);

                return $order->table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            Log::error('POS deposit error: '.$e->getMessage());
            $status = $e->getCode() === 422 ? 422 : 500;
            return response()->json(['message' => $e->getMessage()], $status);
        }
    }

    public function sendToKitchen(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'nullable|exists:tables,id',
            'order_id' => 'nullable|exists:orders,id',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => 'required_with:items|exists:menu_items,id',
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
            'items.*.note' => 'nullable|string|max:255',
            'reduced_items' => 'nullable|array',
            'reduced_items.*.order_item_id' => 'required_with:reduced_items|exists:order_items,id',
            'reduced_items.*.reduce_quantity' => 'required_with:reduced_items|integer|min:1',
            'reduced_items.*.cancellation_reason' => 'required_with:reduced_items|string|max:255',
            'reduced_items.*.note' => 'nullable|string|max:255',
            'subtotal' => 'required|numeric|min:0',
            'vat_amount' => 'required|numeric|min:0',
            'total' => 'required|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:send_to_kitchen:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate sendToKitchen request suppressed: {$request->input('idempotency_key')}");

                return back()->with('success', 'Đơn hàng đã được gửi xuống Bếp!');
            }
        }

        try {
            $primaryOrder = DB::transaction(function () use ($validated, $request) {
                $table = !empty($validated['table_id']) ? Table::findOrFail($validated['table_id']) : null;

                // 1. Handle staged reductions
                if (! empty($validated['reduced_items'])) {
                    foreach ($validated['reduced_items'] as $red) {
                        $orderItem = OrderItem::lockForUpdate()->find($red['order_item_id']);
                        if (! $orderItem || $orderItem->status === 'completed' || $orderItem->order?->status === 'completed') {
                            continue;
                        }

                        $reduceQty = min($orderItem->quantity, (int) $red['reduce_quantity']);
                        $newQty = $orderItem->quantity - $reduceQty;
                        $reasonStr = $red['cancellation_reason'].(! empty($red['note']) ? ': '.$red['note'] : '');

                        if ($newQty <= 0) {
                            $orderItem->update([
                                'quantity' => 0,
                                'subtotal' => 0,
                                'status' => 'cancelled',
                                'cancellation_reason' => $reasonStr,
                                'cancelled_by_user_id' => $request->user()?->id,
                                'cancelled_at' => now(),
                            ]);
                        } else {
                            $orderItem->update([
                                'quantity' => $newQty,
                                'subtotal' => $newQty * $orderItem->unit_price,
                                'note' => ($orderItem->note ? $orderItem->note.' | ' : '')."[Giảm {$reduceQty} phần: {$reasonStr}]",
                            ]);
                        }

                        $parentOrder = $orderItem->order;
                        if ($parentOrder) {
                            $activeSubtotal = (float) $parentOrder->items()->where('status', '!=', 'cancelled')->sum('subtotal');
                            $parentOrder->update([
                                'subtotal' => $activeSubtotal,
                                'total' => $activeSubtotal + (float) $parentOrder->vat_amount,
                            ]);

                            if ($parentOrder->items()->where('status', '!=', 'cancelled')->count() === 0) {
                                $parentOrder->update(['status' => 'cancelled']);
                            }

                            // Audit log: item_cancel
                            OrderActivityLogger::log($parentOrder, 'item_cancel', $request->user()?->id, [
                                'items' => [[
                                    'name' => $orderItem->menuItem?->name ?? 'Món',
                                    'qty_reduced' => $reduceQty,
                                    'reason' => $reasonStr,
                                ]],
                            ]);
                        }
                    }
                }

                // 2. Handle new items ticket creation
                $createdOrder = null;
                $wasDraft = false;
                if (! empty($validated['items'])) {
                    if (! empty($validated['order_id'])) {
                        $createdOrder = Order::lockForUpdate()->findOrFail($validated['order_id']);
                        $wasDraft = $createdOrder->status === 'draft';
                        
                        if ($wasDraft) {
                            $createdOrder->items()->delete();
                            $createdOrder->update([
                                'subtotal' => $validated['subtotal'],
                                'vat_amount' => $validated['vat_amount'],
                                'total' => $validated['total'],
                                'status' => 'pending',
                            ]);
                        } else {
                            $createdOrder->update([
                                'subtotal' => $createdOrder->subtotal + $validated['subtotal'],
                                'vat_amount' => $createdOrder->vat_amount + $validated['vat_amount'],
                                'total' => $createdOrder->total + $validated['total'],
                                'status' => 'pending',
                                'has_additional_items' => true,
                            ]);
                        }
                    } else {
                        $hasPreviousOrders = $table
                            ? Order::where('table_id', $table->id)
                                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                                ->exists()
                            : false;

                        $orderCode = $this->generateOrderCode($table);
                        $employeeId = DB::table('employees')->where('id', $request->user()?->id)->exists() ? $request->user()->id : null;
                        
                        $createdOrder = Order::create([
                            'order_code' => $orderCode,
                            'table_id' => $table?->id,
                            'employee_id' => $employeeId,
                            'subtotal' => $validated['subtotal'],
                            'vat_amount' => $validated['vat_amount'],
                            'total' => $validated['total'],
                            'status' => 'pending',
                            'has_additional_items' => $hasPreviousOrders,
                        ]);
                    }

                    if ($table) {
                        $table->update(['status' => 'occupied']);
                    }

                    foreach ($validated['items'] as $item) {
                        OrderItem::create([
                            'order_id' => $createdOrder->id,
                            'menu_item_id' => $item['menu_item_id'],
                            'quantity' => $item['quantity'],
                            'unit_price' => $item['unit_price'],
                            'subtotal' => $item['quantity'] * $item['unit_price'],
                            'note' => $item['note'] ?? null,
                        ]);
                    }

                    // Audit log
                    $userId = $request->user()?->id;
                    $itemMeta = collect($validated['items'])->map(fn ($i) => [
                        'name' => MenuItem::find($i['menu_item_id'])?->name ?? 'Món',
                        'qty' => $i['quantity'],
                        'price' => $i['unit_price'],
                    ])->toArray();

                    if (empty($validated['order_id']) || $wasDraft) {
                        if (empty($validated['order_id'])) {
                            OrderActivityLogger::log($createdOrder, 'created', $userId, [
                                'items' => $itemMeta,
                                'total' => $validated['total'],
                                'item_count' => count($validated['items']),
                            ]);
                        }
                        OrderActivityLogger::log($createdOrder, 'sent_kitchen', $userId, [
                            'items' => collect($validated['items'])->map(fn ($i) => ['name' => MenuItem::find($i['menu_item_id'])?->name ?? 'Món', 'qty' => $i['quantity']])->toArray(),
                            'is_additional' => false,
                        ]);
                    } else {
                        OrderActivityLogger::log($createdOrder, 'additional', $userId, [
                            'items' => $itemMeta,
                            'total_added' => $validated['total'],
                        ]);
                    }
                }

                return $createdOrder ?? ($table ? Order::where('table_id', $table->id)->latest()->first() : null) ?? new Order;
            });

            $this->safeDispatch(fn () => OrderSentToKitchen::dispatch($primaryOrder));

            return back()->with('success', 'Đã cập nhật đơn order và gửi xuống bếp chế biến thành công!');
        } catch (\Throwable $e) {
            Log::error('POS sendToKitchen DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Gửi đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'payment_method' => 'required|in:cash,bank_transfer',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'required|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:checkout:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate checkout request suppressed: {$request->input('idempotency_key')}");

                return back()->with('success', 'Thanh toán đã được ghi nhận thành công!');
            }
        }

        try {
            $order = null;
            $totalAmount = 0;
            $result = DB::transaction(function () use ($validated, $request, &$order, &$totalAmount) {
                $order = Order::with('items')->lockForUpdate()->findOrFail($validated['order_id']);

                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Đơn hàng này đã được thanh toán hoặc đã hủy.');
                }

                if ($order->status === 'reserved') {
                    throw new \Exception('Đơn đặt bàn chưa check-in, không thể thanh toán', 422);
                }

                // Check if this order is still pending/processing in kitchen
                $hasUncompletedItems = $order->items->contains(function ($item) {
                    return in_array($item->status, ['pending', 'processing']);
                });

                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if ($hasUncompletedItems && ! $canBypass) {
                    throw new \Exception('Bạn không có quyền duyệt khẩn cấp thanh toán khi món chưa được Bếp hoàn tất.');
                }

                // Mark only this order as paid/completed
                $order->update(['status' => 'paid']);

                $targetTable = $order->table_id ? Table::findOrFail($order->table_id) : null;

                // Determine primary group table ID and all tables in this merged group
                if ($targetTable) {
                    $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                    $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                } else {
                    $primaryId = null;
                    $allGroupTables = collect();
                }
                $allGroupTableIds = $allGroupTables->pluck('id');

                // Compute total amount and table name string for invoice record
                $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                $tableNameStr = $targetTable
                    ? ($subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number)
                    : 'Mang đi';

                $totalAmount = $order->items->sum(function ($item) {
                    return (float) $item->quantity * (float) $item->unit_price;
                });

                $depositTotal = (float) $order->deposits()->where('status', 'held')->sum('amount');
                $payable = max(0, $totalAmount - $depositTotal);
                $depositRefund = max(0, $depositTotal - $totalAmount);

                if ($validated['amount_received'] < $payable) {
                    throw new \Exception('Số tiền khách đưa không đủ.');
                }

                // Create Invoice record and link to order
                $invoiceCode = 'INV-'.date('Ymd').strtoupper(Str::random(4));
                $invoice = Invoice::create([
                    'invoice_code' => $invoiceCode,
                    'table_name' => $tableNameStr,
                    'total_amount' => $totalAmount,
                    'deposit_amount' => $depositTotal,
                    'payment_method' => $validated['payment_method'],
                    'amount_received' => $validated['amount_received'],
                    'change_amount' => $validated['change_amount'],
                    'issued_at' => now(),
                ]);

                $order->update(['invoice_id' => $invoice->id]);

                if ($depositTotal > 0) {
                    $order->deposits()->where('status', 'held')->update([
                        'status' => 'applied',
                        'resolved_at' => now(),
                        'resolved_by_user_id' => $request->user()?->id,
                    ]);
                }

                // Audit log: checkout
                OrderActivityLogger::log($order, 'checkout', $request->user()?->id, [
                    'invoice_code' => $invoiceCode,
                    'payment_method' => $validated['payment_method'],
                    'total' => $totalAmount,
                ]);

                $hasOtherActive = $allGroupTableIds->isNotEmpty()
                    ? Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->exists()
                    : false;

                if (!$hasOtherActive && $targetTable) {
                    $reservedOrder = Order::whereIn('table_id', $allGroupTableIds)
                        ->where('status', 'reserved')
                        ->orderBy('reservation_time', 'asc')
                        ->first();

                    foreach ($allGroupTables as $grpTable) {
                        if ($reservedOrder) {
                            $grpTable->update([
                                'status' => 'reserved',
                                'merged_into_table_id' => null,
                                'reservation_name' => $reservedOrder->reservation_name,
                                'reservation_phone' => $reservedOrder->reservation_phone,
                                'reservation_time' => $reservedOrder->reservation_time,
                                'reservation_note' => $reservedOrder->reservation_note,
                            ]);
                        } else {
                            $grpTable->update([
                                'status' => 'available',
                                'merged_into_table_id' => null,
                            ]);
                        }
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($grpTable, 'checkout', [
                            'order_code' => $order->order_code,
                            'total_amount' => $totalAmount
                        ]));
                    }
                }

                return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund];
            });

            $targetTable = $result['table'];
            $depositTotal = $result['deposit_total'];
            $depositRefund = $result['deposit_refund'];

            $this->safeDispatch(function () use ($targetTable, $order, $totalAmount) {
                if ($targetTable) {
                    TableStatusUpdated::dispatch($targetTable, 'checkout', [
                        'order_code' => $order->order_code,
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
            $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'checkout']));

            if ($request->wantsJson()) {
                return response()->json([
                    'success' => true,
                    'message' => 'Thanh toán hoàn tất thành công!',
                    'deposit_total' => $depositTotal,
                    'deposit_refund' => $depositRefund,
                ]);
            }

            return back()->with('success', 'Thanh toán hoàn tất thành công!');
        } catch (\Throwable $e) {
            Log::error('POS checkout DB error: '.$e->getMessage());

            if ($request->wantsJson()) {
                return response()->json([
                    'error' => 'Thanh toán thất bại: '.$e->getMessage()
                ], 422);
            }

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }

    public function bulkCheckout(Request $request)
    {
        $validated = $request->validate([
            'order_ids' => 'required|array|min:1',
            'order_ids.*' => 'exists:orders,id',
            'table_id' => 'nullable|exists:tables,id',
            'payment_method' => 'required|in:cash,bank_transfer,e_wallet',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'required|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:bulk_checkout:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return $request->wantsJson()
                    ? response()->json(['success' => true, 'message' => 'Thanh toán đã được ghi nhận!'])
                    : back()->with('success', 'Thanh toán đã được ghi nhận!');
            }
        }

        try {
            $invoice = null;
            $totalAmount = 0;
            $orders = collect();

            $result = DB::transaction(function () use ($validated, $request, &$invoice, &$totalAmount, &$orders) {
                $orders = Order::with('items')->whereIn('id', $validated['order_ids'])->lockForUpdate()->get();

                if ($orders->count() !== count($validated['order_ids'])) {
                    throw new \Exception('Một số đơn hàng không tồn tại.');
                }

                $invalidOrder = $orders->first(fn ($o) => in_array($o->status, ['paid', 'cancelled']));
                if ($invalidOrder) {
                    throw new \Exception("Đơn {$invalidOrder->order_code} đã được thanh toán hoặc đã hủy.");
                }

                $reservedOrder = $orders->first(fn ($o) => $o->status === 'reserved');
                if ($reservedOrder) {
                    throw new \Exception("Đơn {$reservedOrder->order_code} là đơn đặt bàn chưa check-in, không thể thanh toán", 422);
                }

                // Kitchen lock check
                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if (! $canBypass) {
                    foreach ($orders as $ord) {
                        $hasUncompleted = $ord->items->contains(fn ($item) => in_array($item->status, ['pending', 'processing']));
                        if ($hasUncompleted) {
                            throw new \Exception("Đơn {$ord->order_code} còn món chưa được Bếp hoàn tất.");
                        }
                    }
                }

                // Compute total across all orders
                $totalAmount = $orders->sum(fn ($ord) => $ord->items->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_price));
                
                $depositTotal = 0;
                foreach ($orders as $ord) {
                    $depositTotal += (float) $ord->deposits()->where('status', 'held')->sum('amount');
                }

                $payable = max(0, $totalAmount - $depositTotal);
                $depositRefund = max(0, $depositTotal - $totalAmount);

                if ($validated['amount_received'] < $payable) {
                    throw new \Exception('Số tiền khách đưa không đủ.');
                }

                // Determine table name
                $tableId = $validated['table_id'] ?? $orders->first()?->table_id;
                $targetTable = $tableId ? Table::find($tableId) : null;

                if ($targetTable) {
                    $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                    $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                    $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                    $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                    $tableNameStr = $subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number;
                } else {
                    $primaryId = null;
                    $allGroupTables = collect();
                    $tableNameStr = 'Mang đi';
                }

                // Create single invoice
                $invoiceCode = 'INV-'.date('Ymd').strtoupper(Str::random(4));
                $invoice = Invoice::create([
                    'invoice_code' => $invoiceCode,
                    'table_name' => $tableNameStr,
                    'total_amount' => $totalAmount,
                    'deposit_amount' => $depositTotal,
                    'payment_method' => $validated['payment_method'],
                    'amount_received' => $validated['amount_received'],
                    'change_amount' => $validated['change_amount'],
                    'issued_at' => now(),
                ]);

                // Mark all orders as paid + link invoice
                foreach ($orders as $ord) {
                    $orderTotal = $ord->items->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_price);
                    $ord->update(['status' => 'paid', 'invoice_id' => $invoice->id]);

                    if ($depositTotal > 0) {
                        $ord->deposits()->where('status', 'held')->update([
                            'status' => 'applied',
                            'resolved_at' => now(),
                            'resolved_by_user_id' => $request->user()?->id,
                        ]);
                    }

                    OrderActivityLogger::log($ord, 'checkout', $request->user()?->id, [
                        'invoice_code' => $invoiceCode,
                        'payment_method' => $validated['payment_method'],
                        'total' => $orderTotal,
                        'bulk' => true,
                    ]);
                }

                // Release tables if no active orders remain
                $allGroupTableIds = $allGroupTables->pluck('id');
                if ($allGroupTableIds->isNotEmpty()) {
                    $hasOtherActive = Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->exists();

                    if (! $hasOtherActive) {
                        $reservedOrder = Order::whereIn('table_id', $allGroupTableIds)
                            ->where('status', 'reserved')
                            ->orderBy('reservation_time', 'asc')
                            ->first();

                        foreach ($allGroupTables as $grpTable) {
                            if ($reservedOrder) {
                                $grpTable->update([
                                    'status' => 'reserved',
                                    'merged_into_table_id' => null,
                                    'reservation_name' => $reservedOrder->reservation_name,
                                    'reservation_phone' => $reservedOrder->reservation_phone,
                                    'reservation_time' => $reservedOrder->reservation_time,
                                    'reservation_note' => $reservedOrder->reservation_note,
                                ]);
                            } else {
                                $grpTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                            }
                        }
                    }
                }

                return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund];
            });

            $targetTable = $result['table'];
            $depositTotal = $result['deposit_total'];
            $depositRefund = $result['deposit_refund'];

            $this->safeDispatch(function () use ($targetTable, $orders, $totalAmount) {
                if ($targetTable) {
                    TableStatusUpdated::dispatch($targetTable, 'checkout', [
                        'order_code' => $orders->pluck('order_code')->implode(', '),
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
            $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'bulk_checkout']));

            if ($request->wantsJson()) {
                return response()->json([
                    'success' => true, 
                    'message' => 'Thanh toán gộp thành công!',
                    'deposit_total' => $depositTotal,
                    'deposit_refund' => $depositRefund,
                ]);
            }

            return back()->with('success', 'Thanh toán gộp thành công!');
        } catch (\Throwable $e) {
            Log::error('POS bulk checkout error: '.$e->getMessage());

            if ($request->wantsJson()) {
                return response()->json(['error' => 'Thanh toán thất bại: '.$e->getMessage()], 422);
            }

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }


    public function transferTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                if ($targetTable->status !== 'available' && ! $targetTable->merged_into_table_id) {
                    throw new \Exception('Bàn đích phải ở trạng thái bàn trống.');
                }

                if ($sourceTable->merged_into_table_id) {
                    // Case 1: Source table is a sub-table in a merged group
                    // Target table takes over the merge link to primary table
                    $primaryId = $sourceTable->merged_into_table_id;
                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => $primaryId,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $primaryTable = Table::find($primaryId);
                    if ($primaryTable) {
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($primaryTable));
                    }
                } elseif (Table::where('merged_into_table_id', $sourceTable->id)->exists()) {
                    // Case 2: Source table is the primary table of a merged group
                    // Move all active orders to target table
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->update(['table_id' => $targetTable->id]);

                    // Update all sub-tables to point to target table as their new primary table
                    $subTables = Table::where('merged_into_table_id', $sourceTable->id)->get();
                    foreach ($subTables as $subTable) {
                        $subTable->update(['merged_into_table_id' => $targetTable->id]);
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($subTable));
                    }

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);
                } else {
                    // Case 3: Standard independent table transfer
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                        ->update(['table_id' => $targetTable->id]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);
                }

                $this->safeDispatch(function () use ($sourceTable, $targetTable) {
                    TableTransferred::dispatch($sourceTable, $targetTable, 'transfer');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($targetTable);
                });
            });

            return back()->with('success', 'Chuyển bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Chuyển bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function mergeTables(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                $primaryTargetId = $targetTable->merged_into_table_id ?? $targetTable->id;

                // Move all active orders from source table and any sub-tables of source to primaryTargetId
                $sourceGroupIds = Table::where('id', $sourceTable->id)
                    ->orWhere('merged_into_table_id', $sourceTable->id)
                    ->pluck('id');

                Order::whereIn('table_id', $sourceGroupIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->update(['table_id' => $primaryTargetId]);

                // Mark source table and any former sub-tables as merged into primaryTargetId
                Table::whereIn('id', $sourceGroupIds)->update([
                    'status' => 'occupied',
                    'merged_into_table_id' => $primaryTargetId,
                ]);

                // Ensure primary target table is occupied
                Table::where('id', $primaryTargetId)->update(['status' => 'occupied']);

                $primaryTargetTable = Table::find($primaryTargetId);
                $this->safeDispatch(function () use ($sourceTable, $primaryTargetTable) {
                    TableTransferred::dispatch($sourceTable, $primaryTargetTable, 'merge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($primaryTargetTable);
                });
            });

            return back()->with('success', 'Gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Gộp bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function unmergeTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'keep_table_id' => 'required|exists:tables,id',
        ]);

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $keepTable = Table::lockForUpdate()->findOrFail($validated['keep_table_id']);

                $groupId = $sourceTable->merged_into_table_id ?? $sourceTable->id;
                $allGroupTableIds = Table::where('id', $groupId)
                    ->orWhere('merged_into_table_id', $groupId)
                    ->pluck('id');

                // Move all active orders in group to keep_table_id
                Order::whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->update(['table_id' => $keepTable->id]);

                // Dynamic calculation: set status based on whether keepTable has active uncompleted orders
                $hasActiveOrders = Order::where('table_id', $keepTable->id)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->whereHas('items', function ($query) {
                        $query->where('status', '!=', 'cancelled');
                    })
                    ->exists();

                $keepTableStatus = $hasActiveOrders ? 'occupied' : 'available';

                $keepTable->update([
                    'status' => $keepTableStatus,
                    'merged_into_table_id' => null,
                ]);

                // For all other tables in group: reset merged_into_table_id = null, status = available
                Table::whereIn('id', $allGroupTableIds)
                    ->where('id', '!=', $keepTable->id)
                    ->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                $this->safeDispatch(function () use ($sourceTable, $keepTable) {
                    TableTransferred::dispatch($sourceTable, $keepTable, 'unmerge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($keepTable);
                });
            });

            return back()->with('success', 'Tách / Hủy gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Tách / Hủy gộp bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function cancelOrder(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|exists:tables,id',
            'cancellation_reason' => 'required|string|max:255',
            'note' => 'nullable|string|max:255',
        ]);

        try {
            $table = Table::findOrFail($validated['table_id']);
            $primaryId = $table->merged_into_table_id ?? $table->id;
            $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();

            $activeOrders = DB::transaction(function () use ($validated, $request, $allGroupTables) {
                $allGroupTableIds = $allGroupTables->pluck('id');

                $orders = Order::with('items')->whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->lockForUpdate()
                    ->get();

                if ($orders->isEmpty()) {
                    throw new \InvalidArgumentException('Không tìm thấy đơn hàng cần hủy!');
                }

                $reasonStr = $validated['cancellation_reason'].(! empty($validated['note']) ? ': '.$validated['note'] : '');

                foreach ($orders as $order) {
                    foreach ($order->items as $item) {
                        if ($item->status !== 'cancelled') {
                            $item->update([
                                'status' => 'cancelled',
                                'cancellation_reason' => $reasonStr,
                                'cancelled_by_user_id' => $request->user()->id,
                                'cancelled_at' => now(),
                            ]);
                        }
                    }
                    $order->update(['status' => 'cancelled']);

                    // Audit log: order_cancelled
                    OrderActivityLogger::log($order, 'order_cancelled', $request->user()?->id, [
                        'reason' => $reasonStr,
                        'item_count' => $order->items->count(),
                    ]);
                }

                // Release all group tables to available
                Table::whereIn('id', $allGroupTableIds)->update([
                    'status' => 'available',
                    'merged_into_table_id' => null,
                ]);

                return $orders;
            });

            $this->safeDispatch(function () use ($allGroupTables, $activeOrders, $validated) {
                $primaryOrder = $activeOrders->first() ?? Order::first() ?? new Order;
                $cancelMsg = 'Hủy toàn bộ đơn hàng (Lý do: '.$validated['cancellation_reason'].')';
                OrderSentToKitchen::dispatch($primaryOrder, 'cancel_order', $cancelMsg);
                foreach ($allGroupTables as $grpTable) {
                    TableStatusUpdated::dispatch($grpTable);
                }
            });

            return back()->with('success', 'Đã hủy toàn bộ đơn hàng thành công!');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            Log::error('POS cancelOrder DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hủy đơn hàng thất bại: '.$e->getMessage()]);
        }
    }

    public function servingQueue(Request $request)
    {
        $items = OrderItem::with(['order.table', 'menuItem'])
            ->where('status', 'completed')
            ->whereNull('served_at')
            ->whereHas('order', fn ($q) => $q->whereDate('created_at', today()))
            ->orderBy('updated_at', 'asc')
            ->get()
            ->groupBy('order_id')
            ->map(function ($orderItems, $orderId) {
                $first = $orderItems->first();
                $order = $first->order;

                return [
                    'id' => $orderId.'_'.$order->updated_at?->timestamp,
                    'order_id' => $orderId,
                    'order_code' => $order->order_code,
                    'table_number' => $order->table?->table_number ?? 'Mang về',
                    'table_area' => $order->table?->area ?? '',
                    'items' => $orderItems->map(fn ($i) => [
                        'id' => $i->id,
                        'name' => $i->menuItem?->name ?? 'Món ăn',
                        'quantity' => $i->quantity,
                        'note' => $i->note,
                    ])->values()->toArray(),
                    'completed_at' => $orderItems->max('updated_at')?->toIso8601String(),
                ];
            })
            ->values()
            ->toArray();

        return response()->json($items);
    }

    public function markServed(Request $request)
    {
        $validated = $request->validate([
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'required|integer|exists:order_items,id',
        ]);

        try {
            $count = OrderItem::whereIn('id', $validated['item_ids'])
                ->where('status', 'completed')
                ->whereNull('served_at')
                ->update(['served_at' => now()]);

            return response()->json([
                'success' => true,
                'served_count' => $count,
                'message' => 'Đã đánh dấu phục vụ thành công!',
            ]);
        } catch (\Throwable $e) {
            Log::error('POS markServed error: '.$e->getMessage());

            return response()->json(['error' => 'Đánh dấu phục vụ thất bại.'], 500);
        }
    }

    private function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
}
