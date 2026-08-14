# Design: Dashboard làm trang chủ + Báo cáo 2 cấp (sub-group + mega-menu)

**Ngày:** 2026-08-13
**Phạm vi:** (A) chuyển dashboard manager thành trang chủ tại `/`; (B) nhóm Báo cáo thành 2 cấp qua cột `sub_group` trên bảng `pages`, Sidebar dùng mega-menu 2 cột.

---

## Bối cảnh & Vấn đề

- Trang `/` hiện render `welcome` (trống), trong khi dashboard thực nằm ở `/dashboard` (`DashboardController::index` → DashboardManager).
- Nhóm "Báo cáo" có 8 mục kéo dài trong 1 dropdown phẳng; sắp tới thêm nhiều báo cáo nữa.

## Mục tiêu

1. Truy cập `/` → hiện DashboardManager (dashboard làm trang chủ). Route `/dashboard` cũ redirect 301 sang `/`.
2. Báo cáo gom thành 2 sub-group: **Doanh thu** (5 báo cáo) và **Hoạt động** (3 báo cáo), cấu hình động qua bảng `pages`.
3. Sidebar: group có sub_group → **mega-menu 2 cột** (cột trái danh sách sub_group có mũi tên `›`; hover/click → cột phải hiện items). Group không sub_group → giữ dropdown phẳng như cũ.

---

## Kiến trúc

### A. Dashboard làm trang chủ

**Route (`routes/web.php`):**
```php
Route::get('/', [DashboardController::class, 'index'])->middleware('permission:dashboard.view');
Route::get('/dashboard', function () { return redirect('/', 301); })->middleware('permission:dashboard.view');
```
- Bỏ `Route::inertia('/', 'welcome')`.
- `DashboardController::index` giữ nguyên — chỉ đổi URL route.
- Trang `welcome` không còn dùng trong nav (page `/` cũ bị gộp/xoá — xem bên dưới).

**Bảng `pages` — dữ liệu:**
- Page `Trang chủ | / | Tổng quan` (sort=1) — **xoá** khỏi seeder (route `/` giờ là dashboard, không cần entry riêng; tránh trùng route_path `/`).
- Page `Tổng quan | /manager/dashboard | Quản lý` (sort=18) — đổi `route_path` → `/`, giữ `name` "Tổng quan", `group_name` "Quản lý", sort=18.
- Kết quả: vào app → `/` DashboardManager; sidebar "Quản lý" active "Tổng quan" (route_path `/` khớp `currentUrl === '/'`).
- **Cập nhật `AuthorizationSeeder`** (không chỉ migration): xoá entry "Trang chủ", đổi entry "Tổng quan" route_path thành `/`, thêm `sub_group` cho 8 báo cáo.

### B. Báo cáo 2 cấp (sub-group)

**Migration:** thêm cột `sub_group` string(50) nullable vào `pages`.

**Dữ liệu `sub_group` cho 8 báo cáo:**
| route_path | name | sub_group |
|---|---|---|
| /reports/sales-invoices | Báo cáo hoá đơn bán hàng | Doanh thu |
| /reports/invoice-items | Báo cáo chi tiết hoá đơn | Doanh thu |
| /reports/product-details | Báo cáo chi tiết sản phẩm | Doanh thu |
| /reports/payments | Báo cáo thanh toán | Doanh thu |
| /reports/profit | Báo cáo lợi nhuận | Doanh thu |
| /reports/cancelled | Báo cáo đơn huỷ | Hoạt động |
| /reports/reservations | Báo cáo đặt bàn | Hoạt động |
| /reports/shifts | Báo cáo ca làm | Hoạt động |

**`HandleInertiaRequests::share` — navigation 2 tầng:**

Khi build `$navigation[$page->group_name]`:
- Nếu page có `sub_group`: nhóm dưới `navigation[group]['__subs'][sub_group][]`.
- Nếu không có `sub_group`: `navigation[group][]` (flat như cũ).

Shape:
```php
$navigation = [
  "Báo cáo" => [
    '__subs' => [
      "Doanh thu" => [ ['id','name','route_path'], ... ],
      "Hoạt động" => [ ['id','name','route_path'], ... ],
    ],
  ],
  "Quản lý" => [ ['id','name','route_path'], ... ],  // không sub_group → flat
];
```

### C. Sidebar mega-menu 2 cột

**State:** `openGroup`, `activeSubGroup` (mặc định = sub_group đầu tiên khi mở group).

**Render:**
- Group value là **array** (flat) → dropdown 1 cột như hiện tại (không đổi).
- Group value là **object có `__subs`** → mega-menu:
  ```
  [Báo cáo ▾]
    ┌────────────────┬──────────────────────────┐
    │ Doanh thu   ›  │ Báo cáo hoá đơn bán hàng │
    │ Hoạt động  ›  │ Báo cáo chi tiết hoá đơn │
    │               │ Báo cáo chi tiết sản phẩm │
    │               │ Báo cáo thanh toán        │
    └────────────────┴──────────────────────────┘
  ```
- Cột trái: danh sách sub_group (hover → set `activeSubGroup`); mỗi dòng có icon mũi tên phải `ChevronRight`.
- Cột phải: items của `activeSubGroup`, mỗi item là `<Link>` (active highlight như cũ).
- Click ngoài / Escape / chọn item → đóng (giữ logic hiện tại `handleClickOutside`, `handleMouseLeave`).
- `hasActiveChild` (highlight group button khi có item active) — mở rộng: nếu bất kỳ sub_group nào chứa item active.

**PagesManager (`resources/js/pages/admin/PagesManager.tsx`):**
- Thêm cột/hiển thị `sub_group` (text input) trong form + bảng quản lý trang.

**Page model:** thêm `sub_group` vào `$fillable`.

---

## Error handling & biên tập

- Xoá page `/` cũ + đổi route_path `/manager/dashboard` → `/` phải đồng bộ trong seeder `AuthorizationSeeder` (để DB mới sau `migrate:fresh --seed` khớp). Update seeder trực tiếp, không chỉ migration.
- `welcome` page: bỏ khỏi nav; file `welcome.tsx` có thể giữ cho tương lai (đăng nhập redirect) hoặc xoá — **giữ file**, chỉ bỏ khỏi route/nav.
- Cache `user_inertia` TTL 7200s → sau khi sửa dữ liệu pages, cần flush hoặc chạy với TTL cũ. Plan phải thêm bước flush cache tag `user_inertia` (tồn tại sẵn trong AppServiceProvider khi role/page đổi — verify).

## Testing

- PHP: `HandleInertiaRequests` — navigation chứa `__subs` cho group Báo cáo, flat cho Quản lý; route `/` render DashboardManager; `/dashboard` redirect 301 → `/`.
- Frontend: `npm run types:check && npm run build` pass; Sidebar mega-menu render sub_group + items; dropdown phẳng không đổi.
- Kiểm tra thủ công: vào `/` thấy dashboard; hover "Báo cáo" thấy 2 cột; nhóm khác vẫn dropdown cũ.

---

## Không nằm trong phạm vi

- Đổi nội dung DashboardManager.
- Thêm báo cáo mới (chỉ cấu trúc nav).
- Thay đổi quyền truy cập.
