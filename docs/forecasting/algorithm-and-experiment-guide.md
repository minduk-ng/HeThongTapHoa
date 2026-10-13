# Hướng dẫn Thuật toán & Thực nghiệm Dự báo Nhu cầu (Demand Forecasting & Inventory Optimization)

Tài liệu hướng dẫn kỹ thuật, công thức toán học, quy trình thực nghiệm rolling-origin, tính nguồn gốc dữ liệu (provenance), cấu trúc dữ liệu xuất khẩu, và các lệnh vận hành an toàn cho đồ án và triển khai hệ thống.

---

## 1. Lệnh Thực Thi An Toàn (Safe Operational Commands)

> **CẢNH BÁO AN TOÀN**: Tuyệt đối **KHÔNG** sử dụng `php artisan migrate:fresh` hoặc `php artisan db:wipe` trong bất kỳ tài liệu hay môi trường vận hành thực nghiệm nào để tránh mất mát dữ liệu kế toán và kho hàng thực tế.

### 1.1 Khởi tạo & Kiểm thử hệ thống
```bash
# Cài đặt thư viện dependencies
composer install --no-interaction --prefer-dist --optimize-autoloader
npm ci

# Chạy migrations bổ sung an toàn (không wipe bảng)
php artisan migrate --force

# Kiểm tra cú pháp và định kiểu tĩnh (Type Checks)
composer types:check
npm run types:check

# Kiểm tra chuẩn mã nguồn (Lint Checks)
vendor/bin/pint --test
npm run lint:check

# Chạy toàn bộ bộ kiểm thử tự động (Unit & Feature Tests)
php artisan test
npm run test:report-export
```

### 1.2 Thực nghiệm qua Artisan Console & Queue Worker
```bash
# Lắng nghe hàng đợi xử lý dự báo và backtest bất đồng bộ
php artisan queue:listen --tries=3

# Xếp hàng và tính toán dự báo nhu cầu định kỳ (hoặc qua scheduler)
php artisan schedule:run
```

---

## 2. Nguồn Gốc Dữ Liệu & Cách Ly Nguồn (Dataset Provenance & Isolation)

Hệ thống hỗ trợ 2 nguồn dữ liệu hoàn toàn độc lập: **Dữ liệu Hoạt động Thực tế (Operational Real Data)** và **Dữ liệu Mô phỏng Thử nghiệm (Synthetic Datasets)**.

### 2.1 Cơ chế Cách ly Tuyệt đối (Source Isolation)
- **Hóa đơn mô phỏng**: Cột `synthetic_dataset_id` trong bảng `invoices` liên kết đến bảng `synthetic_datasets`.
- **Dữ liệu vận hành**: Mọi truy vấn doanh thu, báo cáo kế toán, thanh toán, POS và phiếu kho bắt buộc áp dụng điều kiện `whereNull('synthetic_dataset_id')` hoặc `Invoice::real()`.
- **Dữ liệu chuỗi nhu cầu**: Bảng `daily_product_demands` có composite primary key / unique index trên `(synthetic_dataset_id, menu_item_id, demand_date)`. Dữ liệu tổng hợp từ nguồn nào chỉ phục vụ cho lượt dự báo (`ForecastRun`) của nguồn đó.
- **Không trộn lẫn**: Một `ForecastRun` chỉ đọc từ một nguồn xác định. Không bao giờ tổng hợp đồng thời dữ liệu thực và mô phỏng vào cùng một lượt tính.

### 2.2 Sinh Dữ liệu Mô phỏng Xác định (Deterministic Generator)
- Sử dụng bộ sinh số giả ngẫu nhiên có hạt giống (`SeededPrng` - thuật toán LCG Lehmer/Park-Miller).
- Cùng bộ tham số cấu hình + cùng giá trị `seed` luôn tạo ra chuỗi hóa đơn và giá trị nhu cầu giống nhau 100%.
- Mỗi tập dữ liệu lưu trữ:
  - `configuration_hash`: SHA-256 của JSON cấu hình đã sắp xếp key.
  - `generator_version`: Phiên bản thuật toán sinh (e.g. `1.0.0`).
  - `dataset_hash`: Khóa băm kiểm chứng tính toàn vẹn của tập dữ liệu.

---

## 3. Giao thức Đánh giá Rolling-Origin (Rolling-Origin Evaluation Protocol)

Hệ thống áp dụng phương pháp kiểm thử chéo chuỗi thời gian (time-series cross-validation) kiểu cửa sổ mở rộng (expanding window) nhằm ngăn chặn hoàn toàn hiện tượng rò rỉ dữ liệu tương lai (look-ahead data leakage).

```
Toàn bộ chuỗi lịch sử: [------------------------------------------]
Origin 1 (Cutoff 56): [ Huấn luyện: t0..t55 ] [ Kiểm định: t56..t62 ] (H=7)
Origin 2 (Cutoff 63): [ Huấn luyện: t0..t62 ]       [ Kiểm định: t63..t69 ] (H=7)
Origin 3 (Cutoff 70): [ Huấn luyện: t0..t69 ]             [ Kiểm định: t70..t76 ] (H=7)
Origin 4 (Cutoff 77): [ Huấn luyện: t0..t76 ]                   [ Kiểm định: t77..t83 ] (H=7)
```

### 3.1 Quy chuẩn Cửa sổ
- **Cửa sổ khởi đầu (`initial_window`)**: Mặc định 56 ngày (đảm bảo đủ 8 chu kỳ tuần cho mô hình Holt-Winters).
- **Độ dài dự báo (`horizon`)**: $H = 7$ hoặc $30$ ngày, chạy và lưu độc lập theo từng horizon.
- **Bước trượt (`step`)**: 7 ngày giữa các điểm cutoff kế tiếp.
- **Số điểm đánh giá tối thiểu (`min_origins`)**: Tối thiểu 3 origins hợp lệ để đủ điều kiện tái chọn mô hình tự động (`can_reselect = true`). Nếu $< 3$ origins, hệ thống giữ fallback và không tự chọn.
- **Số điểm đánh giá tối đa (`max_origins`)**: 8 origins gần nhất (lấy hậu tố danh sách cutoffs, không phải 8 origins đầu tiên).
- **Holdout cuối**: Đoạn cuối dài đúng $H$ ngày được giữ riêng, chỉ dùng một lần sau khi đã chọn mô hình trên validation. Thay đổi holdout không làm đổi kết quả lựa chọn.
- **Chồng lấn ở $H=30$**: Các folds validation có thể chồng lấn ngày đích; kết quả là lỗi theo cặp origin/ngày đích, không phải các ngày độc lập.
- **Mục tiêu đánh giá**: `observed_sales` (lượng bán quan sát được). `latent_demand` chỉ dùng cho chẩn đoán phụ sau dự báo, không đưa vào mô hình và không dùng để chọn winner.

---

## 4. Công Thức Toán Học (Mathematical Formulations)

### 4.1 Các Mô Hình Dự Báo Chuỗi Thời Gian

Hệ thống đánh giá 7 cấu hình ứng viên thuộc 3 họ phương pháp:

#### 4.1.0 Các Mô Hình Đối Chứng Cơ Sở (Baselines)
- **Naive (Điểm cuối)**: Lặp lại quan sát thực tế cuối cùng cho toàn bộ chuỗi tương lai $h \ge 1$:
  $$\hat{y}_{t+h} = y_t$$
- **Seasonal Naive 7 (Tuần trước)**: Lặp lại giá trị của cùng ngày trong chu kỳ tuần ($m = 7$) gần nhất:
  $$\hat{y}_{t+h} = y_{t - m + ((h - 1) \bmod m) + 1}$$

#### 4.1.1 Trung Bình Động Giản Đơn (Simple Moving Average - SMA)
Với kích thước cửa sổ $k \in \{7, 14, 28\}$:
$$\hat{y}_{t+1} = \frac{1}{k} \sum_{i=0}^{k-1} y_{t-i}$$
Khi dự báo nhiều bước $h > 1$, giá trị $\hat{y}_{t+h}$ được tính đệ quy bằng cách đưa giá trị vừa dự báo vào đuôi chuỗi lịch sử.

#### 4.1.2 Holt-Winters Additive (Mô hình Xu hướng & Mùa vụ Cộng)
Với chu kỳ tuần $m = 7$ và các tham số làm trơn cố định $\alpha = 0.2, \beta = 0.1, \gamma = 0.3$:
- **Mức nền (Level)**:
  $$L_t = \alpha (y_t - S_{t-m}) + (1 - \alpha)(L_{t-1} + T_{t-1})$$
- **Xu hướng (Trend)**:
  $$T_t = \beta (L_t - L_{t-1}) + (1 - \beta) T_{t-1}$$
- **Mùa vụ (Seasonality)**:
  $$S_t = \gamma (y_t - L_t) + (1 - \gamma) S_{t-m}$$
- **Dự báo bước $h$**:
  $$\hat{y}_{t+h} = \max(0, L_t + h \cdot T_t + S_{t - m + ((h - 1) \bmod m) + 1})$$

#### 4.1.3 Holt-Winters Multiplicative (Mô hình Xu hướng & Mùa vụ Nhân)
- **Mức nền**:
  $$L_t = \alpha \left(\frac{y_t}{\max(\epsilon, S_{t-m})}\right) + (1 - \alpha)(L_{t-1} + T_{t-1})$$
- **Xu hướng**:
  $$T_t = \beta (L_t - L_{t-1}) + (1 - \beta) T_{t-1}$$
- **Mùa vụ**:
  $$S_t = \gamma \left(\frac{y_t}{\max(\epsilon, L_t)}\right) + (1 - \gamma) S_{t-m}$$
- **Dự báo bước $h$**:
  $$\hat{y}_{t+h} = \max(0, (L_t + h \cdot T_t) \cdot S_{t - m + ((h - 1) \bmod m) + 1})$$
*Trong đó $\epsilon = 10^{-9}$ được dùng để chặn chia cho 0 khi mức nền hoặc chỉ số mùa vụ tiến về 0. Mô hình bị bỏ qua (skipped) nếu chuỗi huấn luyện có giá trị không dương.*

---

### 4.2 Các Chỉ Số Đánh Giá Sai Số (Error Metrics)

Với chuỗi thực tế $y_t$ và chuỗi dự báo $\hat{y}_t$ gồm $n$ quan sát:

- **Sai số Tuyệt đối Trung bình (Mean Absolute Error - MAE)**:
  $$\text{MAE} = \frac{1}{n} \sum_{t=1}^n |y_t - \hat{y}_t|$$

- **Căn bậc hai Sai số Toàn phương Trung bình (Root Mean Squared Error - RMSE)**:
  $$\text{RMSE} = \sqrt{\frac{1}{n} \sum_{t=1}^n (y_t - \hat{y}_t)^2}$$

- **Sai số Tỷ lệ Tuyệt đối Bình quân theo Trọng số (Weighted Absolute Percentage Error - WAPE)**:
  $$\text{WAPE} = \frac{\sum_{t=1}^n |y_t - \hat{y}_t|}{\sum_{t=1}^n y_t} \times 100\%$$
  *Quy tắc biên: Nếu mẫu số $\sum_{t=1}^n y_t = 0$, hệ thống trả về `null` thay vì chia cho 0.*

- **Quy tắc Chọn Mô hình**:
  1. Chọn mô hình có WAPE nhỏ nhất trên tập validation.
  2. Hòa điểm (Tie-break): Khi sai số WAPE bằng nhau trong sai số số học $\le 10^{-9}$, chọn mô hình có MAE thấp hơn, sau đó ưu tiên theo độ phức tạp tăng dần (Naive < Seasonal Naive 7 < SMA-7 < SMA-14 < SMA-28 < HW Cộng < HW Nhân).
  3. Khi chưa đánh giá hoặc không đủ dữ liệu, các chỉ số hiển thị giá trị `null` ("Chưa đánh giá"), không hiển thị bằng 0.

- **Biên tham khảo Dự báo**:
  Khoảng dự báo hiển thị là biên tham khảo cố định $\pm 20\%$ quanh giá trị dự báo ($\hat{y} \times 0.8$ đến $\hat{y} \times 1.2$), không phải khoảng tin cậy thống kê.

---

### 4.3 Tối Ưu Hóa Tồn Kho & Đề Xuất Nhập Hàng (Inventory Optimization)

#### 4.3.1 Tồn kho An toàn (Safety Stock - SS)
$$\text{SS} = z \cdot \sigma_d \cdot \sqrt{L}$$
Trong đó:
- $z$: Hệ số mức độ phục vụ (Service Factor, mặc định $1.65$).
- $\sigma_d$: Độ lệch chuẩn nhu cầu hàng ngày của nguyên liệu (đã quy đổi qua BOM, cùng đơn vị tồn cơ sở).
- $L$: Thời gian giao hàng của nhà cung cấp (Lead time tính bằng ngày).
- Công thức trên là heuristic theo độ lệch chuẩn nhu cầu; hệ thống không bảo đảm xác suất đủ hàng 95% khi nhu cầu thực không tuân theo giả định phân phối chuẩn.

#### 4.3.2 Điểm Đặt Hàng Lại (Reorder Point - ROP)
$$\text{ROP} = d_L + \text{SS}$$
Trong đó $d_L$ là tổng nhu cầu dự kiến trong thời gian giao hàng $L$ ngày.

#### 4.3.3 Điều kiện Kích hoạt Đơn Đặt Hàng
Đơn đặt hàng chỉ được kích hoạt khi:
$$\text{Tồn kho khả dụng (Available)} \le \text{ROP}$$

#### 4.3.4 Lượng Đặt Hàng Kinh Tế (Economic Order Quantity - EOQ) & Cơ chế Dự phòng
Khi có đủ chi phí đặt hàng ($S$) và chi phí lưu kho hàng năm ($H$):
$$\text{EOQ} = \sqrt{\frac{2 \cdot D \cdot S}{H}}$$
- **Fallback (Khoảng bù ROP)**: Khi thiếu thông số $S$ hoặc $H$, áp dụng cơ chế bù tồn kho:
  $$Q_{\text{raw}} = \max(0, \text{ROP} - \text{Available})$$

#### 4.3.5 Ràng buộc Số lượng Tối thiểu & Bội số Đặt hàng (MOQ & Order Multiple)
1. **Áp dụng MOQ**:
   $$Q_{\text{MOQ}} = \max(Q_{\text{raw}}, \text{MOQ})$$
2. **Làm tròn lên theo Bội số Đặt hàng (`order_multiple`)**:
   $$Q_{\text{final}} = \left\lceil \frac{Q_{\text{MOQ}}}{M} \right\rceil \times M$$

---

## 5. Quy Chuẩn Xuất Khẩu Dữ Liệu (Export CSV Schema)

### 5.1 Báo cáo Đánh giá Mô hình (`Model Evaluation`)
| Tên cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `model_key` | string | Mã mô hình (`sma_7`, `sma_14`, `sma_28`, `holt_winters_additive`, `holt_winters_multiplicative`) |
| `name` | string | Tên hiển thị tiếng Việt của mô hình |
| `avg_mae` | float | Sai số tuyệt đối trung bình bình quân các món |
| `avg_rmse` | float | Sai số toàn phương trung bình bình quân |
| `avg_wape` | float | Tỷ lệ phần trăm sai số trọng số bình quân (%) |
| `selected_count` | integer | Số lượng món được tự động chọn mô hình này |
| `origins_count` | integer | Số origins đã đánh giá trong backtest |
| `is_selected` | boolean | Trạng thái mô hình đang được chọn áp dụng |

### 5.2 Dự báo Sản phẩm (`Product Forecasts`)
| Tên cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `menu_item_id` | integer | ID sản phẩm |
| `item_name` | string | Tên sản phẩm |
| `forecast_date` | string (YYYY-MM-DD) | Ngày dự báo |
| `forecast_quantity` | float | Số lượng dự báo |
| `lower_bound` | float | Cận dưới khoảng tin cậy (80%) |
| `upper_bound` | float | Cận trên khoảng tin cậy (120%) |
| `model_key` | string | Mô hình được sử dụng |
| `data_quality` | string | Chất lượng dữ liệu (`sufficient`, `limited`, `insufficient`) |

### 5.3 Đề xuất Nhập hàng Nguyên liệu (`Procurement Recommendations`)
| Tên cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `ingredient_id` | integer | ID nguyên liệu |
| `code` | string | Mã nguyên liệu |
| `name` | string | Tên nguyên liệu |
| `supplier_id` | integer / null | ID nhà cung cấp chính |
| `supplier_name` | string | Tên nhà cung cấp |
| `current_stock` | float | Tồn kho thực tế tại thời điểm đề xuất |
| `safety_stock` | float | Tồn kho an toàn đã tính toán |
| `reorder_point` | float | Điểm đặt hàng lại |
| `suggested_quantity` | float | Số lượng hệ thống đề xuất |
| `final_quantity` | float | Số lượng sau điều chỉnh / làm tròn |
| `unit` | string | Đơn vị mua hàng |
| `estimated_cost` | float | Tổng giá trị dự kiến (VND) |
| `status` | string | Trạng thái (`pending`, `approved`, `stale`) |

---

## 6. Giới Hạn Thuật Toán & Tuyên Bố Phạm Vi (Limitations Statement)

1. **Yêu cầu độ dài chuỗi lịch sử**:
   - SMA-7 yêu cầu tối thiểu 7 ngày quan sát; các món mới bán dưới 7 ngày được tự động gán dự báo $0.0$ và đánh dấu `insufficient` data quality.
   - Holt-Winters yêu cầu tối thiểu 14 ngày để ước lượng xu hướng và 56 ngày để đạt độ chính xác mùa vụ tối ưu.
2. **Biến động ngoại sinh**:
   - Thuật toán chuỗi thời gian đơn biến (univariate) không tự động dự đoán được các sự kiện ngoại sinh đột ngột chưa có trong lịch sử (e.g. bão lũ, mất điện, sự kiện tiếp thị bất thường).
3. **Chuyển đổi Định lượng (BOM Conversion)**:
   - Các nguyên liệu có sai lệch đơn vị không tương thích giữa định lượng và tồn kho (không có bảng quy đổi hợp lệ) sẽ bị từ chối tạo đề xuất nhập hàng để bảo toàn an toàn dữ liệu.
4. **Cập nhật Tồn kho Thực tế**:
   - Hành động phê duyệt Kế hoạch Nhập hàng (`ProcurementPlan`) **hoàn toàn KHÔNG làm thay đổi số dư tồn kho**.
   - Tồn kho chỉ được cập nhật khi Quản lý lập và xác nhận Phiếu Nhập Kho (`StockVoucher` loại `import`) tại đường dẫn `/manager/inventory/vouchers`.
