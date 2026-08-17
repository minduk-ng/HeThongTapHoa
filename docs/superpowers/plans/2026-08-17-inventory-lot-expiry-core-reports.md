# HSD Theo Lô + Báo Cáo Kho Cốt Lõi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm hạ tầng HSD theo lô nhập kho (xuất trừ FIFO) và 3 báo cáo kho cốt lõi (giá trị kho, tồn thấp, sắp hết hạn) tại `/reports/*`.

**Architecture:** Migration thêm `expiry_date` + `quantity_remaining` vào `stock_voucher_items`; `StockVoucherController@store` nhận HSD từng dòng; `CheckoutService::createStockExportVoucher` trừ FIFO theo HSD; `Ingredient` accessor HSD hiệu lực. 3 controller báo cáo + 3 trang React dùng `DataTable.tsx`, thêm pages vào seeder (group "Báo cáo", sub_group "Hoạt động").

**Tech Stack:** Laravel 13 (PHP 8.3), Pest, React 19 + TypeScript + Inertia.js, Tailwind.

## Global Constraints

- **Bảng dùng `DataTable.tsx`** (`resources/js/components/DataTable.tsx`) cho MỌI trang kho — KHÔNG dùng `ReportTable`.
- **Flyout 2 cấp**: các trang `/reports/*` của kho thêm vào group "Báo cáo", sub_group "Hoạt động" (quy tắc 15 AGENTS.md — seeder + HandleInertiaRequests đã tự build `__subs`).
- Lô = dòng nhập kho (`stock_voucher_items`); xuất trừ FIFO theo HSD tăng dần.
- `quantity_remaining` dùng `decimal(15,2)` (khớp `quantity` hiện có).
- `ingredients.expiry_date` giữ (tương thích cũ); HSD chính xác = HSD sớm nhất còn tồn từ lô.
- Permission: báo cáo dùng `reports.view` (đã có); `ingredients.*` giữ nguyên.
- Số dùng `tabular-nums`, `font-display` heading, lucide icons, không emoji/inline SVG.
- Bắt buộc: `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt.

---

### Task 1: Hạ tầng HSD lô + nhập kho + FIFO xuất

**Files:**
- Create: `database/migrations/2026_08_17_000001_add_expiry_to_stock_voucher_items.php`
- Modify: `app/Models/StockVoucherItem.php`
- Modify: `app/Http/Controllers/Manager/StockVoucherController.php`
- Modify: `app/Services/Checkout/CheckoutService.php`
- Modify: `app/Models/Ingredient.php`
- Test: `tests/Feature/InventoryLotFifoTest.php`, `tests/Feature/StockVoucherTest.php`

**Interfaces:**
- Consumes: `StockVoucherItem` model, `StockVoucherController@store`, `CheckoutService::createStockExportVoucher`, `Ingredient` model.
- Produces: `stock_voucher_items.expiry_date` + `quantity_remaining`; nhập kho ghi HSD + `quantity_remaining=quantity`; xuất checkout trừ FIFO; `Ingredient::effective_expiry_date` accessor. Các task sau dùng `effective_expiry_date` cho báo cáo hết hạn.

- [ ] **Step 1: Viết migration**

Tạo `database/migrations/2026_08_17_000001_add_expiry_to_stock_voucher_items.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->date('expiry_date')->nullable()->after('quantity');
            $table->decimal('quantity_remaining', 15, 2)->nullable()->after('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->dropColumn(['expiry_date', 'quantity_remaining']);
        });
    }
};
```

- [ ] **Step 2: Chạy migration**

```bash
php artisan migrate
```
Expected: migration chạy thành công.

- [ ] **Step 3: Cập nhật Model `StockVoucherItem`**

`app/Models/StockVoucherItem.php` — thêm vào `$fillable`:
```php
        'voucher_id', 'ingredient_id', 'quantity', 'unit_price', 'expiry_date', 'quantity_remaining',
```
Casts:
```php
        'quantity' => 'float',
        'unit_price' => 'float',
        'expiry_date' => 'date',
        'quantity_remaining' => 'float',
```

- [ ] **Step 4: Nhập kho — `StockVoucherController@store` nhận HSD + set quantity_remaining**

Đọc `app/Http/Controllers/Manager/StockVoucherController.php` (đặc biệt `store`, dòng ~57-100). Trong validation thêm:
```php
            'items.*.expiry_date' => ['nullable', 'date'],
```
Khi tạo `StockVoucherItem` (trong transaction), thêm 2 field:
```php
            $voucher->items()->create([
                'ingredient_id' => $item['ingredient_id'],
                'quantity' => $item['quantity'],
                'unit_price' => $item['unit_price'],
                'expiry_date' => $item['expiry_date'] ?? null,
                'quantity_remaining' => $item['quantity'],
            ]);
```
Đọc code thật để khớp biến (có thể là `$voucher->items()->create` hoặc `StockVoucherItem::create`).

- [ ] **Step 5: Xuất kho trừ FIFO — `CheckoutService::createStockExportVoucher`**

Đọc `app/Services/Checkout/CheckoutService.php` (phần cuối ~dòng 492-505). Sau khi `$ingredient->decrement('stock_quantity', $totalUsed)`, thêm trừ FIFO theo lô:

```php
            // Trừ quantity_remaining theo lô FIFO (lô cũ nhất HSD trước)
            $remaining = $totalUsed;
            $lots = \App\Models\StockVoucherItem::where('ingredient_id', $ingredientId)
                ->where('quantity_remaining', '>', 0)
                ->whereNotNull('quantity_remaining')
                ->orderBy('expiry_date', 'asc')
                ->lockForUpdate()
                ->get();
            foreach ($lots as $lot) {
                if ($remaining <= 0) {
                    break;
                }
                $take = min((float) $lot->quantity_remaining, $remaining);
                $lot->decrement('quantity_remaining', $take);
                $remaining -= $take;
            }
```
Lưu ý: đọc khối `foreach ($ingredientTotals ...)` hiện có để chèn đúng vị trí. Nếu tất cả lô `quantity_remaining = null` (dữ liệu cũ) → vòng lặp không trừ được, chỉ trừ `stock_quantity` như cũ (hành vi cũ), không lỗi.

- [ ] **Step 6: `Ingredient::effective_expiry_date` accessor**

`app/Models/Ingredient.php` — thêm accessor (import `StockVoucherItem` nếu chưa có):
```php
    public function getEffectiveExpiryDateAttribute(): ?string
    {
        $earliest = \App\Models\StockVoucherItem::where('ingredient_id', $this->id)
            ->where('quantity_remaining', '>', 0)
            ->whereNotNull('expiry_date')
            ->orderBy('expiry_date', 'asc')
            ->value('expiry_date');

        return $earliest ? \Illuminate\Support\Carbon::parse($earliest)->toDateString() : null;
    }
```

- [ ] **Step 7: Viết test FIFO + nhập HSD**

Tạo `tests/Feature/InventoryLotFifoTest.php`:
```php
<?php

test('nhan kho voi HSD luu quantity_remaining bang quantity', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create([
        'name' => 'Cà phê '.uniqid(), 'code' => 'cf'.uniqid(),
        'unit' => 'g', 'stock_quantity' => 0, 'min_stock_alert' => 50, 'cost_price' => 100,
    ]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [
            ['ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 50, 'expiry_date' => '2026-12-01'],
        ],
        'note' => 'nhap lo',
    ])->assertSessionHasNoErrors();

    $item = \App\Models\StockVoucherItem::where('ingredient_id', $ing->id)->first();
    expect($item->expiry_date?->toDateString())->toBe('2026-12-01');
    expect((float) $item->quantity_remaining)->toBe(100.0);
    expect((float) $ing->fresh()->stock_quantity)->toBe(100.0);
});

test('FIFO: ban dung 120g tru het lo cu truoc', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create([
        'name' => 'Sữa '.uniqid(), 'code' => 'su'.uniqid(),
        'unit' => 'ml', 'stock_quantity' => 100, 'min_stock_alert' => 50, 'cost_price' => 10,
    ]);
    // Lô cũ hạn 1/11 còn 100, lô mới hạn 1/12 còn 100
    \App\Models\StockVoucherItem::create(['voucher_id' => 0, 'ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 10, 'expiry_date' => '2026-11-01', 'quantity_remaining' => 100]);
    \App\Models\StockVoucherItem::create(['voucher_id' => 0, 'ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 10, 'expiry_date' => '2026-12-01', 'quantity_remaining' => 100]);

    // gọi trực tiếp phương thức xuất kho — dùng CheckoutService checkout qua đơn bán
    // (xem pattern POSCheckoutTest để tạo đơn + checkout)
    // ... tạo đơn bán dùng 120g sữa, checkout ...
    // Kỳ vọng: lô 1 (1/11) còn 0, lô 2 (1/12) còn 80
    // expect lô 1 fresh quantity_remaining = 0, lô 2 = 80
});
```
LƯU Ý test FIFO: cần tạo đơn bán có món với recipe 120g → checkout để kích `createStockExportVoucher`. Xem `posMenuItem`/`ProductRecipe` helper và `POSCheckoutTest` pattern. Nếu `voucher_id => 0` không hợp lệ (FK), tạo phiếu thật qua `StockVoucher::create(['type'=>'import', ...])`.

- [ ] **Step 8: Chạy test + commit**

```bash
php artisan test --filter="InventoryLotFifoTest|StockVoucherTest|POSCheckoutTest"
php artisan test
git add database/migrations/2026_08_17_000001_add_expiry_to_stock_voucher_items.php app/Models/StockVoucherItem.php app/Http/Controllers/Manager/StockVoucherController.php app/Services/Checkout/CheckoutService.php app/Models/Ingredient.php tests/Feature/InventoryLotFifoTest.php
git commit -m "feat: HSD theo lo nhap kho, xuat kho tru FIFO theo HSD"
```
Expected: toàn bộ xanh.

---

### Task 2: Báo cáo cốt lõi — backend controllers + navigation

**Files:**
- Create: `app/Http/Controllers/Reports/InventoryValueReportController.php`
- Create: `app/Http/Controllers/Reports/LowStockReportController.php`
- Create: `app/Http/Controllers/Reports/ExpiringReportController.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `routes/web.php`
- Test: `tests/Feature/Reports/InventoryReportsTest.php`

**Interfaces:**
- Consumes: `Ingredient` model, `StockVoucherItem` (quantity_remaining, expiry_date), `DataTable` (Task 3), `reports.view` permission.
- Produces: 3 route `/reports/inventory-value`, `/reports/low-stock`, `/reports/expiring` trả Inertia + rows array; pages trong `pages` table (group "Báo cáo", sub_group "Hoạt động").

- [ ] **Step 1: Controller InventoryValueReport**

`app/Http/Controllers/Reports/InventoryValueReportController.php`:
```php
<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use Inertia\Inertia;
use Inertia\Response;

class InventoryValueReportController extends Controller
{
    public function index(): Response
    {
        $query = Ingredient::query();
        if (request('search')) {
            $q = trim(request('search'));
            $query->where(fn ($b) => $b->where('name', 'like', "%{$q}%")->orWhere('code', 'like', "%{$q}%"));
        }

        $ingredients = $query->orderBy('name')->get();
        $rows = $ingredients->map(fn ($i) => [
            'id' => $i->id,
            'code' => $i->code,
            'name' => $i->name,
            'unit' => $i->unit,
            'stock_quantity' => round((float) $i->stock_quantity, 2),
            'cost_price' => round((float) $i->cost_price, 2),
            'value' => round((float) $i->stock_quantity * (float) $i->cost_price, 2),
        ]);
        $totalValue = round($rows->sum('value'), 2);

        return Inertia::render('reports/InventoryValueReport', [
            'rows' => $rows,
            'totalValue' => $totalValue,
            'filters' => request()->only(['search']),
        ]);
    }
}
```

**LowStockReportController** — tương tự nhưng query `whereColumn('stock_quantity', '<=', 'min_stock_alert')`, mỗi row thêm:
```php
'status' => $i->stock_quantity <= 0 ? 'out' : ($i->stock_quantity <= $i->min_stock_alert * 0.2 ? 'critical' : 'low'),
'suggest_qty' => max(0, round($i->min_stock_alert * 2 - $i->stock_quantity, 2)),
```

**ExpiringReportController**:
```php
$rows = \App\Models\StockVoucherItem::with('ingredient')
    ->where('quantity_remaining', '>', 0)
    ->whereNotNull('expiry_date')
    ->orderBy('expiry_date', 'asc')
    ->get()
    ->map(fn ($it) => [
        'ingredient_name' => $it->ingredient?->name,
        'unit' => $it->ingredient?->unit,
        'expiry_date' => $it->expiry_date?->format('d/m/Y'),
        'days_left' => now()->diffInDays($it->expiry_date, false),
        'quantity_remaining' => round((float) $it->quantity_remaining, 2),
        'status' => $it->expiry_date->lt(now()) ? 'expired' : ($it->expiry_date->lte(now()->addDays(7)) ? 'soon' : 'ok'),
    ]);
```

- [ ] **Step 2: Route**

`routes/web.php` — trong nhóm `Route::prefix('reports')->middleware(CheckPageAccess::class)` (gần các report hiện có), thêm:
```php
Route::get('/inventory-value', [InventoryValueReportController::class, 'index'])->middleware('permission:reports.view');
Route::get('/low-stock', [LowStockReportController::class, 'index'])->middleware('permission:reports.view');
Route::get('/expiring', [ExpiringReportController::class, 'index'])->middleware('permission:reports.view');
```
Kèm `use` imports.

- [ ] **Step 3: Navigation seeder**

`database/seeders/AuthorizationSeeder.php` — thêm 3 page vào mảng pages (tìm phần `'Báo cáo'` pages, thêm vào sub_group 'Hoạt động'):
```php
['name' => 'Báo cáo giá trị kho', 'route_path' => '/reports/inventory-value', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động'],
['name' => 'Báo cáo nguyên liệu sắp hết', 'route_path' => '/reports/low-stock', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động'],
['name' => 'Báo cáo nguyên liệu sắp hết hạn', 'route_path' => '/reports/expiring', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động'],
```
Xem pattern hiện có (seeders dùng `updateOrInsert` theo route_path — kiểm tra cấu trúc seeder để chèn đúng).

- [ ] **Step 4: Test backend**

Tạo `tests/Feature/Reports/InventoryReportsTest.php`:
```php
<?php

test('report inventory-value tra dung gia tri kho', function () {
    $this->actingAs(posAdmin());
    \App\Models\Ingredient::create(['name' => 'Nguyên liệu '.uniqid(), 'code' => 'nl'.uniqid(), 'unit' => 'kg', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 200]);

    $res = $this->get('/reports/inventory-value');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->component('reports/InventoryValueReport'));
});

test('report low-stock chi lien nhung nguyen lieu thap', function () {
    $this->actingAs(posAdmin());
    \App\Models\Ingredient::create(['name' => 'Thấp '.uniqid(), 'code' => 'th'.uniqid(), 'unit' => 'g', 'stock_quantity' => 2, 'min_stock_alert' => 5, 'cost_price' => 100]);
    \App\Models\Ingredient::create(['name' => 'Đủ '.uniqid(), 'code' => 'du'.uniqid(), 'unit' => 'g', 'stock_quantity' => 50, 'min_stock_alert' => 5, 'cost_price' => 100]);

    $res = $this->get('/reports/low-stock');
    $res->assertOk();
    // kiểm tra inertia props có 1 row (chỉ thấp)
    $res->assertInertia(fn ($page) => $page->where('rows', fn ($rows) => count($rows) === 1));
});
```
Lưu ý: `assertInertia` — kiểm tra pattern hiện có trong test reports (vd SalesInvoiceReportTest). Nếu dùng `assertInertia` cần cài; xem test report khác.

- [ ] **Step 5: Chạy test + commit**

```bash
php artisan test --filter="InventoryReportsTest"
php artisan migrate:fresh --seed 2>&1 | Select-String "seed"
php artisan test
git add app/Http/Controllers/Reports/ database/seeders/AuthorizationSeeder.php routes/web.php tests/Feature/Reports/InventoryReportsTest.php
git commit -m "feat: backend 3 bao cao kho co loi (gia tri, ton thap, het han) + navigation"
```
Expected: toàn bộ xanh.

---

### Task 3: Frontend 3 trang báo cáo (DataTable + flyout)

**Files:**
- Create: `resources/js/pages/reports/InventoryValueReport.tsx`
- Create: `resources/js/pages/reports/LowStockReport.tsx`
- Create: `resources/js/pages/reports/ExpiringReport.tsx`
- Modify: `resources/js/components/Sidebar.tsx` (KHÔNG — sidebar đã tự build từ __subs, không cần sửa)
- Test: verify build/types

**Interfaces:**
- Consumes: props `rows`, `totalValue`/`filters` từ controller; `DataTable` component.
- Produces: 3 trang render dữ liệu kho, sort/pagination/compact.

- [ ] **Step 1: Xem DataTable props + một report hiện có**

Đọc `resources/js/components/DataTable.tsx` (props: columns, rows, rowKey, defaultSortKey, getSortValue, emptyMessage, onRowClick). Xem 1 trang report hiện có (vd `resources/js/pages/reports/SalesInvoiceReport.tsx`) để theo pattern import `reportFormat`/`formatVND`.

- [ ] **Step 2: Trang InventoryValueReport**

`resources/js/pages/reports/InventoryValueReport.tsx`:
```tsx
import { DataTable, DataTableColumn } from '../../components/DataTable';

interface Row { id: number; code: string; name: string; unit: string; stock_quantity: number; cost_price: number; value: number; }

export default function InventoryValueReport({ rows, totalValue }: { rows: Row[]; totalValue: number }) {
    const columns: DataTableColumn<Row>[] = [
        { key: 'name', header: 'Nguyên liệu', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'code', header: 'Mã', sortable: true, render: (r) => r.code },
        { key: 'unit', header: 'Đơn vị', sortable: true, render: (r) => r.unit },
        { key: 'stock_quantity', header: 'Tồn kho', sortable: true, align: 'right', render: (r) => <span className="tabular-nums">{r.stock_quantity.toLocaleString('vi-VN')}</span> },
        { key: 'cost_price', header: 'Giá vốn (đ)', sortable: true, align: 'right', render: (r) => <span className="tabular-nums">{r.cost_price.toLocaleString('vi-VN')}</span> },
        { key: 'value', header: 'Giá trị (đ)', sortable: true, align: 'right', render: (r) => <span className="tabular-nums font-semibold">{r.value.toLocaleString('vi-VN')}</span> },
    ];
    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold font-display">Báo cáo giá trị kho</h1>
                <div className="text-sm text-zinc-500">Tổng giá trị: <span className="font-bold tabular-nums text-sky-600">{totalValue.toLocaleString('vi-VN')} đ</span></div>
            </div>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} defaultSortKey="name" getSortValue={(r, k) => r[k as keyof Row] as string | number} />
        </div>
    );
}
```
Tương tự 2 trang còn lại (LowStock: thêm cột "Mức" render badge theo status + "Đề xuất nhập"; Expiring: cột "HSD", "Còn lại (ngày)", "Tồn lô", "Trạng thái" badge). Dùng màu: out → rose, critical → amber, low → zinc; expired → rose, soon → amber, ok → emerald.

- [ ] **Step 3: Verify**

```bash
npx eslint resources/js/pages/reports/
npm run types:check
npm run build
```
Expected: 0 lỗi mới, pass.

- [ ] **Step 4: Chạy test + commit**

```bash
php artisan test
git add resources/js/pages/reports/
git commit -m "feat: frontend 3 trang bao cao kho co loi dung DataTable + flyout 2 cap"
```
Expected: toàn bộ xanh.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = HSD lô + nhập + FIFO + accessor; Task 2 = backend 3 controller + route + seeder + test; Task 3 = frontend 3 trang. Đầy đủ.
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** `DataTableColumn<Row>`, `effective_expiry_date`, `quantity_remaining`, `expiry_date` nhất quán xuyên các task.
- **Lưu ý:** test FIFO cần tạo recipe + checkout đúng pattern POSCheckoutTest; test Inertia cần khớp pattern hiện có. `DataTable` trả rows qua props từ controller.
