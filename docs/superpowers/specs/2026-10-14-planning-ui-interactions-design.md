# Spec 2 — Nhất quán thị giác và tương tác planning

- Ngày: 2026-10-14
- Trạng thái: Đã duyệt phạm vi phân chia; chờ người dùng duyệt nội dung spec.
- Thứ tự: 2/3, sau `2026-10-14-planning-information-layout-design.md`.

## 1. Mục tiêu và độ bao phủ

Hoàn thiện giao diện năm trang planning bằng hệ thiết kế hiện có; thao tác được bằng chuột, bàn phím và cảm ứng. Bao phủ Major #3 (màu), #4 (tương phản), #5 (bàn phím/modal), phần planning của #6 (responsive), Minor #9 (font), cùng lỗi date picker chưa thống nhất.

Navbar dùng chung thuộc spec 3. Nội dung và thứ tự thông tin theo spec 1. Không đổi thuật toán, routes, quyền hoặc hợp đồng request nghiệp vụ.

## 2. Quyết định thiết kế

### 2.1. Màu có vai trò cố định

- CTA chính, focus và trạng thái chọn: sky.
- Quan sát/thực tế: sky, đường liền.
- Dự báo: purple, đường đứt.
- Thành công: emerald; cảnh báo: amber; lỗi/nguy hiểm: rose.
- Dữ liệu mô phỏng được nhận diện bằng nhãn chữ nguồn, không đổi màu quan sát thành màu dự báo.
- Không dùng màu duy nhất để phân biệt trạng thái: giữ nhãn, nét đường, icon phù hợp.

Thêm token biểu đồ theo vai trò vào `resources/css/app.css` ở vị trí phù hợp với Tailwind hiện có; tham chiếu token màu Tailwind thay vì hex rải rác. Có biến thể dark nếu cần để đạt tương phản. UI tiêu chuẩn tiếp tục dùng utility/class chung hiện có; không tạo bộ token hoặc theme cạnh tranh.

`ActualForecastChart`, `ForecastCheckResults` và `ModelMetricChart` cùng dùng vai trò màu nhất quán. Biểu đồ so sánh mô hình giữ logic phân biệt được chọn/ứng viên; không tô mỗi mô hình một màu ngẫu nhiên.

### 2.2. Typography và tương phản

- Heading trang/card/modal: `font-display` (Plus Jakarta Sans).
- Nội dung, input và bảng: Inter; số tiền/số lượng/ngày/giờ/ID dùng `tabular-nums`.
- Dữ liệu nghiệp vụ chính ưu tiên 14 px; chữ trợ giúp tối thiểu 12 px. Tránh 10–11 px cho dữ liệu người dùng cần đối chiếu.
- Chữ nhỏ đạt WCAG 4,5:1; chữ lớn/icon có ý nghĩa/focus ring đạt 3:1 trên nền thực tế, cả light/dark.
- Thay màu chữ mờ không đủ tương phản, không chỉ tăng kích thước để che vấn đề.
- Nút, input và select cùng hàng có chiều cao nhất quán; điều khiển tương tác chính đạt vùng chạm 44 px. Icon nhỏ được bọc vùng chạm đủ lớn.

### 2.3. DatePicker chung

Trong `ForecastChecks.tsx`, thay input `type="date"` bằng `DatePicker` hiện có, `mode="single"`:
- `value`: ngày bắt đầu hoặc null.
- `onChange`: cập nhật ngày bắt đầu, chuyển null thành trạng thái chưa chọn hợp lệ với form.
- `minDate`/`maxDate`: lấy từ `checkDateBounds` như hiện tại.
- `disabled`: khi không có khoảng ngày hợp lệ.
- Hiển thị dd/mm/yyyy, truyền YYYY-MM-DD; không parse qua UTC.

Giữ hai nút lùi/tiến 7 ngày và giới hạn của chúng. Chọn ngày không tự gửi request. Ngày kết thúc = bắt đầu + 6; cutoff = bắt đầu − 1. Form chặn ngày trống/ngoài biên và báo lỗi đọc được, thay vai trò `required` của input cũ.

Đổi dataset tiếp tục cập nhật ngày và món theo contract hiện có. Kết quả đã chạy giữ nhãn của chính lượt đó; thay lựa chọn vẫn có cảnh báo stale.

Theo yêu cầu người dùng, **giữ nguyên `datetime-local`** tại `TableFormModal.tsx` và `ReservationFormDrawer.tsx`. Không xây time picker hoặc thêm mode giờ cho `DatePicker`.

Chỉ sửa nội bộ `DatePicker` nếu kiểm chứng phát hiện lỗi chặn tích hợp này; nếu cần, nêu impact trên mọi caller và bổ sung kiểm thử hồi quy single/range. Mặc định chỉ tích hợp tại trang.

### 2.4. Bàn phím, form và modal

- Bảng mô hình kiểm tra 7 ngày có nút thực trong ô tên mô hình. Tab/Enter/Space chọn được; click dòng có thể giữ như tiện ích bổ sung. Công bố trạng thái được chọn bằng `aria-pressed` của nút; không gán role button lên cả dòng chứa nhiều ô.
- Tab hiển thị panel dùng semantics tablist/tab/tabpanel, `aria-selected`, liên kết ID; hỗ trợ mũi tên, Home/End và focus theo mẫu tab. Các nút toggle đơn dùng `aria-pressed`.
- Input/select có label liên kết hoặc accessible name; lỗi có `aria-invalid` và `aria-describedby` khi phù hợp. Nút icon có nhãn cụ thể.
- Modal/drawer: focus vào điều khiển phù hợp khi mở, giữ Tab/Shift+Tab bên trong, trả focus khi đóng; bỏ qua phần tử hidden/disabled. Escape đóng khi không đang gửi thao tác không cho phép đóng.
- Khóa scroll nền khi overlay mở, khôi phục khi đóng/unmount; nội dung nền không nhận tương tác trong khi modal hoạt động.
- Dùng pattern overlay hiện có nếu đáp ứng được yêu cầu; không thêm thư viện modal. Nếu cần chia sẻ helper focus nhỏ giữa overlay planning, helper chỉ quản lý vòng đời focus/scroll, không gộp nghiệp vụ các modal.
- Các lỗi bất đồng bộ được hiển thị gần tác vụ, công bố bằng live region thích hợp. Đang xử lý có nhãn và khóa thao tác tương ứng; thất bại không được hiển thị như thành công.
- Chuẩn hóa focus-visible tức thời, hover, active, disabled và loading; trạng thái lỗi/thành công áp dụng khi tác vụ có các trạng thái đó.

### 2.5. Responsive trong planning

- Bỏ min-width cứng trên input ở mobile; flex child chứa text/input có `min-w-0` khi cần.
- Nhãn tab theo spec 1, không lặp bản dịch tiếng Anh. Dưới 640 px, hai tầng chọn tab/panel của trang đánh giá dùng select có label tương ứng; từ 640 px dùng tab. Hai cách hiển thị dùng chung state và chỉ một cách hiện diện trong thứ tự Tab tại một thời điểm; không làm nhãn nút xuống hai dòng.
- Bộ lọc và header xếp dọc trên mobile; nút chính có thể rộng toàn hàng.
- Bảng sản phẩm/nhập hàng giữ bản thẻ mobile. Bảng phân tích được cuộn ngang trong vùng bảng có nhãn; trang không cuộn ngang. Giữ đầy đủ số liệu và cách chọn mô hình bằng bàn phím.
- Drawer chiếm toàn chiều rộng ở màn hẹp, không giữ khoảng chừa trái desktop; nội dung và footer cuộn/neo hợp lý trong viewport thấp.
- Thanh phê duyệt phía dưới giữ tổng tiền, số mục, lý do bị chặn và CTA nhìn thấy được. Nội dung cuối trang không bị thanh che; tính safe-area trên thiết bị có vùng an toàn.
- `DatePicker` không vượt viewport, không bị cắt bởi container, dùng được cạnh cuối trang và khi viewport thấp.
- Hỗ trợ reduced motion cho animation liên quan; tắt animation biểu đồ khi người dùng yêu cầu giảm chuyển động. Không thêm chuyển động trang trí.

## 3. File và dữ liệu

File dự kiến: năm trang trong `resources/js/pages/planning/`; các component biểu đồ, drawer, review modal, status banner trong `resources/js/components/planning/`; `resources/css/app.css`; helper focus/token nhỏ nếu cần; tài liệu kiến trúc khi thay đổi pattern.

Không ghi đè CSS entry: giữ imports/Tailwind và các token hiện có. Không sửa blanket style toàn bộ ứng dụng chỉ để giải quyết một trang. Mọi thay đổi shared CSS/component phải có impact upstream và kiểm chứng callers.

Luồng dữ liệu giữ nguyên: props kết quả từ server; lựa chọn biểu đồ tại client; DatePicker chỉ cập nhật state; thao tác chạy/phê duyệt dùng route hiện có. Không tự chạy lại forecast khi đổi màu, ngày hoặc model đang xem.

## 4. Nghiệm thu

- Cùng ý nghĩa màu ở tổng quan, drawer/tooltip, kiểm tra 7 ngày và đánh giá mô hình; kiểm tra computed colors thực tế.
- Heading đúng font; chữ nghiệp vụ đủ tương phản ở cả hai theme. Ghi cặp màu và tỷ lệ, không chỉ xác nhận bằng mắt.
- Chọn model hoàn toàn bằng bàn phím; trạng thái và biểu đồ tương ứng được cập nhật.
- Mọi modal liên quan đạt mở/đóng/Tab vòng/Shift+Tab/Escape/trả focus; không focus được nền. Đang gửi không thể kích hoạt lặp bằng bàn phím.
- DatePicker: chọn/gõ ngày, xóa hoặc nhận null, min/max, tháng giao năm, năm nhuận, đổi dataset, lùi/tiến tuần, disabled và stale result; không lệch ngày.
- Tại 320/375/414/768 px và 1280×800: không overflow toàn trang, không CTA bị che hoặc nhãn click xuống hai dòng; bảng cuộn cục bộ; thử tên sản phẩm/NCC dài, số lớn và lỗi hiển thị.
- Kiểm tra cả states có dữ liệu, rỗng, loading, failed, stale, thiếu quyền. Không tuyên bố giao diện đạt nếu chỉ đọc code.
- Chạy `npm run types:check`, `npm run build`, lint file đổi, test logic/date/request hiện có liên quan; thêm regression cho hành vi có rủi ro thực tế. Nếu đụng PHP, chạy toàn bộ `php artisan test` trên sqlite `:memory:` cùng static analysis PHP.

## 5. Bàn giao

Lưu danh sách phát hiện đã xử lý và bằng chứng viewport/theme/keyboard. Nếu môi trường chưa có browser hoặc dữ liệu kiểm thử được cấp, ghi rõ blocker; phần nghiệm thu trực quan chưa được đánh dấu hoàn thành. Sau spec này chuyển sang navbar shared của spec 3.
