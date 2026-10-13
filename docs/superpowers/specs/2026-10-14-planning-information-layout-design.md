# Spec 1 — Thông tin và bố cục Dự báo & kế hoạch

- Ngày: 2026-10-14
- Trạng thái: Đã duyệt phạm vi phân chia; chờ người dùng duyệt nội dung spec.
- Thứ tự: 1/3; thực hiện trước spec UI/tương tác và spec điều hướng responsive.

## 1. Mục tiêu và căn cứ

Giúp người quản lý hiểu đúng kết quả dự báo và nhận ra việc cần làm trước. Audit ngày 2026-10-14 dựa trên mã nguồn, chưa xác nhận bằng trình duyệt. Các nhận định responsive phải được kiểm chứng khi triển khai.

Bao phủ phát hiện audit: Critical #1 (card trong card), Major #2 (diễn giải mô hình), Major #7 (thứ tự thông tin), Major #8 (trạng thái rỗng), Minor #10 (thuật ngữ).

Tài liệu liên quan:
- `2026-10-13-weekly-forecast-inspection-design.md`: phân biệt kiểm tra một khoảng lịch sử với lựa chọn mô hình chính thức.
- `2026-10-14-planning-ui-interactions-design.md`: màu, typography, tương phản, tương tác và responsive trong planning.
- `2026-10-14-responsive-navigation-design.md`: navbar dùng chung.

## 2. Phạm vi và ranh giới

Sửa lớp trình bày, lời giải thích và dữ liệu mô tả cần thiết cho trạng thái UI. Giữ thuật toán dự báo, cách tính sai số, cơ chế lựa chọn mô hình, quyền, routes, quy trình phê duyệt và dữ liệu nghiệp vụ hiện có.

Không suy luận “đủ tồn kho” từ mảng rỗng; không suy luận một mô hình đang áp dụng toàn cửa hàng từ số sản phẩm được chọn. Nếu props hiện tại không phân biệt được trạng thái, bổ sung metadata nhỏ ở controller tương ứng, không tạo engine hoặc API mới.

## 3. Thiết kế thông tin

### 3.1. Mô hình được đề xuất

`ModelEvaluation.tsx` hiện sắp ứng viên theo `selected_count` giảm dần, rồi `avg_wape` tăng dần, nhưng lời giải thích nói “WAPE thấp nhất”. Giữ tiêu chí hiện có; sửa lời giải thích:

- Tiêu đề: **Mô hình được chọn cho nhiều sản phẩm nhất**.
- Hiện số sản phẩm được chọn; WAPE là chỉ số tham khảo riêng.
- Giải thích: ưu tiên số sản phẩm được chọn, khi bằng nhau ưu tiên WAPE thấp hơn trong các giá trị xác định.
- Nếu nhiều ứng viên cùng số lượng và WAPE, nói rõ có đồng hạng; không tuyên bố một mô hình tốt nhất duy nhất.
- Không có sản phẩm được chọn (`selected_count` đều bằng 0) hoặc chưa có kết quả đánh giá: **Chưa có mô hình khuyến nghị**; CTA khuyến nghị bị vô hiệu hóa, có lý do đọc được.
- Nhãn từng dòng: **Được chọn cho X sản phẩm** hoặc **Chưa được chọn**. Không dùng “Đang áp dụng” để diễn đạt `selected_count > 0`.
- CTA: **Áp dụng cho toàn cửa hàng**. Modal giải thích phạm vi thực tế: áp dụng cho các mặt hàng đủ điều kiện trong lượt dự báo tiếp theo; không sửa kết quả lịch sử.
- Các CTA áp dụng riêng từng ứng viên vẫn tuân theo quyền và điều kiện backend hiện có; không cho trạng thái chưa đánh giá trông giống ứng viên đã được kiểm chứng.

Trang kiểm tra 7 ngày tiếp tục dùng **Sai số thấp nhất trong khoảng này**, không đổi thành mô hình tối ưu chung và không tự áp dụng vào vận hành.

### 3.2. Thứ tự tổng quan

DOM và thứ tự đọc:
1. Tiêu đề, liên kết phân hệ và thông tin lượt chạy/nguồn dữ liệu.
2. KPI hiện có.
3. **Cần nhập hàng**: danh sách nguyên liệu cấp bách, số lượng và CTA **Xem đề xuất nhập hàng**.
4. Diễn biến nhu cầu và dự báo, bộ lọc hiện có.
5. Sản phẩm nhu cầu cao nhất.
6. Chất lượng dữ liệu và phân bổ mô hình.
7. Lịch sử lượt chạy.

Khối cần nhập hàng đầy đủ dữ liệu được ưu tiên trước biểu đồ cả desktop và mobile. Khi lượt chạy hợp lệ không có đề xuất, thay bằng thông báo gọn; không giữ một card rỗng cao. KPI vẫn dùng dữ liệu backend, không tạo con số chứng minh hiệu quả.

### 3.3. Một lớp khung biểu đồ

`Overview` sở hữu tiêu đề, bộ lọc, nền, viền và padding của card biểu đồ. `ActualForecastChart` hỗ trợ hiển thị bên trong card mà không tạo thêm nền/viền/padding ngoài. Giữ chế độ có khung cho nơi thực sự dùng standalone nếu có caller cần nó; xác minh callers trước khi chọn API tối thiểu.

Trạng thái rỗng của biểu đồ cũng tuân theo một lớp chứa. Không thay đổi chuỗi, biên tham khảo, cutoff, tooltip hoặc xử lý giá trị null.

### 3.4. Trạng thái rỗng đúng nguyên nhân

Phân biệt các tình huống:

| Điều kiện | Thông điệp và hành động |
|---|---|
| Lỗi tải hoặc lượt thất bại | Báo lỗi và hành động thử lại phù hợp quyền; không báo đủ kho |
| Chưa có lượt hoàn thành phù hợp nguồn/kỳ | Chưa có kết quả; CTA chạy dự báo khi có quyền |
| Lượt đang chạy, chưa có kết quả khả dụng | Thông tin đang xử lý; không kết luận về tồn kho |
| Có kết quả gốc nhưng bộ lọc không khớp | Không có kết quả phù hợp; CTA Xóa bộ lọc |
| Lượt hoàn thành, dữ liệu đủ, không có đề xuất cần nhập | Không có đề xuất nhập thêm trong lượt này; kèm thời điểm lượt |
| Lượt hoàn thành nhưng thiếu dữ liệu để lập đề xuất | Chưa đủ dữ liệu để đề xuất; nêu nguyên nhân khả dụng |
| Lượt cũ còn kết quả | Giữ kết quả và cảnh báo cũ; tránh mô tả là trạng thái kho hiện tại |

Với danh sách lọc trên server, dùng metadata kết quả chưa lọc khi cần; không dùng `total === 0` của trang đã lọc làm bằng chứng không có dữ liệu gốc. Phân trang vượt phạm vi cũng không được diễn giải thành đủ kho.

Empty state căn trái, icon Lucide nhỏ, tiêu đề và mô tả rõ, tối đa một hành động chính. Không hiển thị nút người dùng không có quyền; có hướng dẫn phù hợp thay thế.

### 3.5. Thuật ngữ

- Horizon: **Kỳ dự báo**.
- ROP: **Điểm đặt hàng**; SS: **Tồn kho an toàn**.
- Reorder Gap: **Bù thiếu hụt tồn kho**.
- Tab: **Hiệu năng**, **Lịch sử**, **Phương pháp**.
- Validation: **Tập lựa chọn**; Holdout: **Tập kiểm tra cuối**.
- Giữ WAPE/MAE/RMSE/EOQ vì là tên chỉ số/phương pháp, kèm giải thích ngắn trong phần trợ giúp đọc được bằng bàn phím và cảm ứng.
- Giá trị thiếu dùng `—`; không đổi null thành 0. Biên ±20% luôn gọi **Biên tham khảo**, không gọi khoảng tin cậy thống kê.

## 4. Kiến trúc, dữ liệu và file dự kiến

Chỉnh tại các trang hiện có, không tạo layout ứng dụng thứ hai:
- `resources/js/pages/planning/Overview.tsx`
- `resources/js/pages/planning/ModelEvaluation.tsx`
- `resources/js/pages/planning/ProductForecasts.tsx`
- `resources/js/pages/planning/ProcurementRecommendations.tsx`
- `resources/js/components/planning/ActualForecastChart.tsx`
- Các component planning chứa thuật ngữ liên quan, gồm drawer và `RunStatusBanner.tsx`.
- Controller planning tương ứng chỉ khi cần metadata phân biệt trạng thái rỗng.
- `docs/PROJECT_CONTEXT_AND_ROUTING.md` cập nhật mô tả UI/hợp đồng props có thay đổi.

Luồng dữ liệu: backend cung cấp kết quả và metadata nguồn/lượt; trang xác định trạng thái hiển thị; component hiển thị không tự gọi dự báo. Nếu cần helper cho phân loại trạng thái hoặc chọn ứng viên, đặt cạnh planning và giữ hàm thuần, không thêm abstraction tổng quát.

Trước khi sửa symbol, chạy GitNexus impact upstream và báo callers/processes/risk. HIGH/CRITICAL phải được nêu trước khi sửa.

## 5. Nghiệm thu và kiểm thử

- Fixture có mô hình A được chọn nhiều hơn nhưng WAPE cao hơn B: UI không gọi A là WAPE thấp nhất.
- Không có lựa chọn, WAPE null và đồng hạng đều có diễn giải trung thực; kết quả kiểm tra tuần không bị diễn giải thành selection chính thức.
- Bao phủ trạng thái rỗng: thiếu run, pending/running, failed, filtered-empty, đủ dữ liệu không cần nhập, thiếu dữ liệu, stale.
- Đối chiếu tổng/số lượng/dữ liệu biểu đồ trước và sau: không thay đổi do chỉnh bố cục.
- Kiểm tra thứ tự DOM, một lớp card và liên kết giữ nguồn dữ liệu/kỳ theo contract hiện có.
- Chạy test frontend liên quan logic phân loại/chọn ứng viên, `npm run types:check`, `npm run build`, lint các file đổi. Nếu sửa PHP: chạy toàn bộ `php artisan test` trên sqlite `:memory:` và PHPStan theo cấu hình dự án.
- Kiểm tra trình duyệt desktop 1280×800, mobile 320/375/414/768 px; ghi kết quả thật và blocker, không tuyên bố đạt nếu chưa render.

## 6. Bàn giao

Spec hoàn thành khi các phát hiện #1/#2/#7/#8/#10 có bằng chứng nghiệm thu, kiểm tra dữ liệu đúng và không còn nội dung gây hiểu sai. Spec 2 tiếp tục trên bố cục và nhãn đã chốt ở đây.
