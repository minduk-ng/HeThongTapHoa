# Báo Cáo Kho Vận Hành + Kiểm Kê + Lịch Sử Tồn Kho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 4 chức năng kho vận hành: Báo cáo Nhập-Xuất-Tồn, Báo cáo Tiêu thụ nguyên liệu, Kiểm kê kho (type `adjustment`), Trang Lịch sử tồn kho theo nguyên liệu.

**Architecture:** Migration mở rộng enum `stock_vouchers.type` thêm `'adjustment'`; 2 controller báo cáo (`StockMovementReportController`, `ConsumptionReportController`) tại `/reports/*`; 2 controller chức năng (`StocktakeController`, `StockHistoryController`) tại `/inventory/*`; 4 trang React dùng `DataTable.tsx`; thêm pages + permissions vào seeder. Tất cả trang `/reports/*` flyout 2 cấp (group "Báo cáo", sub_group "Hoạt động").

**Tech Stack:** Laravel 13 (PHP 8.3), Pest, React 19 + TypeScript + Inertia.js.

## Global Constraints

- **Bảng dùng `DataTable.tsx`** cho MỌI trang kho — KHÔNG dùng `ReportTable`.
- **Flyout 2 cấp** (quy tắc 15 AGENTS.md): `/reports/stock-movement` + `/reports/consumption` thêm group "Báo cáo", sub_group "Hoạt động".
- **Kiểm kê**: `type='adjustment'` trên `stock_vouchers`; mỗi dòng mang số **âm/dương** nguyên liệu; áp lên `stock_quantity` + cập nhật `quantity_remaining` lô (FIFO).
- **Tiêu thụ**: món ĐÃ BÁN (invoice_lines) → recipe × qty.
- Permission mới (quy tắc 9 AGENTS.md): `inventory.stocktake.view`, `inventory.stocktake.create`, `inventory.history.view` — thêm seeder + RoleController `$systemPermissions` + RolesManager dictionary.
- Số dùng `tabular-nums`, `font-display`, lucide icons, không emoji/inline SVG.
- Bắt buộc: `php artisan test` xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt.

---

### Task 1: Migration adjustment + backend 2 báo cáo vận hành

**Files:**
- Create: `database/migrations/2026_08_17_000002_add_adjustment_to_stock_vouchers_type.php`
- Create: `app/Http/Controllers/Reports/StockMovementReportController.php`
- Create: `app/Http/Controllers/Reports/ConsumptionReportController.php`
- Modify: `routes/web.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Test: `tests/Feature/Reports/StockMovementReportTest.php`, `tests/Feature/Reports/ConsumptionReportTest.php`

**Interfaces:**
- Consumes: `StockVoucher`/`StockVoucherItem`, `InvoiceLine`, `ProductRecipe`, `Ingredient`.
- Produces: enum type thêm `adjustment`; 2 route `/reports/stock-movement`, `/reports/consumption` trả rows.

- [ ] **Step 1: Migration adjustment (cross-driver)**

Tạo `database/migrations/2026_08_17_000002_add_adjustment_to_stock_vouchers_type.php`. Kiểm tra trước: nếu project chạy test SQLite `:memory:`, `DB::statement ALTER MODIFY ENUM` sẽ lỗi. Dùng `Schema::change()`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->enum('type', ['import', 'export', 'adjustment'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->enum('type', ['import', 'export'])->change();
        });
    }
};
```
Nếu `change()` không hỗ trợ (Laravel version), fallback `DB::statement` như spec ghi chú. Chạy `php artisan migrate`.

- [ ] **Step 2: StockMovementReportController**

`app/Http/Controllers/Reports/StockMovementReportController.php`:
```php
<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\StockVoucherItem;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class StockMovementReportController extends Controller
{
    public function index(): Response
    {
        $from = request('from') ? Carbon::parse(request('from'))->startOfDay() : now()->startOfMonth();
        $to = request('to') ? Carbon::parse(request('to'))->endOfDay() : now();

        $items = StockVoucherItem::with(['voucher', 'ingredient'])
            ->whereHas('voucher', fn ($q) => $q->whereBetween('transacted_at', [$from, $to]))
            ->get()
            ->groupBy('ingredient_id');

        $rows = $items->map(function ($group, $ingId) {
            $in = (float) $group->where('voucher.type', 'import')->sum('quantity');
            $out = (float) $group->where('voucher.type', 'export')->sum('quantity');
            $adj = (float) $group->where('voucher.type', 'adjustment')->sum('quantity');
            $ing = $group->first()->ingredient;
            $end = (float) $ing->stock_quantity;
            $begin = round($end - $in + $out + $adj, 2);
            return [
                'ingredient_id' => $ingId,
                'name' => $ing->name,
                'unit' => $ing->unit,
                'begin_qty' => $begin,
                'import_qty' => round($in, 2),
                'export_qty' => round($out, 2),
                'adjust_qty' => round($adj, 2),
                'end_qty' => $end,
            ];
        })->values();

        return Inertia::render('reports/StockMovementReport', [
            'rows' => $rows,
            'filters' => request()->only(['from', 'to']),
        ]);
    }
}
```
LƯU Ý: dấu xuất — `createStockExportVoucher` ghi `quantity => -$totalUsed` (âm). Nên `out = sum(quantity)` của type export = âm → `end = stock_quantity`, `begin = end − in + out + adj`. Với out âm: `− in + out` = `− in + (−out_abs)` → không đúng. **Kiểm tra dấu thật**: nếu export ghi âm, tính `$out = abs(sum export)` và công thức `begin = end − in + out + adj` (out là số dương lượng xuất). Đọc dữ liệu để chốt đúng trước khi test.

- [ ] **Step 3: ConsumptionReportController**

`app/Http/Controllers/Reports/ConsumptionReportController.php`:
```php
<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLine;
use App\Models\ProductRecipe;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class ConsumptionReportController extends Controller
{
    public function index(): Response
    {
        $from = request('from') ? Carbon::parse(request('from'))->startOfDay() : now()->startOfMonth();
        $to = request('to') ? Carbon::parse(request('to'))->endOfDay() : now();

        $lines = InvoiceLine::whereBetween('created_at', [$from, $to])
            ->where('quantity', '>', 0)
            ->get(['menu_item_id', 'quantity']);

        $recipes = ProductRecipe::with('ingredient')->whereIn('menu_item_id', $lines->pluck('menu_item_id')->unique())->get();

        $consume = collect();
        foreach ($lines as $line) {
            foreach ($recipes->where('menu_item_id', $line->menu_item_id) as $r) {
                $consume->put($r->ingredient_id, $consume->get($r->ingredient_id, 0) + (float) $r->amount * (int) $line->quantity);
            }
        }

        $rows = $consume->map(fn ($qty, $ingId) => [
            'name' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->name,
            'unit' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->unit,
            'quantity' => round($qty, 2),
            'cost' => round($qty * (float) $recipes->firstWhere('ingredient_id', $ingId)->ingredient->cost_price, 2),
        ])->values();

        return Inertia::render('reports/ConsumptionReport', [
            'rows' => $rows,
            'filters' => request()->only(['from', 'to']),
        ]);
    }
}
```

- [ ] **Step 4: Routes + seeder**

`routes/web.php` — nhóm reports:
```php
Route::get('/stock-movement', [StockMovementReportController::class, 'index'])->middleware('permission:reports.view');
Route::get('/consumption', [ConsumptionReportController::class, 'index'])->middleware('permission:reports.view');
```
Kèm `use`.

`database/seeders/AuthorizationSeeder.php` — thêm 2 page vào sub_group "Hoạt động":
```php
['name' => 'Báo cáo nhập xuất tồn', 'route_path' => '/reports/stock-movement', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động'],
['name' => 'Báo cáo tiêu thụ nguyên liệu', 'route_path' => '/reports/consumption', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động'],
```

- [ ] **Step 5: Test backend**

Tạo `tests/Feature/Reports/StockMovementReportTest.php` + `ConsumptionReportTest.php` theo pattern InventoryReportsTest (spec 1 Task 2 Step 4): tạo ingredient + phiếu import + export → assert rows tổng hợp đúng; tạo invoice_line + recipe → assert consumption đúng. Kiểm tra `assertInertia` pattern hiện có.

- [ ] **Step 6: Chạy test + commit**

```bash
php artisan test --filter="StockMovementReportTest|ConsumptionReportTest"
php artisan test
git add database/migrations/2026_08_17_000002_add_adjustment_to_stock_vouchers_type.php app/Http/Controllers/Reports/StockMovementReportController.php app/Http/Controllers/Reports/ConsumptionReportController.php routes/web.php database/seeders/AuthorizationSeeder.php tests/Feature/Reports/
git commit -m "feat: backend bao cao nhap xuat ton va tieu thu nguyen lieu"
```
Expected: toàn bộ xanh.

---

### Task 2: Kiểm kê kho (type adjustment)

**Files:**
- Create: `app/Http/Controllers/Manager/StocktakeController.php`
- Modify: `routes/web.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`
- Modify: `resources/js/pages/admin/RolesManager.tsx`
- Create: `resources/js/pages/manager/inventory/stocktake/StocktakeManager.tsx`
- Test: `tests/Feature/StocktakeTest.php`

**Interfaces:**
- Consumes: `Ingredient`, `StockVoucher`, `StockVoucherItem`, `IngredientStockUpdated` event, `Ingredient::effective_expiry_date` (Plan 1).
- Produces: route GET+POST `/inventory/stocktake`; kiểm kê tạo phiếu `adjustment` ±, cập nhật stock + lô FIFO.

- [ ] **Step 1: Controller**

`app/Http/Controllers/Manager/StocktakeController.php`:
```php
<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StocktakeController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('manager/inventory/stocktake/StocktakeManager', [
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.ingredient_id' => 'required|exists:ingredients,id',
            'items.*.actual_qty' => 'required|numeric|min:0',
        ]);

        $changes = collect($validated['items'])->filter(fn ($it) => abs($it['actual_qty'] - (float) Ingredient::find($it['ingredient_id'])->stock_quantity) > 0.0001);

        if ($changes->isEmpty()) {
            return back()->with('info', 'Không có thay đổi tồn kho nào.');
        }

        $employeeId = Employee::idForUser($request->user()?->id);
        $dateStr = now()->format('Ymd');
        $prefix = "KK-{$dateStr}-";

        DB::transaction(function () use ($changes, $employeeId, $request, $prefix) {
            $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
                ->lockForUpdate()->pluck('voucher_code')
                ->map(fn ($c) => (int) substr($c, strlen($prefix)))->max() ?? 0;
            $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

            $voucher = StockVoucher::create([
                'voucher_code' => $voucherCode,
                'type' => 'adjustment',
                'employee_id' => $employeeId,
                'transacted_at' => now(),
                'note' => 'Kiểm kê kho',
                'created_by' => $request->user()?->id,
            ]);

            foreach ($changes as $it) {
                $ing = Ingredient::lockForUpdate()->find($it['ingredient_id']);
                if (! $ing) continue;
                $delta = (float) $it['actual_qty'] - (float) $ing->stock_quantity;
                if (abs($delta) < 0.0001) continue;

                $voucher->items()->create([
                    'ingredient_id' => $ing->id,
                    'quantity' => $delta,
                    'unit_price' => null,
                ]);

                // Cập nhật lô FIFO khi giảm
                if ($delta < 0) {
                    $remaining = abs($delta);
                    $lots = StockVoucherItem::where('ingredient_id', $ing->id)
                        ->where('quantity_remaining', '>', 0)->whereNotNull('quantity_remaining')
                        ->orderBy('expiry_date', 'asc')->lockForUpdate()->get();
                    foreach ($lots as $lot) {
                        if ($remaining <= 0) break;
                        $take = min((float) $lot->quantity_remaining, $remaining);
                        $lot->decrement('quantity_remaining', $take);
                        $remaining -= $take;
                    }
                } elseif ($delta > 0) {
                    // Dư: cộng vào lô chưa hết HSD mới nhất, hoặc tạo lô adjustment không HSD
                    $latest = StockVoucherItem::where('ingredient_id', $ing->id)
                        ->where('quantity_remaining', '>', 0)->whereNotNull('quantity_remaining')
                        ->orderByDesc('expiry_date')->lockForUpdate()->first();
                    if ($latest) {
                        $latest->increment('quantity_remaining', $delta);
                    } else {
                        $voucher->items()->create([
                            'ingredient_id' => $ing->id,
                            'quantity' => $delta,
                            'unit_price' => null,
                            'expiry_date' => null,
                            'quantity_remaining' => $delta,
                        ]);
                    }
                }

                $ing->update(['stock_quantity' => $it['actual_qty']]);
                IngredientStockUpdated::dispatch(['ingredient_id' => $ing->id]);
            }
        });

        return back()->with('success', 'Kiểm kê hoàn tất.');
    }
}
```
LƯU Ý: khi `delta > 0` tạo lô mới trong cùng voucher, đảm bảo không trùng create lô (voucher items create 2 lần cùng dòng). Cần xử lý logic tách bạch.

- [ ] **Step 2: Route + permission**

`routes/web.php`:
```php
Route::get('/inventory/stocktake', [StocktakeController::class, 'index'])->middleware('permission:inventory.stocktake.view');
Route::post('/inventory/stocktake', [StocktakeController::class, 'store'])->middleware('permission:inventory.stocktake.create');
```
`AuthorizationSeeder.php` + `RoleController.php` — thêm `inventory.stocktake.view`, `inventory.stocktake.create`.
`RolesManager.tsx` dictionary — thêm `stocktake: 'Kiểm kê'`.

- [ ] **Step 3: Frontend StocktakeManager.tsx**

`resources/js/pages/manager/inventory/stocktake/StocktakeManager.tsx`:
- `DataTable` liệt kê ingredient + cột "Tồn lý thuyết" + cột input "Số thực tế" (number per row, state record ingredient_id → actual).
- Chênh lệch live hiển thị (actual − lý thuyết) với màu rose nếu âm, emerald nếu dương.
- Nút "Lưu kiểm kê" POST `/inventory/stocktake` với items (chỉ những row nhập số).
- Dùng `router.post` + Inertia form. State `values: Record<number, string>`.

- [ ] **Step 4: Test**

Tạo `tests/Feature/StocktakeTest.php`:
```php
<?php

test('kiem ke: nhap actual khac ly thuyet tao phiếu adjustment + cap nhat stock', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Kk '.uniqid(), 'code' => 'kk'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);

    $this->actingAs($admin)->post('/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 7]],
    ])->assertSessionHasNoErrors();

    expect($ing->fresh()->stock_quantity)->toBe(7.0);
    $v = \App\Models\StockVoucher::where('type', 'adjustment')->first();
    expect($v)->not->toBeNull();
    expect((float) $v->items()->first()->quantity)->toBe(-3.0);
});

test('kiem ke: actual bang ly thuyet khong tao phieu', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Kk0 '.uniqid(), 'code' => 'kk0'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);
    $this->actingAs($admin)->post('/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 10]],
    ])->assertSessionHasNoErrors();
    expect(\App\Models\StockVoucher::where('type', 'adjustment')->count())->toBe(0);
});
```

- [ ] **Step 5: Chạy test + lint + build + commit**

```bash
php artisan test --filter="StocktakeTest"
npx eslint resources/js/pages/manager/inventory/stocktake/
npm run types:check
npm run build
php artisan test
git add app/Http/Controllers/Manager/StocktakeController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php resources/js/pages/admin/RolesManager.tsx resources/js/pages/manager/inventory/stocktake/ tests/Feature/StocktakeTest.php
git commit -m "feat: kiem ke kho - phieu adjustment am duong + cap nhat stock theo so thuc te"
```
Expected: toàn bộ xanh.

---

### Task 3: Lịch sử tồn kho

**Files:**
- Create: `app/Http/Controllers/Manager/StockHistoryController.php`
- Modify: `routes/web.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`
- Modify: `resources/js/pages/admin/RolesManager.tsx`
- Create: `resources/js/pages/manager/inventory/history/StockHistoryManager.tsx`
- Test: `tests/Feature/StockHistoryTest.php`

**Interfaces:**
- Consumes: `StockVoucherItem`/`StockVoucher`, `Ingredient`.
- Produces: route GET `/inventory/history`; trang liệt kê giao dịch + số dư chạy.

- [ ] **Step 1: Controller**

`app/Http/Controllers/Manager/StockHistoryController.php`:
```php
<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\StockVoucherItem;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class StockHistoryController extends Controller
{
    public function index(): Response
    {
        $ingredientId = (int) request('ingredient_id');

        $query = StockVoucherItem::with('voucher')->where('ingredient_id', $ingredientId);

        if (request('from')) {
            $query->whereHas('voucher', fn ($q) => $q->where('transacted_at', '>=', Carbon::parse(request('from'))->startOfDay()));
        }
        if (request('to')) {
            $query->whereHas('voucher', fn ($q) => $q->where('transacted_at', '<=', Carbon::parse(request('to'))->endOfDay()));
        }

        $items = $query->orderBy('transacted_at', 'asc')->get();

        $running = 0.0;
        $rows = $items->map(function ($it) use (&$running) {
            $running += (float) $it->quantity;
            return [
                'transacted_at' => $it->voucher?->transacted_at?->format('d/m/Y H:i'),
                'voucher_code' => $it->voucher?->voucher_code,
                'type' => $it->voucher?->type,
                'quantity' => round((float) $it->quantity, 2),
                'note' => $it->voucher?->note,
                'balance' => round($running, 2),
            ];
        })->values();

        return Inertia::render('manager/inventory/history/StockHistoryManager', [
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit']),
            'ingredientId' => $ingredientId,
            'rows' => $rows,
            'filters' => request()->only(['from', 'to']),
        ]);
    }
}
```
LƯU Ý dấu: import dương, export `createStockExportVoucher` ghi âm → running balance cộng thẳng đúng. adjustment ± theo delta. Kiểm tra dữ liệu thật.

- [ ] **Step 2: Route + permission**

`routes/web.php`:
```php
Route::get('/inventory/history', [StockHistoryController::class, 'index'])->middleware('permission:inventory.history.view');
```
Seeder + RoleController — `inventory.history.view`. RolesManager — `history: 'Lịch sử'` (nếu cần).

- [ ] **Step 3: Frontend StockHistoryManager.tsx**

- Select chọn nguyên liệu (giá trị `ingredientId`), filter khoảng ngày + loại phiếu.
- `DataTable` cột: Thời gian, Phiếu, Loại (badge), Số lượng (± màu), Ghi chú, Số dư.
- Dùng `router.reload({ only: ['rows'] })` khi đổi select/filter (theo pattern `useReportFilters` hoặc props từ controller).

- [ ] **Step 4: Test**

Tạo `tests/Feature/StockHistoryTest.php`:
```php
<?php

test('lich su: dung so du chay sau moi giao dich', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Hs '.uniqid(), 'code' => 'hs'.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'min_stock_alert' => 5, 'cost_price' => 100]);
    // tạo phiếu import +10, export -4
    $v1 = \App\Models\StockVoucher::create(['voucher_code' => 'PN-TEST-001', 'type' => 'import', 'transacted_at' => now()->subHour(), 'created_by' => $admin->id]);
    $v1->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 50, 'quantity_remaining' => 10]);
    $v2 = \App\Models\StockVoucher::create(['voucher_code' => 'PX-TEST-001', 'type' => 'export', 'transacted_at' => now(), 'created_by' => $admin->id]);
    $v2->items()->create(['ingredient_id' => $ing->id, 'quantity' => -4, 'unit_price' => null, 'quantity_remaining' => null]);

    $res = $this->actingAs($admin)->get('/inventory/history?ingredient_id='.$ing->id);
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows', fn ($rows) => count($rows) === 2 && $rows[0]['balance'] === 10.0 && $rows[1]['balance'] === 6.0));
});
```
Kiểm tra `assertInertia` pattern. LƯU Ý `transacted_at` + orderBy — đảm bảo sort đúng thứ tự.

- [ ] **Step 5: Chạy test + lint + build + commit**

```bash
php artisan test --filter="StockHistoryTest"
npx eslint resources/js/pages/manager/inventory/history/
npm run types:check
npm run build
php artisan test
git add app/Http/Controllers/Manager/StockHistoryController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php resources/js/pages/admin/RolesManager.tsx resources/js/pages/manager/inventory/history/ tests/Feature/StockHistoryTest.php
git commit -m "feat: trang lich su ton kho theo nguyen lieu + so du chay"
```
Expected: toàn bộ xanh.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = migration adjustment + 2 báo cáo vận hành; Task 2 = kiểm kê; Task 3 = lịch sử. Đầy đủ.
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** `type='adjustment'`, `quantity_remaining`, `StockVoucherItem`, DataTable nhất quán.
- **Lưu ý:** dấu quantity của export (âm hay dương) phải kiểm tra dữ liệu thật trước khi tính begin/balance. Migration enum cross-driver (SQLite). `assertInertia` khớp pattern hiện có.
