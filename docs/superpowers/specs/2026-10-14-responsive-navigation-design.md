# Spec 3 — Điều hướng responsive dùng chung

- Ngày: 2026-10-14
- Trạng thái: Người dùng đã duyệt spec; chuyển sang lập kế hoạch triển khai.
- Thứ tự: 3/3, sau hai spec hoàn thiện planning ngày 2026-10-14.

## 1. Mục tiêu

Xử lý phần navbar của Major #6 trong audit: menu nhóm hiện giữ một hàng, flyout hai cấp có thể vượt viewport nhỏ. Đây là thay đổi shared, cần hồi quy các phân hệ và tập quyền, không chỉ planning.

Hai spec liên quan:
- `2026-10-14-planning-information-layout-design.md`
- `2026-10-14-planning-ui-interactions-design.md`

## 2. Phạm vi

Sửa cách trình bày và tương tác của `resources/js/components/Sidebar.tsx` (hiện là top navigation), cùng điểm nối trong `DashboardLayout.tsx` nếu cần. Dữ liệu navigation tiếp tục từ server, gồm nhóm phẳng, nhóm `__subs` và mixed group. Không tạo menu hard-code riêng cho mobile; không đổi page registry, permission, route, tên nhóm hoặc thứ tự nghiệp vụ.

Giữ luồng đăng xuất, theme và avatar. Không áp dụng header cho màn hình đã chủ động dùng `hideNavbar`.

## 3. Thiết kế điều hướng

### 3.1. Khi đủ chiều rộng

Giữ topbar desktop: thương hiệu, nhóm điều hướng, avatar. Nhóm phẳng mở một dropdown; nhóm có `__subs` mở flyout hai cấp theo pattern đã có. Click có thể ghim/mở menu; hover tiếp tục phục vụ chuột, không là cách duy nhất để mở.

Giữ quy tắc timer đóng khoảng 200 ms và không reset subgroup khi đi qua khoảng cách giữa hai panel. Không biến toàn bộ dropdown phẳng thành flyout.

### 3.2. Khi thiếu chiều rộng

Hiện topbar gọn: thương hiệu có giới hạn chiều rộng, nút **Menu**, avatar. Nút Menu mở panel điều hướng dạng disclosure bên dưới topbar, các nhóm xếp dọc. Panel đẩy nội dung xuống, không giả là modal, không cần focus trap.

- Nhóm phẳng: accordion chứa links.
- Nhóm có `__subs`: accordion hai cấp dọc; mixed group có links phẳng sau các nhóm con.
- Không dùng panel `left-full` trên mobile.
- Panel có chiều cao tối đa theo viewport còn lại và cuộn dọc; link không bị cắt.
- Mở menu khôi phục nhánh trang hiện tại nếu có; người dùng có thể mở nhóm khác. Đóng menu, chọn link hoặc đổi route sẽ đóng các panel liên quan theo một quy tắc nhất quán.
- Link tên dài giữ một dòng bằng ellipsis khi cần; accessible name vẫn đầy đủ, không chỉ dựa vào `title` để cung cấp tên.

Ngưỡng chuyển chế độ dựa trên **chiều rộng thực tế đủ chứa thương hiệu + toàn bộ nhóm được cấp quyền + avatar**, có khoảng cách dự phòng 16 px. Dưới 768 px luôn dùng chế độ gọn; từ 768 px trở lên vẫn dùng chế độ gọn nếu không đủ chỗ. Đo lại khi resize, font tải xong hoặc navigation thay đổi; tránh vòng lặp bật/tắt do đo phần tử đã bị ẩn. Dùng khả năng DOM/ResizeObserver, không thêm thư viện responsive.

### 3.3. Desktop flyout gần mép màn hình

- Dropdown cấp 1 được căn trong viewport với lề an toàn tối thiểu 8 px.
- Flyout cấp 2 ưu tiên mở phải, đủ chỗ thì giữ pattern hiện có; thiếu chỗ bên phải thì mở trái.
- Nếu cả hai phía không đủ chỗ, hiện nhánh con dạng dọc trong panel thay vì đẩy ra ngoài viewport.
- Chiều cao menu giới hạn theo không gian còn lại, cuộn trong panel; mở không làm trang cuộn ngang.
- Dropdown không bị cắt bởi overflow của layout; không thêm `overflow-x: hidden` để che lỗi bố cục.

### 3.4. Trạng thái active và ngữ nghĩa

- Nhóm cha được đánh dấu active nếu chứa route hiện tại.
- Link con active lấy route khớp cụ thể nhất, bỏ query/hash khi so đường dẫn. `/planning` không đồng thời sáng như trang hiện tại khi đang ở `/planning/products`.
- `aria-current="page"` chỉ trên link hiện tại; button mở nhóm có `aria-expanded` và `aria-controls`.
- Dùng semantics navigation/disclosure với button và link native; không gán `role="menu"` nếu không triển khai đầy đủ quy ước keyboard menu ứng dụng.
- Tab đến được nút và links đang hiện; phần đóng không tham gia thứ tự Tab.
- Enter/Space mở nhóm. Escape đóng cấp sâu nhất đang mở và trả focus về nút mở cấp đó; tiếp tục Escape đóng menu ngoài.
- Click ngoài đóng dropdown/menu thích hợp; không làm mất click vào link đang chọn.
- Chạm mở được từng cấp, không phụ thuộc hover. Vùng chạm tối thiểu 44 px, focus-visible rõ và tức thời.

### 3.5. Tương tác với layout

Giữ topbar sticky và thứ tự lớp: nội dung trang dưới dropdown; modal nghiệp vụ ở trên navbar. Trong `fullWidth`, mở panel không được làm nội dung vĩnh viễn mất chiều cao/cuộn; đóng phải khôi phục bố cục.

Thiết bị viewport thấp vẫn đọc và chọn được menu. Reduced motion áp dụng nếu có chuyển động; ưu tiên mở/đóng trực tiếp thay vì animation chiều cao.

## 4. Kiến trúc và files

- `resources/js/components/Sidebar.tsx`: state mở/ghim/nhánh, active route và chọn cách hiển thị theo chiều rộng.
- Có thể tách phần render menu mobile hoặc helper xác định route/placement thành file nhỏ cạnh Sidebar nếu giúp đọc rõ; không xây navigation framework.
- `resources/js/layouts/DashboardLayout.tsx`: chỉ đổi khi cần kết nối layout, không đổi nghiệp vụ notification hoặc layout trang độc lập.
- `docs/PROJECT_CONTEXT_AND_ROUTING.md`: ghi contract responsive và phân nhóm vẫn dùng dữ liệu server.
- Test liên quan navigation/route, fixture dữ liệu chỉ chứa giá trị giả phục vụ kiểm thử, không credential.

State desktop và mobile dùng cùng nguồn navigation; khi đổi chế độ đóng popover không còn hợp lệ, bảo đảm focus không nằm trong phần tử ẩn. Quyền do server quyết định, frontend không tự thêm mục bị thiếu.

Trước khi sửa, GitNexus impact upstream cho Sidebar, DashboardLayout và các symbol liên quan; báo phạm vi callers/processes và cảnh báo HIGH/CRITICAL. Kiểm tra cả callers fullWidth/hideNavbar trước khi quyết định thay đổi shared layout.

## 5. Kiểm thử và tiêu chí nghiệm thu

Ma trận dữ liệu navigation:
- Nhóm phẳng; nhóm chỉ có `__subs`; mixed group; nhóm rỗng; tên dài.
- Admin nhiều nhóm nhất; manager; staff; tài khoản có ít quyền, chỉ dùng props được cấp.
- Trang `/planning`, `/planning/products`, `/planning/forecast-checks`, báo cáo có nhóm con và trang ngoài planning.

Ma trận thiết bị:
- 320/375/414/768 px và desktop 1280×800/1920 px; cả light/dark.
- Viewport thấp; resize qua ngưỡng khi menu mở; font tải chậm; thay navigation.
- Chuột đi qua khoảng cách flyout, click ghim, click ngoài; cảm ứng; bàn phím Tab/Shift+Tab/Enter/Space/Escape.

Nghiệm thu:
- Không overlap thương hiệu/menu/avatar; không tràn ngang, mất mục hoặc flyout ngoài viewport.
- Mọi route được cấp quyền truy cập được ở cả hai chế độ; mục bị chặn không tự xuất hiện.
- Một link cụ thể có `aria-current`; nhóm cha active chính xác.
- Escape/focus/click hoạt động ổn định; đóng không để phần tử ẩn giữ focus.
- Modal planning luôn nằm trên navbar; fullWidth và hideNavbar giữ hành vi đúng.
- Hồi quy smoke các trang quản lý, báo cáo và POS đang dùng layout; giữ desktop flyout hai cấp hiện có.
- Chạy test helper/interaction liên quan, `npm run types:check`, `npm run build`, lint file đổi. Không thay backend; nếu phạm vi sau đó buộc sửa PHP, phải chạy full `php artisan test` trên sqlite `:memory:` và static analysis PHP.
- Kiểm thử browser là bắt buộc để chốt responsive; lưu bằng chứng, không thay bằng suy đoán từ code.

## 6. Hoàn tất chuỗi 3 spec

Đối chiếu toàn bộ audit: spec 1 xử lý #1/#2/#7/#8/#10; spec 2 xử lý #3/#4/#5/#9, responsive planning của #6 và date picker; spec 3 xử lý navbar của #6. Chạy kiểm tra xuyên suốt cuối chuỗi: mở planning qua menu, chọn ngày kiểm tra, đổi mô hình, đọc đề xuất và mở/đóng modal bằng bàn phím trên mobile/desktop.

Các phát hiện mới ngoài phạm vi được ghi riêng. Chỉ đánh dấu hoàn tất các tiêu chí đã có bằng chứng; không mở rộng sang time picker hoặc đổi thiết kế các phân hệ khác.
