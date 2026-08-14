# Design: Trang chủ nằm riêng + Sidebar flyout 2 cấp kiểu file tree

**Ngày:** 2026-08-13
**Phạm vi:** (A) tách trang chủ `/` khỏi nhóm "Quản lý" thành group "Trang chủ" ở đầu sidebar; (B) đổi dropdown Báo cáo (group có `__subs`) thành **flyout 2 cấp** — menu cấp 1 dọc chứa sub_group, hover mở menu cấp 2 bên phải ngang hàng dòng tương ứng.

Tiếp nối plan `2026-08-13-dashboard-home-and-report-groups` (branch `feat/dashboard-home-report-groups`).

---

## Bối cảnh & Vấn đề

- Trang chủ `/` (DashboardManager) hiện nằm trong group "Quản lý" (item "Tổng quan") — muốn tách riêng, đứng đầu để dễ quay lại.
- Group Báo cáo hiện dùng **mega-menu 2 cột** (cột trái sub_group, cột phải items) — user muốn kiểu **flyout 2 cấp** giống File Tree của VS Code: menu cấp 1 chứa sub_group, hover 1 sub_group → menu cấp 2 mở bên phải ngang hàng dòng đó, khoảng cách 4–8px, bo góc đồng bộ 12px.

## Mục tiêu

1. Sidebar hiện group "Trang chủ" đầu tiên, chứa route `/`.
2. Group có `__subs` (Báo cáo) → flyout 2 cấp:
   - Cấp 1: danh sách sub_group (dọc), mỗi dòng có ChevronRight nhỏ bên phải.
   - Hover sub_group → cấp 2 mở **bên phải, ngang hàng dòng** (vd `left-full ml-2`), hiển thị items.
   - `rounded-xl` (12px) — khớp bo góc card/drawer.
3. Group không `__subs` (Quản lý, Kho, Nhân viên, Phân quyền) → giữ dropdown 1 cột phẳng như cũ.
4. Giữ nguyên: active highlight, đóng khi click ngoài / Escape, mixed flat+`__subs` hiển thị flat items.

---

## Kiến trúc

### A. Trang chủ nằm riêng

**Seeder `AuthorizationSeeder`:**
- Page `Tổng quan` (route_path `/`): đổi `group_name` → `'Trang chủ'`, `sort_order` → `1`.
- Các page khác trong group "Quản lý" giữ nguyên (group "Quản lý" vẫn còn Danh mục, Sản phẩm, Bàn & Sơ đồ, Khuyến mãi, Danh sách Order).
- Lưu ý: đảm bảo `sort_order` không trùng page khác trong group "Trang chủ" (chỉ có 1 page).

**Cập nhật DB hiện có:** chạy lại seeder hoặc thêm update trong seeder (dùng `updateOrInsert` theo route_path — entry `/` đã có, chỉ cần sửa group_name/sort_order).

### B. Sidebar flyout 2 cấp

**`Sidebar.tsx` — thay mega-menu 2 cột hiện tại bằng flyout 2 cấp:**

Hiện `Sidebar.tsx` có block mega-menu 2 cột (cột trái sub_group + cột phải items). Thay bằng:

- Dropdown group có `__subs` → **menu cấp 1** (chiều rộng `w-48`), chứa:
  - Các sub_group: nút dọc, hover set `activeSubGroup`, ChevronRight bên phải.
  - Flat items (mixed group) hiện dưới cùng như link thường.
- **Menu cấp 2**: khi `activeSubGroup` set, render panel bên phải:
  ```
  <div className="absolute left-full top-0 ml-2 w-56 rounded-xl border ... shadow-xl">
    {items của activeSubGroup}
  </div>
  ```
  - Vị trí: `left-full` (đẩy hẳn sang phải cạnh menu cấp 1) + `top-0` (bắt đầu ngang hàng dòng sub_group đầu — đúng yêu cầu "bắt đầu ngang hàng với dòng Doanh thu").
  - `ml-2` = khoảng cách 8px giữa cấp 1 và cấp 2 (4–8px theo yêu cầu).
  - `rounded-xl` (12px) — bo góc đồng bộ.
- **Quản lý trạng thái:**
  - `activeSubGroup` reset mỗi khi mở group (set sub_group đầu tiên, hoặc sub chứa page đang active nếu có).
  - Hover sub_group → set `activeSubGroup`.
  - Click ngoài / Escape → đóng (giữ logic hiện tại).
- Group không `__subs` → dropdown phẳng 1 cột (giữ nguyên, không đổi).

**Type:** `NavGroup = NavItem[] | { __subs: Record<string, NavItem[]> }` (đã có từ plan trước).

---

## Error handling

- Group `__subs` rỗng (không sub nào) → menu cấp 1 trống, không render cấp 2.
- Mixed group (có flat + `__subs`) → flat items hiển thị dưới cấp 1, không bị mất (fix từ plan trước giữ nguyên).
- `activeSubGroup` không hợp lệ (sub đã xoá) → fallback sub đầu tiên.
- Click ngoài vùng dropdown (kể cả khi flyout cấp 2 đang mở) → đóng cả 2 cấp (logic `handleClickOutside` hiện tại bao cả dropdown cha).

---

## Testing

- PHP: seeder đổi group_name/sort_order cho page `/` (NavigationTest cập nhật nếu assert group "Quản lý" chứa Tổng quan — kiểm tra và sửa).
- Frontend: `npm run types:check && npm run build` pass.
- Kiểm tra thủ công: hover Báo cáo thấy cấp 1 (Doanh thu, Hoạt động) + cấp 2 bên phải ngang hàng; group khác dropdown cũ; Trang chủ đứng đầu.

---

## Không nằm trong phạm vi

- Đổi toàn bộ sidebar sang dạng dọc trái (user đã chọn giữ header ngang).
- Thay đổi nội dung DashboardManager.
