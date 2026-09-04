# Design: Hallmark Fixes Plan 1 — Critical + Major anti-pattern

Ngày: 2026-09-04
Trạng thái: Approved (design trình bày + xác nhận)

## Bối cảnh

Audit Hallmark toàn frontend (96 pages/components, app.css) phát hiện AI-slop. Plan 1 xử 3 critical + 9 major.
Quyết định: C1 = sửa 2 shell chung + 3 trang mẫu phân biệt; palette chuẩn = **zinc** (thống nhất 3 hệ đang lẫn).

## C1. Sửa shell chung — ManagerPageLayout + ReportPage

**`resources/js/components/ManagerPageLayout.tsx`** (12 trang manager):
- Hết card bọc toàn bộ `<main>`: `rounded-2xl shadow-xs border` → `<main class="flex-1 min-w-0 space-y-4">` (không border). DataTable giữ card riêng.
- Header: `:54` icon-tile (`rounded-xl bg-sky-50...`) → icon nhỏ inline + title + subtitle (không tile nền).
- Eyebrow header (`text-xs uppercase tracking-wider`) → sentence-case label gọn.
- Props interface GIỮ NGUYÊN (không đổi API component — chỉ className).

**`resources/js/components/reports/ReportPage.tsx`** (14 report):
- Bỏ card bọc header + card bọc metrics → một surface: tiêu đề + metrics inline (`tabular-nums`, text-2xl) + filter bar + bảng — chỉ 1 card duy nhất.

**Hai shell là điểm leverage**: sửa 1 lần lan 26 trang. Sau đó 3 trang mẫu phân biệt:

## C1b. 3 trang mẫu

- **`manager/promotions/PromotionsManager.tsx`** → thay DataTable bằng **kanban 3 cột**: Đang chạy / Sắp kết thúc (≤7 ngày) / Đã kết thúc — mỗi card nhỏ: name, code, end_date, đếm mã dùng; drag? KHÔNG (không drag — chỉ phản ánh trạng thái; preview thực hiện hành động giữ nguyên).
- **`manager/tables/TableManager.tsx`** → **status-strip** đầu trang: available/occupied/reserved/maintenance (đếm + chip màu) + bảng giữ nguyên.
- **`manager/inventory/ingredients/IngredientsManager.tsx`** → **summary strip** đầu trang: tổng loại, sắp hết (≤ min_stock_alert), sắp hết hạn (≤7 ngày) + bảng giữ nguyên.

## C2. Palette zinc thống nhất

- `resources/css/app.css` @theme: slate → zinc (nếu có màu token theo slate).
- File outlier: `resources/js/pages/manager/settings/Settings.tsx`, `components/UserDropdown.tsx`, `pages/profile/components/SettingsOtpOverlay.tsx`, `pages/auth/Auth.tsx` — đổi gray-*/slate-* → zinc-* TƯƠNG ỨNG (light + dark).

## C3. zinc-850 → zinc-900

- `PagesManager.tsx:494`, `UsersPermission.tsx:301`, `ExcelImportModal.tsx:183`, `KitchenOrderCard.tsx:267`, `OrderDetail.tsx:238-256` — s/Zinc-850/Zinc-900/.

## M1. Receipt dữ liệu thật

- `ReceiptPrintModal.tsx:150-155`: hardcode "ĐỨC'S COFFEE & CÀ PHÊ / Địa chỉ: Hà Nội / Hotline: 0988 xxx xxx / Wi-Fi" → props/Inertia share:
  - `PaymentDrawer` truyền prop: `storeName`, `storeAddress`, `storePhone`, `storeWifi` (từ Inertia share `payment_qr`-style: thêm `store_info` trong `HandleInertiaRequests`) hoặc config.
  - Nếu thiếu → render chỗ trống (không chữ mẫu).
- `:177` "NV: Admin" → tên user thật (props từ user).

## M2. focus-visible

4 file: `Sidebar.tsx:285`, `POSMenuTab.tsx:114`, `POSTableTab.tsx:184`, `PaymentDrawer.tsx:696-744` → thêm `focus-visible:ring-2 focus-visible:ring-sky-500`; `outline-none` chỉ giữ khi có ring thay thế.

## M3. transition-all → transition-colors

15+ chỗ (Auth, PagesManager, POSMenuTab, POSTableTab, PaymentDrawer, PromotionFormDrawer, ServingDisplay, DashboardManager...) — chỉ chuyển màu dùng `transition-colors`; giữ `transition-transform` khi animate X/Y; `transition-all` chỉ khi thật cần (hiếm).

## M4. Bỏ hover-lift phổ biến

- `app.css:42-50` (btn-primary/secondary/danger `hover:-translate-y-0.5 active:scale-[0.98]`) → giữ trên `btn-primary` duy nhất; secondary/danger → `hover:bg-zinc-100` (không lift).
- `POSMenuTab.tsx:114`, `POSTableTab.tsx:184` tile lift → `hover:border-sky-400`.
- `PaymentDrawer.tsx:831,840,853,865` `active:scale-95` → bỏ (chỉ hover).

## M5. shadow-2xl → shadow-lg (16 modal/drawer)

Danh sách: CancelReservationModal:31, TransferMergeModal:169, ReduceItemModal:45, RefundModal:111, VoidItemModal:118, StockImportModal:194, PromotionFormDrawer:320, ReceiptPrintModal:116, SupplierPaymentsModal:89, TableFormDrawer:186, CustomerFormDrawer:88, SupplierFormDrawer:92, CategoryFormDrawer:87, ProductFormDrawer:206, IngredientFormDrawer:99, PaymentDrawer:273, ReservationFormDrawer:73 — đổi 2xl → lg (giữ hairline border).

## M6. POS hover-only delete

`POSCartPanel.tsx:662-676`: icon xóa luôn hiển thị `opacity-60`; nếu giữ hover thì `sm:group-hover` vẫn có nhưng tối thiểu luôn bấm được trên touch; thêm `aria-label="Xóa món"`.

## M7. Contrast

Sàn: `text-zinc-400` → `text-zinc-600` (light) / `dark:text-zinc-300` cho decorative; `text-zinc-500` → `text-zinc-600`; `text-white/70` (KitchenOrderCard:216) → `text-white/85`. Điểm mẫu: DataTable:188,159, DashboardManager:407, POSCartPanel:597, KitchenOrderCard:216 (+ quét tiếp các chỗ 400/500 tương tự).

## M8 + M9. A11y bảng & nút đóng

- `resources/js/components/DataTable.tsx:162-168` + `resources/js/components/reports/ReportTable.tsx:239-245`: `<th onClick>` → thêm `aria-sort` (asc/desc/none), `role="button"`/`tabindex="0"`, phím Enter/Space.
- ~20 icon-only close buttons (CategoryFormDrawer:93-98, ProductFormDrawer:212-217, PromotionCodesModal:169, UsersPermission:560,666, RolesManager:390, PagesManager:584...) → `aria-label="Đóng"`.

## Testing

- Không đổi logic nghiệp vụ (route/interfaces props giữ nguyên). Chạy: `npx tsc --noEmit`, `npm run build`, `npx eslint .`, `php artisan test` (không vỡ — UI only).
- Smoke màn: 12 manager + Reports + POS + Auth.

## Global Constraints

- KHÔNG thêm dependency.
- Giữ nguyên props interfaces component chung.
- Đổi màu theo thang zinc; dark tương ứng.
- Footer/nav không đụng (ngoài scope) trừ 2 shell.
