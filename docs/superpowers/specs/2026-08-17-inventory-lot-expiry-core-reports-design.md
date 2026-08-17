# Design: HSD theo lô + Báo cáo Kho Cốt Lõi (Giá trị kho / Tồn thấp / Sắp hết hạn)

**Ngày:** 2026-08-17
**Phạm vi:** (A) Hạ tầng HSD theo lô nhập — thêm `expiry_date` + `quantity_remaining` vào `stock_voucher_items`, trừ xuất kho theo FIFO; (B) 3 báo cáo kho cốt lõi tại `/reports/*` dùng `DataTable.tsx` + flyout 2 cấp (quy tắc 15 AGENTS.md).

---

## Bối cảnh & Vấn đề

Hệ thống kho hiện có: `ingredients` (tồn, `cost_price`, `min_stock_alert`, `expiry_date` đơn lẻ), `stock_voucher_items` (dòng nhập/xuất PN/PX — KHÔNG có HSD), tự động trừ kho khi checkout. Thiếu:
1. **HSD theo lô**: khi nhập kho nhiều lô khác hạn, không biết lô nào còn tồn → báo cáo hết hạn không chính xác.
2. **Báo cáo kho cốt lõi**: không có giá trị kho, tồn thấp tổng hợp, sắp hết hạn.

## Quyết định

- **Lô = dòng nhập kho** (`stock_voucher_items`): mỗi dòng nhập PN là 1 lô, có `expiry_date` + `quantity_remaining` riêng.
- **Xuất kho trừ FIFO**: khi checkout tạo phiếu xuất, trừ `quantity_remaining` theo HSD tăng dần (lô cũ nhất trước).
- **`ingredients.expiry_date`** (cũ) trở thành trường hiển thị/phụ — HSD chính xác lấy từ lô còn tồn sớm nhất. Giữ cột để tương thích dữ liệu cũ.
- **3 báo cáo**: dùng `DataTable.tsx` (sort/pagination/compact), flyout 2 cấp trong navigation group "Báo cáo".
- **Báo cáo** trong `/reports/*` thêm vào sub_group **"Hoạt động"** (group "Báo cáo" đã có __subs: Doanh thu / Hoạt động).

---

## Kiến trúc & Thay đổi

### Phần A — Hạ tầng HSD theo lô

**1. Migration** (`2026_08_17_000001_add_expiry_to_stock_voucher_items.php`):
```php
Schema::table('stock_voucher_items', function (Blueprint $table) {
    $table->date('expiry_date')->nullable()->after('quantity');
    $table->decimal('quantity_remaining', 15, 2)->nullable()->after('expiry_date');
});
```
- `quantity_remaining` nullable; khi nhập = `quantity`; khi xuất giảm dần; khi điều chỉnh (Plan 2) ±.
- `stock_voucher_items.quantity` là `decimal(15,2)` hiện có → `quantity_remaining` dùng decimal cùng độ chính xác.

**2. Model `StockVoucherItem`:** thêm `expiry_date`, `quantity_remaining` vào `$fillable` + casts (`expiry_date` → `date`, `quantity_remaining` → `float`).**3. `StockVoucherController@store` (nhập PN):** validation `items.*.expiry_date` nullable date; tạo item với `quantity_remaining = quantity`.

```php
'items.*.expiry_date' => ['nullable', 'date'],
```
Khi create:
```php
'expiry_date' => $item['expiry_date'] ?? null,
'quantity_remaining' => $item['quantity'],
```

**4. `CheckoutService::createStockExportVoucher` (xuất tự động):** trừ FIFO theo lô.

Hiện tại trừ tổng `$ingredient->decrement('stock_quantity', $totalUsed)`. Thêm bước: lấy các lô còn tồn của ingredient (quantity_remaining > 0) sort theo expiry_date asc, trừ dần:

```php
// Sau khi decrement stock_quantity, trừ quantity_remaining theo lô FIFO
$remaining = $totalUsed;
$lots = StockVoucherItem::where('ingredient_id', $ingredientId)
    ->where('quantity_remaining', '>', 0)
    ->orderBy('expiry_date', 'asc')   // lô cũ nhất trước
    ->lockForUpdate()
    ->get();
foreach ($lots as $lot) {
    if ($remaining <= 0) break;
    $take = min($lot->quantity_remaining, $remaining);
    $lot->decrement('quantity_remaining', $take);
    $remaining -= $take;
}
// Nếu còn dư (thiếu lô) — để stock_quantity âm nếu cần, hoặc ghi cảnh báo log
```

Lưu ý: `createStockExportVoucher` là static trong CheckoutService, gọi trong transaction checkout — thêm lockForUpdate cho lô để tránh race.

**5. `Ingredient` — HSD hiệu lực:** thêm accessor tính HSD sớm nhất còn tồn:
```php
// Trong Ingredient model
public function getEffectiveExpiryDateAttribute(): ?string
{
    $earliest = StockVoucherItem::where('ingredient_id', $this->id)
        ->where('quantity_remaining', '>', 0)
        ->whereNotNull('expiry_date')
        ->orderBy('expiry_date', 'asc')
        ->value('expiry_date');
    return $earliest ? \Carbon\Carbon::parse($earliest)->toDateString() : null;
}
```
Append vào API khi cần (IngredientController index hoặc báo cáo query trực tiếp).

### Phần B — 3 Báo cáo kho cốt lõi

**Navigation (seeder):** thêm 3 page mới vào bảng `pages` với `group_name='Báo cáo'`, `sub_group='Hoạt động'`, route `/reports/inventory-value`, `/reports/low-stock`, `/reports/expiring`. Permission `reports.view`.

**Controller mới** trong `app/Http/Controllers/Reports/` (theo pattern ReportController hiện có, trả Inertia + array rows):

**1. `InventoryValueReportController@index` — `/reports/inventory-value`:**
```php
$rows = Ingredient::with('recipes')->get()->map(fn ($i) => [
    'id' => $i->id,
    'code' => $i->code,
    'name' => $i->name,
    'unit' => $i->unit,
    'stock_quantity' => $i->stock_quantity,
    'cost_price' => $i->cost_price,
    'value' => round($i->stock_quantity * $i->cost_price, 2),
]);
```
Cột bảng: Nguyên liệu, Mã, Đơn vị, Tồn kho, Giá vốn (đ), Giá trị (đ). Tổng cộng giá trị hiển thị header. Filter: tìm kiếm tên/mã.

**2. `LowStockReportController@index` — `/reports/low-stock`:**
```php
$rows = Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')
    ->get()
    ->map(fn ($i) => [
        ...,
        'status' => $i->stock_quantity <= 0 ? 'out' : ($i->stock_quantity <= $i->min_stock_alert * 0.2 ? 'critical' : 'low'),
        'suggest_qty' => max(0, round($i->min_stock_alert * 2 - $i->stock_quantity, 2)),  // đề xuất mua gấp đôi ngưỡng
    ]);
```
Cột: Nguyên liệu, Tồn kho, Ngưỡng tối thiểu, Mức (Hết hàng/Khẩn cấp/Thấp), Đề xuất nhập. Color: out → rose, critical → amber, low → zinc.

**3. `ExpiringReportController@index` — `/reports/expiring`:**
Từng lô còn tồn (`stock_voucher_items` quantity_remaining > 0, expiry_date not null), nổi bật:
```php
$rows = StockVoucherItem::with('ingredient')
    ->where('quantity_remaining', '>', 0)
    ->whereNotNull('expiry_date')
    ->get()
    ->map(fn ($it) => [
        'ingredient_name' => $it->ingredient?->name,
        'unit' => $it->ingredient?->unit,
        'expiry_date' => $it->expiry_date?->format('d/m/Y'),
        'days_left' => now()->diffInDays($it->expiry_date, false),
        'quantity_remaining' => $it->quantity_remaining,
        'status' => $it->expiry_date->lt(now()) ? 'expired' : ($it->expiry_date->lte(now()->addDays(7)) ? 'soon' : 'ok'),
    ]);
```
Cột: Nguyên liệu, HSD, Còn lại (ngày), Tồn lô, Trạng thái (Quá hạn/Sắp hết hạn/OK). Filter: trạng thái.

**Trang React** (`resources/js/pages/reports/`):
- `InventoryValueReport.tsx`, `LowStockReport.tsx`, `ExpiringReport.tsx`.
- Dùng `DataTable.tsx` cho bảng; `ReportFilterBar` hoặc search đơn giản; nút Export Excel qua `reportExport` (exportXLSX) nếu cần; `font-display` cho tiêu đề; `tabular-nums` cho số.
- Layout: header tiêu đề + tổng cộng + DataTable.

**Báo cáo KHÔNG dùng ReportTable** — dùng DataTable (quyết định user).

---

## Error handling

- Nhập kho không có expiry_date → lô đó không vào báo cáo hết hạn (bỏ qua, không lỗi).
- Xuất kho vượt tổng lô còn tồn (dữ liệu cũ chưa có quantity_remaining) → nếu tất cả lô quantity_remaining = null, bỏ qua bước trừ lô (chỉ trừ stock_quantity như cũ), log warning.
- Báo cáo trống → DataTable hiển thị empty message.

## Testing

- Migration + model + nhập kho có HSD.
- FIFO: nhập 2 lô (HSD 1/1 còn 10, HSD 1/2 còn 10), bán dùng 12 → lô 1 hết (0), lô 2 còn 8.
- `effective_expiry_date` trả HSD sớm nhất còn tồn.
- 3 báo cáo trả đúng rows; low-stock phân mức; expiring phân trạng thái.
- `php artisan test` toàn bộ xanh; `npx eslint`, `npm run types:check`, `npm run build`.

## Không nằm trong phạm vi

- Báo cáo vận hành (N-X-T, tiêu thụ), kiểm kê, lịch sử tồn kho → Plan 2.
- Thay đổi `cost_price` nhập kho theo lô (giữ giá ở cấp ingredient; giá lô chỉ tham chiếu).
- Báo cáo xu hướng / dự báo.
