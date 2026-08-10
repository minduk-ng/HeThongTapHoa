# Kho UI Refactor — Nhóm Kho, Đơn vị nhập, DataTable chung, Trang chi tiết phiếu

> Design spec: cải thiện giao diện kho — tách nhóm hiển thị "Kho", hỗ trợ đơn vị mua + quy đổi khi nhập, tạo shared DataTable refactor 5 bảng quản lý, chuyển chi tiết phiếu sang trang riêng.

**Goal:** Đưa 3 trang kho (nguyên liệu/định lượng/phiếu) vào nhóm "Kho" riêng; cho phép nhập kho theo đơn vị mua (kg/l) tự quy đổi; tạo `DataTable` generic dùng chung cho 5 bảng quản lý + bảng phiếu; tách trang chi tiết phiếu theo pattern OrderList→OrderDetail.

**Scope:** Frontend chủ yếu + 1 migration nhỏ (2 cột ingredients) + seeder group_name. KHÔNG đổi URL route (`/manager/inventory/*` giữ nguyên), KHÔNG đổi logic phiếu xuất/checkout.

---

## Phần 1 — Nhóm "Kho" trong navigation

**File:** `database/seeders/AuthorizationSeeder.php`

Đổi `group_name` của 3 page từ `'Quản lý'` → `'Kho'`:
- `/manager/inventory/ingredients` (Nguyên liệu)
- `/manager/inventory/recipes` (Định lượng món)
- `/manager/inventory/vouchers` (Phiếu kho)

**Cơ chế:** `HandleInertiaRequests.php` tự nhóm navigation theo `group_name` — không cần sửa frontend nav. Sidebar render nhóm "Kho" mới.

**Lưu ý cache:** `user_inertia` data được cache 2h (`Cache::tags(['user_inertia', "user_{id}"])`) — sau `db:seed`, phải flush cache `user_inertia` để nhóm mới hiện ngay (đối với user đang login, cache theo từng user id). Ghi rõ trong plan: `Cache::tags(['user_inertia'])->flush()` hoặc tương đương.

**Verify:** `db:seed` → query `pages` có 3 record group='Kho'; `HandleInertiaRequests` trả navigation chứa nhóm Kho.

---

## Phần 2 — Đơn vị mua + quy đổi khi nhập kho

### Migration

File mới `add_purchase_unit_to_ingredients` (hoặc gộp — plan quyết):
```
ingredients.purchase_unit      string(20)  nullable   // đơn vị mua, vd 'kg', 'l'; null = cùng unit gốc
ingredients.unit_conversion    decimal(12,4) default 1  // 1 purchase_unit = N unit gốc (kg→g = 1000)
```

### Model

`Ingredient` — thêm `purchase_unit`, `unit_conversion` vào `$fillable`.

### IngredientFormDrawer (trang nguyên liệu)

Thêm 2 field khi tạo/sửa nguyên liệu:
- "Đơn vị mua" (text input, optional) — vd 'kg', 'l', 'gói', 'hộp'
- "Hệ số quy đổi" (number, default 1) — 1 đơn vị mua = N đơn vị gốc

**IngredientController::store/update** — thêm 2 field vào validate + fillable.

### StockImportModal (nhập kho)

Mỗi dòng nhập nguyên liệu:
- **`displayUnit`** = `purchase_unit ?? unit` của nguyên liệu đã chọn.
- **Ô SL:** placeholder `SL ({displayUnit})` (vd `SL (kg)` khi purchase_unit='kg').
- **Ô Đơn giá:** hiển thị suffix `đ/{displayUnit}` (vd `đ/kg`), placeholder/input rõ ràng.
- **Preview:** "10 kg × 200.000 đ/kg"; tổng giá trị phiếu theo đơn vị mua.
- **Payload submit (quy đổi về đơn vị gốc):**
  - `quantity` = `số nhập × unit_conversion` (vd 10 kg → 10000 g)
  - `unit_price` = `đơn giá ÷ unit_conversion` (vd 200.000 đ/kg → 200 đ/g)
  - Nếu `purchase_unit` null → `unit_conversion = 1`, không quy đổi.

**IngredientData interface** thêm `purchase_unit?: string | null`, `unit_conversion?: number`.

**Controllers select thêm 2 cột:** `IngredientController::index` + `StockVoucherController::index/show` đang select `['id','code','name','unit','stock_quantity','min_stock_alert','cost_price']` → thêm `purchase_unit`, `unit_conversion`.

### Backend store không đổi

`StockVoucherController::store` vẫn nhận `quantity`/`unit_price` theo **unit gốc** (frontend đã quy đổi). WAC cost_price tính trên unit gốc — nhất quán với phiếu xuất/checkout.

### Kiểm thử

- Migration: `ingredients` có `purchase_unit`/`unit_conversion` (schema test).
- Quy đổi: test payload 10kg×200.000 → quantity 10000, unit_price 200; WAC đúng trên unit gốc.
- Không đổi: phiếu xuất vẫn ghi unit gốc.

---

## Phần 3 — Shared DataTable component

### Tạo `resources/js/components/DataTable.tsx` (generic)

Props:
```tsx
interface DataTableColumn<T> {
    key: string;
    header: React.ReactNode;
    sortable?: boolean;
    render: (row: T) => React.ReactNode;
    className?: string;
    headerClassName?: string;
    compactClassName?: string;
    hideWhenCompact?: boolean;
    align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    onRowClick?: (row: T) => void;
    emptyMessage?: string;
    defaultSortKey?: string;
    defaultSortDirection?: 'asc' | 'desc';
    defaultPageSize?: number;
    getSortValue?: (row: T, key: string) => string | number;
    showCompactToggle?: boolean;
    showPageSize?: boolean;
    rowClassName?: (row: T) => string;
}
```

**Chứa sẵn (từ pattern IngredientTable/ProductTable):**
- State: `isCompact`, `pageSize` (20/50/100), `currentPage`, `sortField`, `sortDirection`.
- Logic: `handleSort`, `sortedItems` (generic sort qua `getSortValue`), `paginatedItems`, `safeCurrentPage`, `totalPages`.
- Header: sort icons (ChevronUp/Down), `align`, `hideWhenCompact`.
- Empty state: `emptyMessage`, `colSpan` = columns.length.
- Footer: compact toggle (`showCompactToggle`), page size selector (`showPageSize`), pagination (first/prev/next/last).
- `onRowClick` trên `<tr>`.

### Refactor 5 bảng dùng DataTable (giữ render cell, đổi khung xương)

| File | Hiện tại | Sau refactor |
|---|---|---|
| `IngredientTable.tsx` | 317 | ~120 |
| `ProductTable.tsx` | 360 | ~140 |
| `CategoryTable.tsx` | 404 | ~120 |
| `RecipeTable.tsx` | 357 | ~130 |
| `TableListTable.tsx` | 326 | ~120 |

- Mỗi bảng: định nghĩa `columns` array (render cell giữ nguyên), gọi `<DataTable columns rows rowKey ... />`.
- `CategoryTable` giữ `expandedIds` + expand logic (tree feature riêng) — chỉ bỏ khung xương.
- `PromotionTable` (146) + `ReportTable` (302) — KHÔNG đụng (cấu trúc khác).

### Bảng phiếu kho dùng DataTable

`StockVouchersManager` list → dùng DataTable (cột mã phiếu/loại/thời điểm/ghi chú/người tạo, `onRowClick` → `/manager/inventory/vouchers/{id}`).

### Dead code cleanup (BẮT BUỘC sau refactor)

- **Xoá `IngredientFilterBar.tsx`** (dead code đã tồn tại, không được import).
- Mỗi bảng: bỏ import không dùng (`ChevronUp`/`ChevronDown`/`Rows3`), bỏ `SortField`/`SortDirection` type + `isCompact`/`pageSize`/`currentPage`/`sortField`/`sortDirection` state + `handleSort`/`sortedItems`/`paginatedItems`/`renderSortIcon` (đã chuyển vào DataTable).
- `StockVouchersManager`: xoá `detail` prop + block detail render cũ + `VoucherDetailItem`/`VoucherDetail` interfaces (Section 5).
- Verify: `grep -r "IngredientFilterBar\|Rows3" resources/js` = 0 kết quả; `npm run types:check` + `npm run build` pass.

### Kiểm thử

- `npm run types:check` + `npm run build` pass.
- Các test hiện có của IngredientsManager/ProductsManager/Categories/Recipes/Tables (nếu có) pass — refactor không đổi behavior render.

---

## Phần 4 — StockImportModal cải thiện hiển thị đơn vị

(Chi tiết ở Phần 2 — gộp cùng quy đổi đơn vị.)

Tóm tắt hiển thị:
- Ô SL: placeholder `SL ({displayUnit})`.
- Ô Đơn giá: suffix `đ/{displayUnit}`.
- Preview: "10 kg × 200.000 đ/kg", tổng theo đơn vị mua.
- Payload: quantity × conversion, unit_price ÷ conversion.

---

## Phần 5 — Trang chi tiết phiếu riêng

### Backend `StockVoucherController`

- `index()` — bỏ `detail` prop (chỉ trả `vouchers`, `filters`, `ingredients`).
- `show()` — render trang riêng `manager/inventory/vouchers/StockVoucherDetail` với props:
  - `voucher`: `{ id, voucher_code, type, transacted_at, note, employee_name }`
  - `items`: `[{ ingredient_id, code, name, unit, purchase_unit, quantity, unit_price, total }]`
  - `total`: tổng giá trị (import); null/0 cho export

### Frontend

- **`StockVouchersManager.tsx`** (list): xoá `detail` prop + block detail render + interfaces; row click → `router.get('/manager/inventory/vouchers/{id}')` (điều hướng, giống OrderList). Dùng DataTable.
- **`StockVoucherDetail.tsx`** (mới): pattern OrderDetail —
  - Header: back button → `/manager/inventory/vouchers`, `voucher_code`, type badge.
  - Info banner: thời điểm, loại phiếu, ghi chú, người tạo.
  - Items table: từng dòng nguyên liệu, quantity (âm = xuất, dương = nhập), đơn giá theo **đơn vị gốc** (`unit` — payload đã quy đổi về unit gốc khi ghi phiếu), thành tiền = `quantity × unit_price`.
  - Tổng: tổng giá trị (import) / "—" (export).

### Routes

Không đổi — `/manager/inventory/vouchers/{id}` đã tồn tại, chỉ đổi response shape.

---

## Chiến lược kiểm thử

- **Backend:** schema test purchase_unit/unit_conversion; WAC test sau quy đổi; show() render đúng props.
- **Frontend:** `npm run types:check` + `npm run build`; grep dead code = 0.
- **Navigation:** `db:seed` → 3 page group='Kho' → HandleInertiaRequests trả nhóm Kho.
- **Regression:** full suite `php artisan test` (không đổi backend logic chính).

## File Structure

**Tạo mới:**
- `database/migrations/2026_08_10_000001_add_purchase_unit_to_ingredients.php`
- `resources/js/components/DataTable.tsx`
- `resources/js/pages/manager/inventory/vouchers/StockVoucherDetail.tsx`

**Sửa:**
- `database/seeders/AuthorizationSeeder.php` — group_name 3 page → 'Kho'
- `app/Models/Ingredient.php` — fillable + purchase_unit/unit_conversion
- `app/Http/Controllers/Manager/IngredientController.php` — store/update validate + index select
- `app/Http/Controllers/Manager/StockVoucherController.php` — index bỏ detail, show render detail, select thêm 2 cột
- `resources/js/pages/manager/inventory/ingredients/components/IngredientFormDrawer.tsx` — 2 field đơn vị mua
- `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` — displayUnit + quy đổi payload
- `resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx` — refactor DataTable
- `resources/js/pages/manager/products/components/ProductTable.tsx` — refactor DataTable
- `resources/js/pages/manager/categories/components/CategoryTable.tsx` — refactor DataTable (giữ tree)
- `resources/js/pages/manager/inventory/recipes/components/RecipeTable.tsx` — refactor DataTable
- `resources/js/pages/manager/tables/components/TableListTable.tsx` — refactor DataTable
- `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx` — DataTable + bỏ detail
- `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx` — sửa IngredientData props (nếu cần)

**Xoá:**
- `resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx` (dead code)
