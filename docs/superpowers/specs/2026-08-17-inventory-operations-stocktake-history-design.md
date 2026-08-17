# Design: Báo cáo Kho Vận Hành + Kiểm Kê + Lịch Sử Tồn Kho

**Ngày:** 2026-08-17
**Phạm vi:** 4 chức năng kho vận hành: (1) Báo cáo Nhập-Xuất-Tồn, (2) Báo cáo Tiêu thụ nguyên liệu, (3) Kiểm kê kho (type `adjustment`), (4) Trang Lịch sử tồn kho theo nguyên liệu. Tất cả dùng `DataTable.tsx`; trang `/reports/*` dùng flyout 2 cấp (quy tắc 15 AGENTS.md).

---

## Bối cảnh & Vấn đề

Plan 1 (spec `2026-08-17-inventory-lot-expiry-core-reports-design.md`) đã thêm HSD theo lô + 3 báo cáo cốt lõi. Còn thiếu nhóm vận hành: theo dõi dòng chảy nhập/xuất/tồn, tiêu thụ nguyên liệu qua món bán, kiểm kê đối chiếu tồn thực tế, và lịch sử giao dịch từng nguyên liệu.

## Quyết định

- **Kiểm kê**: thêm `type='adjustment'` vào `stock_vouchers`; mỗi dòng `stock_voucher_items` mang số **âm/dương** nguyên liệu (chênh lệch giữa tồn lý thuyết và thực tế). Áp dụng trực tiếp lên `stock_quantity` + cập nhật `quantity_remaining` lô theo FIFO (hoặc tồn hiện tại).
- **Báo cáo N-X-T**: tổng hợp theo nguyên liệu trong kỳ.
- **Tiêu thụ**: món ĐÃ BÁN (invoice_lines) → recipe × qty, kèm giá trị.
- **Lịch sử**: giao dịch từng nguyên liệu từ `stock_voucher_items`, số dư sau mỗi giao dịch (dựng từ `quantity_remaining` / stock_vouchers).

---

## Kiến trúc & Thay đổi

### 1. Báo cáo Nhập-Xuất-Tồn — `/reports/stock-movement`

**Controller** `app/Http/Controllers/Reports/StockMovementReportController.php`:

Với mỗi nguyên liệu trong kỳ (`from`→`to`, lọc theo `stock_voucher.transacted_at`):
```php
$vouchers = StockVoucherItem::with('voucher', 'ingredient')
    ->whereHas('voucher', fn ($q) => $q->whereBetween('transacted_at', [$from, $to]))
    ->get()
    ->groupBy('ingredient_id');

$rows = $vouchers->map(function ($items, $ingId) {
    $in  = $items->where('voucher.type', 'import')->sum('quantity');
    $out = $items->where('voucher.type', 'export')->sum('quantity');
    $adj = $items->where('voucher.type', 'adjustment')->sum('quantity');
    $ing = $items->first()->ingredient;
    // Tồn cuối kỳ = tồn hiện tại; tồn đầu kỳ = tồn hiện tại − in + out − adj
    $end = (float) $ing->stock_quantity;
    $begin = round($end - $in + $out + $adj, 2);
    return [
        'ingredient_id' => $ingId,
        'name' => $ing->name,
        'unit' => $ing->unit,
        'begin_qty' => $begin,
        'import_qty' => $in,
        'export_qty' => $out,
        'adjust_qty' => $adj,
        'end_qty' => $end,
    ];
});
```
Cột: Nguyên liệu, Đơn vị, Tồn đầu kỳ, Nhập, Xuất, Điều chỉnh, Tồn cuối kỳ. Filter: khoảng ngày, tìm kiếm.

### 2. Báo cáo Tiêu thụ — `/reports/consumption`

**Controller** `app/Http/Controllers/Reports/ConsumptionReportController.php`:

Món đã bán (invoice_lines trong kỳ) → recipe × qty:
```php
$lines = InvoiceLine::whereBetween('created_at', [$from, $to])
    ->where('quantity', '>', 0)
    ->get(['menu_item_id', 'quantity', 'subtotal']);

$recipes = ProductRecipe::with('ingredient')->whereIn('menu_item_id', $lines->pluck('menu_item_id')->unique())->get();

$consumption = collect();
foreach ($lines as $line) {
    foreach ($recipes->where('menu_item_id', $line->menu_item_id) as $r) {
        $consumption->put($r->ingredient_id, ($consumption->get($r->ingredient_id, 0) + $r->amount * $line->quantity));
    }
}
$rows = $consumption->map(fn ($qty, $ingId) => [
    'name' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->name,
    'unit' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->unit,
    'quantity' => round($qty, 2),
    'cost' => round($qty * $recipes->firstWhere('ingredient_id', $ingId)->ingredient->cost_price, 2),
]);
```
Cột: Nguyên liệu, Đơn vị, Lượng tiêu thụ, Giá trị tiêu thụ. Filter: khoảng ngày, tìm kiếm.

### 3. Kiểm kê kho — `/inventory/stocktake`

**Migration** `2026_08_17_000002_add_adjustment_to_stock_vouchers_type.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE stock_vouchers MODIFY COLUMN type ENUM('import','export','adjustment') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE stock_vouchers MODIFY COLUMN type ENUM('import','export') NOT NULL");
    }
};
```
- `stock_vouchers.type` hiện là `enum('import','export')` (migration `2026_08_10_000011`). Mở rộng thêm `'adjustment'`.
- LƯU Ý: nếu test dùng SQLite `:memory:` → `DB::statement ALTER MODIFY ENUM` sẽ lỗi như plan promotion trước. Thay bằng `Schema::table('stock_vouchers', fn ($t) => $t->enum('type', ['import','export','adjustment'])->change());` nếu cross-driver. Kiểm tra và dùng pattern phù hợp.

**Route**:
```php
Route::get('/inventory/stocktake', [StocktakeController::class, 'index'])->middleware('permission:inventory.stocktake.view');
Route::post('/inventory/stocktake', [StocktakeController::class, 'store'])->middleware('permission:inventory.stocktake.create');
```

**Controller** `app/Http/Controllers/Manager/StocktakeController.php`:
- `index`: danh sách nguyên liệu với tồn lý thuyết (`stock_quantity`), form nhập số thực tế.
- `store`: nhận `[{ingredient_id, actual_qty}]`. Với mỗi nguyên liệu:
  - Chênh lệch `delta = actual_qty − stock_quantity`.
  - Tạo phiếu `StockVoucher::create(['type' => 'adjustment', ...])` + dòng `StockVoucherItem::create(['ingredient_id', 'quantity' => $delta, 'unit_price' => null])` (quantity âm/dương).
  - Cập nhật `stock_quantity = actual_qty`.
  - Cập nhật `quantity_remaining` lô theo FIFO: nếu `delta < 0` (thiếu) trừ từ lô cũ nhất; nếu `delta > 0` (dư) tạo 1 lô điều chỉnh không HSD (hoặc cộng vào lô hiện tại).
- Dispatch `IngredientStockUpdated`.

**Trang React** `resources/js/pages/manager/inventory/stocktake/StocktakeManager.tsx`:
- Bảng `DataTable` liệt kê nguyên liệu + ô nhập số thực tế (input number cạnh mỗi dòng), nút "Lưu kiểm kê" gọi POST. Hiển thị chênh lệch live (thực tế − lý thuyết).
- Sau khi lưu → redirect/về danh sách phiếu điều chỉnh (StockVouchersManager đã có filter type).

**Seed/Permission**: thêm `inventory.stocktake.view`, `inventory.stocktake.create` (quy tắc 9 AGENTS.md — seeder + RoleController + RolesManager dictionary).

### 4. Lịch sử tồn kho — `/inventory/history`

**Route**:
```php
Route::get('/inventory/history', [StockHistoryController::class, 'index'])->middleware('permission:inventory.history.view');
```

**Controller** `app/Http/Controllers/Manager/StockHistoryController.php`:
- Input: `ingredient_id` (bắt buộc), khoảng ngày, loại phiếu.
- Lấy `StockVoucherItem` của nguyên liệu join `stock_voucher`, sort theo `transacted_at` asc.
- Dựng số dư sau mỗi giao dịch:
```php
$running = 0.0;
$rows = $items->map(function ($it) use (&$running) {
    $running += (float) $it->quantity;   // dấu theo type: import +, export −, adjustment ±
    return [
        'transacted_at' => $it->voucher->transacted_at?->format('d/m/Y H:i'),
        'voucher_code' => $it->voucher->voucher_code,
        'type' => $it->voucher->type,
        'quantity' => $it->quantity,      // +/−
        'note' => $it->voucher->note,
        'balance' => round($running, 2),
    ];
});
```
- Dấu quantity: import → dương; export → âm; adjustment → theo delta. (Kiểm tra dữ liệu hiện tại: xuất `createStockExportVoucher` ghi `quantity => -$totalUsed` — dấu âm có sẵn. Nhập ghi dương. Vậy chỉ cần adjustment ± và running balance cộng thẳng.)

**Trang React** `resources/js/pages/manager/inventory/history/StockHistoryManager.tsx`:
- Select nguyên liệu + DataTable (thời gian, phiếu, loại, số lượng ±, ghi chú, số dư). Filter khoảng ngày + loại phiếu.

---

## Error handling

- Kiểm kê nhập rỗng → báo lỗi "Chưa có nguyên liệu nào được nhập số thực tế".
- Chênh lệch 0 → bỏ qua nguyên liệu đó (không tạo phiếu adjustment).
- FIFO khi adjustment âm vượt tổng lô còn tồn → trừ tối đa có thể, phần dư để stock_quantity âm + log.
- Lịch sử không có dữ liệu → DataTable empty.

## Testing

- N-X-T: nhập 10, xuất 4, adjustment +2 → begin = end − in + out + adj (chạy ngược lại), tổng hợp đúng.
- Tiêu thụ: bán 2 ly món có recipe 10g/ly → tiêu thụ 20g, giá trị = 20 × cost.
- Kiểm kê: tồn lý thuyết 10, nhập thực tế 7 → delta −3, phiếu adjustment type, stock = 7, lô trừ 3 FIFO; lưu thành công.
- Lịch sử: dựng đúng balance sau mỗi giao dịch, dấu đúng.
- `php artisan test` toàn bộ xanh; `npx eslint`, `npm run types:check`, `npm run build`.

## Không nằm trong phạm vi

- Báo cáo cốt lõi (Plan 1).
- Báo cáo xu hướng / dự báo / COGS nâng cao.
- Nhập kho theo lô giá khác nhau (giá giữ ở cấp ingredient).
