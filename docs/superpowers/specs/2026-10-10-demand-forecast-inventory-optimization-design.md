# Thiết kế module Dự báo nhu cầu và Tối ưu nhập kho

**Ngày:** 10/10/2026
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Phạm vi:** POS/F&B, dự báo nhu cầu sản phẩm và hỗ trợ quyết định nhập nguyên liệu

## 1. Mục tiêu

Module sử dụng lịch sử bán hàng để dự báo nhu cầu sản phẩm trong 7 và 30 ngày, chuyển nhu cầu sản phẩm thành nhu cầu nguyên liệu qua công thức món, rồi tính toán thời điểm và số lượng nhập hàng phù hợp.

Module phải đồng thời đáp ứng hai mục tiêu:

1. Hỗ trợ người quản lý ra quyết định nhập hàng trong vận hành thực tế.
2. Thể hiện rõ giá trị Khoa học máy tính thông qua thuật toán, đánh giá thực nghiệm, khả năng tái lập và so sánh định lượng.

Hệ thống chỉ đưa ra khuyến nghị. Người quản lý phải xem lại và xác nhận trước khi tạo đơn mua hàng hoặc phiếu nhập kho.

## 2. Ngoài phạm vi

Phiên bản đầu không triển khai:

- LSTM, Transformer hoặc deep learning.
- Prophet, ARIMA, SARIMA, XGBoost, LightGBM hoặc ensemble.
- Dự báo theo thời tiết nếu chưa có nguồn dữ liệu thời tiết đáng tin cậy.
- Tự động đặt hàng không cần người xác nhận.
- Tự động tăng tồn kho khi mới phê duyệt đề xuất mua hàng.
- Tối ưu tuyến giao hàng hoặc chi phí vận chuyển.
- Khẳng định quan hệ nhân quả giữa khuyến mãi và nhu cầu.

## 3. Thuật ngữ

- **Nhu cầu sản phẩm:** số lượng sản phẩm dự kiến bán trong một khoảng thời gian.
- **Nhu cầu nguyên liệu:** lượng nguyên liệu cần dùng để đáp ứng nhu cầu sản phẩm theo công thức món.
- **Forecast horizon:** số ngày tương lai cần dự báo, mặc định 7 hoặc 30 ngày.
- **Data cutoff:** thời điểm cuối cùng của dữ liệu được dùng để dự báo.
- **Rolling origin:** phương pháp đánh giá chuỗi thời gian bằng cách dịch dần mốc dự báo theo thời gian.
- **On-hand:** lượng tồn kho đang được ghi nhận.
- **Reserved:** lượng tồn đã được giữ cho nhu cầu chưa hoàn tất, nếu nghiệp vụ hỗ trợ.
- **Available:** lượng tồn khả dụng, bằng `on_hand - reserved`.
- **Safety Stock (SS):** tồn kho an toàn để chống sai số nhu cầu và giao hàng.
- **Reorder Point (ROP):** ngưỡng tồn kho cần bắt đầu đặt hàng.
- **Economic Order Quantity (EOQ):** lượng đặt hàng cân bằng chi phí đặt hàng và chi phí lưu kho.
- **MOQ:** số lượng đặt tối thiểu do nhà cung cấp quy định.
- **Order multiple:** bội số số lượng được phép đặt.
- **Pack size:** số đơn vị cơ sở trong một kiện hoặc thùng.

## 4. Nguồn dữ liệu

### 4.1. Dữ liệu bán hàng

Nguồn chính:

- Hóa đơn đã hoàn thành và đã thanh toán.
- Chi tiết hóa đơn theo sản phẩm.
- Thời điểm phát hành hóa đơn (`issued_at`).
- Số lượng bán.
- Trạng thái hủy để loại giao dịch không hoàn tất.
- Chương trình khuyến mãi đã áp dụng, nếu có.

Không sử dụng:

- Hóa đơn bị hủy hoàn toàn.
- Đơn nháp hoặc chưa thanh toán.
- Dữ liệu của ngày hiện tại chưa kết thúc trong job ban đêm.

### 4.2. Dữ liệu công thức và kho

- Sản phẩm và nguyên liệu.
- Công thức món/BOM (`ProductRecipe`).
- Định lượng nguyên liệu cho mỗi đơn vị sản phẩm.
- Tồn kho hiện tại.
- Nhà cung cấp ưu tiên và nhà cung cấp thay thế.
- Lead time.
- Giá nhập gần nhất và nguồn phiếu nhập.
- Pack size, MOQ và order multiple.
- Chi phí đặt hàng và chi phí lưu kho nếu cần tính EOQ.

### 4.3. Chất lượng dữ liệu

Mỗi sản phẩm/nguyên liệu phải có trạng thái chất lượng dữ liệu:

- `sufficient`: đủ dữ liệu để chạy mô hình được chọn.
- `limited`: có thể dự báo bằng fallback nhưng độ tin cậy thấp.
- `insufficient`: không đủ dữ liệu để dự báo.
- `stale`: dữ liệu hoặc kết quả đã quá cũ.
- `invalid`: dữ liệu đầu vào mâu thuẫn hoặc thiếu trường bắt buộc.

Không được thay dữ liệu thiếu bằng số 0 nếu số 0 làm thay đổi ý nghĩa nghiệp vụ.

## 5. Tiền xử lý chuỗi thời gian

1. Tổng hợp số lượng bán theo sản phẩm và ngày.
2. Tạo đủ dãy ngày trong phạm vi quan sát.
3. Phân biệt ngày không bán thật với ngày thiếu dữ liệu.
4. Định nghĩa nhu cầu phiên bản đầu là số lượng trên hóa đơn đã thanh toán và không bị hủy. Hoàn tiền sau bán không trừ khỏi nhu cầu vì sản phẩm đã được phục vụ; refund được giữ làm metadata để nghiên cứu riêng.
5. Gắn metadata khuyến mãi nhưng không mặc định coi đó là quan hệ nhân quả.
6. Ghi nhận ngày stockout nếu có, vì nhu cầu quan sát có thể thấp hơn nhu cầu thật.
7. Lưu data cutoff, timezone `Asia/Ho_Chi_Minh` và phiên bản quy tắc tiền xử lý.

## 6. Thuật toán dự báo

### 6.1. Simple Moving Average

Ba baseline:

- SMA 7.
- SMA 14.
- SMA 28.

Với cửa sổ `k`:

\[
\hat{y}_{t+1}=\frac{1}{k}\sum_{i=0}^{k-1}y_{t-i}
\]

SMA dùng làm baseline và fallback cho chuỗi ngắn hoặc tương đối ổn định.

### 6.2. Holt-Winters

Hai ứng viên:

- Holt-Winters Additive.
- Holt-Winters Multiplicative.

Chu kỳ mùa vụ mặc định là 7 ngày.

Additive phù hợp khi biên độ mùa vụ gần như cố định. Multiplicative phù hợp khi ảnh hưởng mùa vụ thay đổi theo tỷ lệ của mức nhu cầu.

Không chạy Holt-Winters mùa vụ khi chuỗi không đủ ít nhất 8 chu kỳ hoàn chỉnh, tương đương 56 ngày cho chu kỳ tuần.

### 6.3. Fallback theo độ dài lịch sử

| Dữ liệu lịch sử | Phương pháp |
|---|---|
| Dưới 7 ngày | Không dự báo; trạng thái `insufficient` |
| 7-13 ngày | Trung bình đơn giản |
| 14-27 ngày | SMA 7 |
| 28-55 ngày | So sánh SMA 7 và SMA 14 |
| Từ 56 ngày | Đánh giá đủ năm ứng viên |

## 7. Đánh giá và lựa chọn mô hình

### 7.1. Rolling-origin validation

Không chia dữ liệu ngẫu nhiên.

Cấu hình mặc định:

- Initial training window: tối thiểu 56 ngày.
- Forecast horizon: 7 ngày.
- Origin step: 7 ngày.
- Number of origins: mặc định 8, tối thiểu 3; nếu không đủ 3 origin thì không chọn lại mô hình.
- Window type: expanding window.

Tại mỗi origin:

1. Chỉ dữ liệu trước cutoff được dùng để tiền xử lý, ước lượng tham số và chọn cấu hình.
2. Mọi mô hình dùng cùng cutoff và cùng tập quan sát kiểm định.
3. Dữ liệu tương lai tuyệt đối không được tham gia huấn luyện hoặc tuning.
4. Metric được tính theo từng origin rồi tổng hợp theo quy tắc thống nhất.

### 7.2. Chỉ số

#### MAE

\[
MAE=\frac{1}{n}\sum_{t=1}^{n}|y_t-\hat{y}_t|
\]

#### RMSE

\[
RMSE=\sqrt{\frac{1}{n}\sum_{t=1}^{n}(y_t-\hat{y}_t)^2}
\]

#### WAPE

\[
WAPE=\frac{\sum_{t=1}^{n}|y_t-\hat{y}_t|}{\sum_{t=1}^{n}|y_t|}\times100\%
\]

Nếu tổng nhu cầu thực tế bằng 0, WAPE không được tính và phải hiển thị trạng thái không xác định.

### 7.3. Quy tắc lựa chọn

- WAPE là chỉ số ưu tiên mặc định.
- Nếu chênh lệch WAPE không quá 0,5 điểm phần trăm, chọn mô hình có MAE thấp hơn.
- Nếu vẫn bằng nhau, chọn mô hình đơn giản hơn theo thứ tự SMA trước Holt-Winters.
- Quy tắc và ngưỡng tie-break phải được lưu cùng mỗi lần đánh giá.
- Không hardcode mô hình thắng trong giao diện.

## 8. Dự báo và khoảng dự báo

Mỗi kết quả dự báo phải lưu:

- Sản phẩm.
- Ngày dự báo.
- Giá trị dự báo.
- Cận dưới và cận trên nếu phương pháp hỗ trợ và đã được kiểm chuẩn.
- Mô hình được chọn.
- Tham số mô hình.
- Data cutoff.
- Forecast run ID.
- Chỉ số đánh giá gần nhất.
- Trạng thái chất lượng dữ liệu.

Nếu khoảng dự báo chưa được triển khai hoặc kiểm chuẩn, giao diện không được tự tạo “độ tin cậy 95%”.

## 9. Quy đổi sang nhu cầu nguyên liệu

Với dự báo sản phẩm `p` và định lượng nguyên liệu `i`:

\[
IngredientDemand_i=\sum_p Forecast_p\times RecipeQuantity_{p,i}
\]

Quy đổi phải:

- Dùng đúng đơn vị cơ sở.
- Ghi nhận phiên bản công thức/BOM.
- Báo lỗi nếu sản phẩm thiếu công thức.
- Không âm thầm bỏ qua nguyên liệu thiếu mapping.
- Có thể áp dụng tỷ lệ hao hụt nếu tỷ lệ này được cấu hình và có nguồn.

## 10. Tối ưu nhập kho

### 10.1. Tồn khả dụng

\[
Available=OnHand-Reserved
\]

Nếu hệ thống chưa hỗ trợ reserved stock, phải ghi rõ available được xem bằng on-hand.

### 10.2. Safety Stock

Phương pháp mặc định:

\[
SS=z\times\sigma_d\times\sqrt{L}
\]

Trong đó:

- `z`: hệ số mức phục vụ.
- `σd`: độ lệch chuẩn nhu cầu mỗi ngày.
- `L`: lead time theo ngày.

Nếu thiếu dữ liệu để tính SS, kết quả phải là `Không đủ dữ liệu`, không được phát minh giá trị.

### 10.3. Reorder Point

\[
ROP=DemandDuringLeadTime+SafetyStock
\]

Hệ thống chỉ kích hoạt đề xuất khi:

\[
Available\leq ROP
\]

### 10.4. EOQ

\[
EOQ=\sqrt{\frac{2DS}{H}}
\]

Trong đó:

- `D`: nhu cầu dự kiến trong năm.
- `S`: chi phí mỗi lần đặt hàng.
- `H`: chi phí lưu kho một đơn vị trong năm.

Nếu thiếu `D`, `S` hoặc `H`, EOQ phải hiển thị `Không đủ dữ liệu`. Hệ thống có thể dùng chính sách order-up-to được cấu hình thay thế, nhưng phải ghi rõ phương pháp.

### 10.5. Số lượng đề xuất

Quy tắc mặc định:

1. Nếu `Available > ROP`, số lượng đề xuất bằng 0.
2. Nếu `Available <= ROP` và EOQ hợp lệ, lượng cơ sở bằng EOQ.
3. Nếu EOQ không hợp lệ, lượng cơ sở bằng `max(ROP - Available, 0)` và kết quả phải ghi phương pháp fallback `reorder_gap`.
4. Áp dụng MOQ.
5. Làm tròn lên theo order multiple.
6. Quy đổi giữa đơn vị cơ sở và đơn vị mua theo pack size.

Mỗi kết quả phải lưu cả:

- Lượng trước làm tròn.
- Lượng sau MOQ.
- Lượng sau order multiple.
- Đơn vị cơ sở.
- Đơn vị mua.
- Lý do và công thức đã dùng.

## 11. Ranh giới kế hoạch mua hàng và Stock Voucher

- **Procurement Plan:** kế hoạch mua hàng được người quản lý duyệt, không làm tăng tồn kho.
- **Stock Voucher:** xác nhận hàng thực nhận, làm tăng tồn kho.

Phiên bản đầu không thêm Purchase Order domain đầy đủ. Module tạo `ProcurementPlan` và các dòng `ProcurementPlanItem`, nhóm theo nhà cung cấp sau khi người quản lý duyệt. Kế hoạch đã duyệt vẫn không thay đổi tồn kho. Khi hàng đến, người dùng mở flow Stock Voucher hiện có với dữ liệu kế hoạch được điền sẵn rồi xác nhận số lượng thực nhận, đơn giá và hạn dùng.

Không được gọi endpoint tạo Stock Voucher khi mới duyệt kế hoạch hoặc khi hàng chưa thực nhận.

## 12. Dữ liệu thử nghiệm

### 12.1. Mục tiêu

Bộ sinh dữ liệu dùng để:

- Kiểm tra thuật toán trên quy luật biết trước.
- So sánh mô hình.
- Kiểm tra tính ổn định trước nhiễu và cú sốc.
- Demo khi chưa có dữ liệu production.

### 12.2. Quy luật hỗ trợ

- Nhu cầu cơ bản.
- Xu hướng tăng hoặc giảm.
- Mùa vụ theo tuần.
- Ảnh hưởng khuyến mãi mô phỏng.
- Nhiễu ngẫu nhiên.
- Zero-demand days.
- Intermittent demand.
- Outlier spike/drop.
- Missing observations.
- Stockout-censored demand.

### 12.3. Khả năng tái lập

Mỗi scenario phải lưu:

- Scenario ID.
- Random seed.
- Configuration JSON chuẩn hóa.
- Configuration hash.
- Dataset hash.
- Generator version.
- Generated timestamp.

Cùng generator version, cấu hình và seed phải tạo cùng dataset hash.

### 12.4. Lưu trữ và nhận diện dữ liệu mô phỏng

Dự án chưa vận hành production nên dữ liệu mô phỏng được phép lưu trong cùng database và cùng các bảng nghiệp vụ hiện tại để kiểm thử end-to-end. Không cần database hoặc schema riêng.

Mỗi hóa đơn và dữ liệu dẫn xuất do generator tạo phải có khả năng truy vết về một synthetic dataset thông qua `synthetic_dataset_id` nullable. Bản ghi thật có giá trị `null`; bản ghi mô phỏng mang ID dataset tương ứng.

Quy tắc:

- Mỗi dataset có tên, seed, configuration hash, generator version và thời gian tạo.
- Giao diện và export phải hiển thị nguồn `synthetic` khi kết quả dùng dữ liệu mô phỏng.
- Forecast run phải chọn rõ một nguồn: dữ liệu thật (`synthetic_dataset_id = null`) hoặc đúng một synthetic dataset; không trộn hai nguồn trong cùng run.
- Báo cáo vận hành mặc định chỉ đọc dữ liệu thật; chế độ demo phải chọn dataset rõ ràng.
- Xóa dataset chỉ xóa các bản ghi được gắn với dataset đó và phải yêu cầu xác nhận; không dùng `migrate:fresh`, `db:wipe`, `TRUNCATE` hoặc xóa bản ghi không có dataset ID.
- Nếu dự án được triển khai production sau này, permission tạo/xóa dataset mặc định bị tắt và command generator yêu cầu cấu hình `FORECAST_SYNTHETIC_ENABLED=true`.

## 13. Lịch chạy

### Hàng ngày

- 00:10: tổng hợp dữ liệu bán đến hết ngày hôm trước.
- 00:15: chạy dự báo 7/30 ngày và tính đề xuất nhập hàng.

### Hàng tuần

- 01:00 Chủ nhật: chạy rolling-origin validation và chọn lại mô hình.

### Chạy thủ công

Người có quyền được phép chạy lại sau khi:

- Import dữ liệu lịch sử.
- Sửa công thức món.
- Cập nhật lead time.
- Thay đổi chính sách tồn kho.
- Chuẩn bị demo.

Job phải dùng queue và `withoutOverlapping`; HTTP request không được chạy thuật toán đồng bộ.

## 14. Vòng đời forecast run

Trạng thái:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

Quy tắc:

1. Kết quả cũ vẫn hoạt động trong khi run mới đang chạy.
2. Run mới chỉ trở thành active khi toàn bộ kết quả hợp lệ và commit thành công.
3. Run thất bại không xóa hoặc thay thế kết quả active.
4. Mọi kết quả liên kết với forecast run, dataset snapshot và config version.
5. Job trùng cùng phạm vi phải bị chặn hoặc deduplicate.

## 15. Kiểm tra stale recommendation

Mỗi đề xuất nhập hàng lưu:

- Forecast run ID.
- Stock snapshot timestamp/version.
- BOM version.
- Supplier policy version.
- Calculation timestamp.

Trước khi xác nhận:

1. Đọc lại tồn kho hiện tại.
2. So sánh với snapshot đã dùng.
3. Kiểm tra forecast run còn active.
4. Kiểm tra BOM, lead time, giá và ràng buộc mua có thay đổi không.
5. Nếu stale, chặn xác nhận và yêu cầu tính lại.

## 16. Điều chỉnh thủ công và audit

Khi người dùng thay đổi lượng đặt:

- Lưu lượng đề xuất ban đầu.
- Lưu lượng cuối cùng.
- Bắt buộc nhập lý do nếu khác đề xuất.
- Kiểm tra MOQ và order multiple.
- Lưu người sửa và thời điểm sửa.
- Lưu dữ liệu trước/sau trong audit log.

## 17. Phân quyền

Các permission dự kiến:

- `planning.view`
- `planning.run`
- `planning.configure`
- `planning.apply_model`
- `planning.procurement_review`
- `planning.experiments`

Permission phải được đăng ký theo quy ước hiện có và gắn vào page route tương ứng.

## 18. Kiến trúc giao diện

Nhóm navigation:

```text
Dự báo & Kế hoạch
├── Tổng quan
├── Dự báo sản phẩm
├── Đề xuất nhập hàng
└── Đánh giá mô hình
```

Trang Dữ liệu thử nghiệm nằm trong khu vực quản trị/công cụ và chỉ hiện trong môi trường cho phép.

### 18.1. Tổng quan

Nhiệm vụ: hiển thị sức khỏe toàn module và hành động quan trọng.

Vùng chính:

1. Header và trạng thái run.
2. KPI tổng quan.
3. Biểu đồ actual/forecast.
4. Chất lượng dữ liệu và phân bổ mô hình.
5. Top sản phẩm và cảnh báo nhập hàng.

### 18.2. Dự báo sản phẩm

Nhiệm vụ: tìm sản phẩm và giải thích dự báo của sản phẩm đó.

Vùng chính:

1. Header.
2. Filter.
3. Bảng hoặc card list sản phẩm.
4. Pagination/status.
5. Drawer chi tiết mở theo yêu cầu.

Drawer gồm:

- Lịch sử actual.
- Dự báo từng ngày và tổng kỳ.
- Cận thấp/cận cao nếu hợp lệ.
- Mô hình được chọn.
- MAE, RMSE, WAPE.
- Rolling-origin summary.
- Data cutoff và chất lượng dữ liệu.
- Lý do chọn mô hình.

### 18.3. Đề xuất nhập hàng

Nhiệm vụ: quyết định nguyên liệu nào cần đặt, số lượng bao nhiêu và thời điểm nào.

Vùng chính:

1. Header và freshness metadata.
2. Filter.
3. Bảng/card quyết định.
4. Drawer giải thích công thức.
5. Thanh review và xác nhận.

Modal review nhóm các dòng theo nhà cung cấp và thực hiện stale check trước xác nhận.

### 18.4. Đánh giá mô hình

Nhiệm vụ: so sánh năm ứng viên trên cùng rolling-origin protocol và chọn mô hình.

Vùng chính:

1. Header và phạm vi đánh giá.
2. MAE/RMSE/WAPE summary.
3. Biểu đồ metric theo origin.
4. Bảng so sánh.
5. Methodology disclosure.

Tabs:

- Hiệu quả.
- Lịch sử chạy.
- Cấu hình.

Chỉ panel active được render.

### 18.5. Dữ liệu thử nghiệm

Nhiệm vụ: cấu hình scenario, sinh dữ liệu và quan sát kết quả thí nghiệm.

Vùng chính:

1. Header và cảnh báo sandbox.
2. Scenario setup.
3. Quy luật/cú sốc.
4. Preview.
5. Run result.

## 19. Visual DNA

- Render bên trong `DashboardLayout`; không dựng lại global shell.
- Plus Jakarta Sans cho heading.
- Inter cho body, form và bảng.
- `sky` cho primary action và actual series.
- `purple` chỉ cho forecast series/trạng thái dự báo.
- `emerald` cho thành công.
- `amber` cho cảnh báo.
- `rose` cho nguy hiểm.
- `zinc/slate` cho surface.
- Lucide icons.
- Recharts cho biểu đồ phân tích.
- `tabular-nums` cho số liệu, tiền, thời gian và ID.
- Border mỏng, `shadow-xs`, `rounded-xl/2xl`.
- Không animation lặp liên tục.
- Full light/dark mode.
- Responsive tại 320, 375, 414 và 768px.
- Mobile dùng card list thay bảng rộng.
- Drawer mobile dùng full-screen dialog hoặc bottom sheet.
- Số liệu mockup phải có nhãn `Dữ liệu minh họa`.

Các file HTML Stitch chỉ là visual reference:

- `D:\Downloads\giao_dien\dubao&kehoach.html`
- `D:\Downloads\giao_dien\dubaosanpham.html`
- `D:\Downloads\giao_dien\dexuatnhaphang.html`
- `D:\Downloads\giao_dien\danhgiamohinh.html`
- `D:\Downloads\giao_dien\dulieuthunghiem.html`

Spec này là nguồn sự thật cho hành vi, công thức và trạng thái. Nếu HTML mâu thuẫn spec, spec được ưu tiên.

## 20. Trạng thái giao diện bắt buộc

Mọi trang dữ liệu phải có:

- Empty.
- Loading/queued.
- Running.
- Completed.
- Failed với retry.
- Insufficient data.
- Stale data.

Tương tác phải có:

- Disabled state khi chưa đủ điều kiện.
- Loading state chống submit lại.
- Timeout an toàn theo quy tắc dự án.
- Toast hoặc banner, không dùng browser `alert()`.
- Focus management cho drawer/modal.
- Escape để đóng.
- Trả focus về trigger.

## 21. Xử lý lỗi

- Thiếu dữ liệu: không chạy mô hình không hợp lệ; trả lý do cụ thể.
- Job lỗi: giữ kết quả active trước đó.
- Công thức thiếu: đánh dấu sản phẩm/nguyên liệu và không tạo đề xuất im lặng.
- Đơn vị không quy đổi được: chặn đề xuất và yêu cầu sửa master data.
- Thiếu lead time/MOQ/EOQ inputs: hiển thị trạng thái thiếu dữ liệu.
- Đề xuất stale: chặn xác nhận.
- Queue unavailable: job ở trạng thái failed với retry có kiểm soát.

## 22. Kiểm thử và thực nghiệm

### 22.1. Unit tests

- SMA 7/14/28.
- Holt-Winters additive/multiplicative trên chuỗi chuẩn biết trước.
- MAE/RMSE/WAPE và WAPE denominator bằng 0.
- Rolling-origin không leakage.
- BOM conversion và unit conversion.
- SS, ROP, EOQ.
- MOQ/order multiple rounding.
- Seeded generator reproducibility.

### 22.2. Feature tests

- Scheduler và manual run tạo job đúng quyền.
- Job lifecycle và active-result swap.
- Run thất bại giữ kết quả cũ.
- Filter/pagination.
- Stale recommendation bị chặn.
- Manual adjustment yêu cầu lý do.
- Review nhóm theo nhà cung cấp.
- Không tăng tồn kho khi chỉ phê duyệt kế hoạch đặt hàng.
- Synthetic generator mặc định bị tắt trong production; chỉ hoạt động khi `FORECAST_SYNTHETIC_ENABLED=true` và người dùng có `planning.experiments`.

### 22.3. Frontend tests

- Empty/loading/running/completed/failed/stale states.
- Tab chỉ render panel active.
- Metric selector cập nhật chart.
- Drawer/modal accessibility.
- Mobile card list.
- Không double-submit.
- Dark mode.

### 22.4. Thực nghiệm luận văn

Các dataset mô phỏng:

1. Nhu cầu ổn định.
2. Xu hướng tăng.
3. Mùa vụ tuần.
4. Mùa vụ nhân theo mức nhu cầu.
5. Khuyến mãi/cú sốc.
6. Nhiễu cao.
7. Intermittent demand.
8. Zero-demand/outlier/missing data.

Báo cáo:

- MAE, RMSE, WAPE theo dataset và mô hình.
- Mô hình được chọn.
- Mức cải thiện so baseline.
- Thời gian chạy nếu được đo thật.
- Giới hạn của dữ liệu mô phỏng.

Không dùng số liệu hardcode làm kết quả luận văn.

## 23. Tiêu chí hoàn thành

Module được coi là hoàn thành khi:

1. Có dữ liệu lịch sử hoặc synthetic dataset có provenance.
2. Chạy đủ năm ứng viên theo rolling-origin không leakage.
3. Tính đúng MAE, RMSE và WAPE.
4. Chọn mô hình theo quy tắc đã lưu.
5. Sinh dự báo 7/30 ngày có data cutoff và run ID.
6. Quy đổi dự báo qua BOM thành nhu cầu nguyên liệu.
7. Tính SS, ROP và EOQ hoặc trả trạng thái thiếu dữ liệu.
8. Áp dụng đúng pack size, MOQ và order multiple.
9. Có stale check và audit khi chỉnh tay.
10. Không tăng tồn kho khi mới duyệt đề xuất mua hàng.
11. Năm trang giao diện đạt visual DNA và đủ state bắt buộc.
12. Full PHP, PHPStan, Pint, ESLint, TypeScript và build gates đều xanh.

## 24. Rủi ro và giới hạn

- Dữ liệu mô phỏng chỉ kiểm chứng thuật toán, không chứng minh hiệu quả production.
- Dữ liệu ngắn làm mùa vụ không ổn định.
- Stockout có thể làm nhu cầu quan sát thấp hơn nhu cầu thật.
- Khuyến mãi có thể gây distribution shift.
- Công thức/BOM sai sẽ làm đề xuất nguyên liệu sai dù dự báo sản phẩm đúng.
- Lead time và giá nhập cũ làm quyết định mua hàng sai.
- EOQ dựa trên giả định nhu cầu và chi phí tương đối ổn định.
- Mọi đề xuất cần người quản lý xem lại.
