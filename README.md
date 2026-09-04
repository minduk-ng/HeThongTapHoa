# 🏪 Tạp Hóa POS — Hệ Thống Quản Lý Bán Hàng & Màn Hình Bếp Realtime

> **Dự án**: Hệ Thống Bán Hàng POS, Màn Hình Chế Biến Bếp (KDS), Quản Lý Định Lượng Kho Nguyên Liệu, Khách Hàng & Nhà Cung Cấp, Khuyến Mãi & Phân Quyền Vai Trò Toàn Diện.  
> **Công nghệ**: Laravel 13 + React 19 + Inertia.js 2.x (TypeScript) + Laravel Reverb (WebSockets) + Docker Redis.

---

## 🚀 Tính Năng Nổi Bật

### 🛒 1. Màn Hình Bán Hàng POS Thông Minh (`/staff/pos`)
- **Sơ đồ Khu vực & Bàn**: Quản lý nhiều khu vực bàn (Tầng 1, Tầng 2, Sân vườn, Mang đi). Hỗ trợ **gộp bàn**, **chuyển bàn**, **tách bàn** linh hoạt.
- **Giỏ hàng & Nháp món**:
  - Chọn món tự động tăng số lượng nháp.
  - Tự động xóa dòng món nháp khi giảm số lượng về `0`.
  - Giảm món đã gửi Bếp: Mở **Modal chọn lý do giảm món** (`Khách đổi ý`, `Món bị hỏng`, `Hết nguyên liệu`,...) và lưu trạng thái **chờ giảm (Staged Reduction)**.
- **Khóa Nút Thanh Toán Bảo Vệ**:
  - Tự động khóa nút Thanh toán khi có giỏ hàng nháp chưa gửi Bếp (bắt buộc phải gửi Bếp trước).
  - Thanh toán được ngay cả khi đơn còn món đang chế biến tại Bếp; Bếp/Phục vụ vẫn hoàn thành món sau khi thanh toán.
- **Khách hàng tại POS**: Tìm/tạo khách hàng theo số điện thoại ngay khi thanh toán, gắn khách vào đơn & hóa đơn.
- **In Hóa Đơn & Đa Phương Thức Thanh Toán**: Tiền mặt, Chuyển khoản kèm **mã QR VietQR tĩnh** (theo số tiền cần thanh toán, cấu hình qua `.env`), Thẻ ngân hàng; tính tiền thừa tự động.

---

### 👨‍🍳 2. Màn Hình Hiển Thị Bếp Realtime — Kitchen Display (`/staff/kitchen`)
- **Vé Order Chế Biến Tức Thời**: Nhận tín hiệu Order mới từ POS qua WebSockets trong dưới **100ms** kèm **Âm thanh chuông báo**.
- **Lọc Theo Trạm Chế Biến (Station Filter)**: Lọc danh sách món theo trạm **Tất cả**, **Pha chế (Bar)** hoặc **Bếp nóng (Kitchen)**.
- **In Ticket Bếp**: Nút **In** trên từng card order — in ticket chế biến (58mm) bằng CSS `@media print`, không cần driver máy in.
- **Header & Stats Tối Giản**: Nút bật/tắt âm thanh (icon Chuông), 2 thẻ thống kê (Tổng đơn active & Cảnh báo).
- **Màn Hình Nhật Ký Event Bếp**: Log realtime sự kiện gửi/nhận dạng `HH:mm:ss : [Gửi/Nhận] <Nội dung>`.
- **Hủy Món / Hủy Đơn Hàng Từ Bếp**: Kèm lý do, đồng bộ về POS và giải phóng bàn khi đơn trống.

---

### ⚡ 3. Đồng Bộ Realtime Bếp ↔ POS qua Laravel Reverb
- Tự động đồng bộ sơ đồ bàn, vé đơn Bếp, và giỏ hàng local giữa các thiết bị mà **không cần tải lại trang (F5)**.
- **Bộ Lọc Chống Trùng Event (`isDuplicateEvent`)**: Cửa sổ 1.000ms triệt tiêu sự kiện lặp.
- **Kênh riêng tư (private channels)**: Mọi kênh POS/Bếp/Phục vụ yêu cầu xác thực — không ai lạ nghe được dữ liệu.

---

### 🚀 4. Tối Ưu Hiệu Năng Với Docker Redis Cache
- **Cấu hình Redis Container (`my-redis:6379`)**: `CACHE_STORE`, `SESSION_DRIVER`, `QUEUE_CONNECTION` dùng Redis.
- **Cache Dữ liệu Thực Đơn**: Danh mục (`pos_categories`) và sản phẩm (`pos_products`) trên RAM Redis, **giảm 80-90% truy vấn MySQL**.
- **Tự Động Xóa Cache Khi Thay Đổi**: Model Observers xóa cache khi Sản phẩm, Danh mục, Tồn kho nguyên liệu thay đổi.

---

### 📦 5. Kho Nguyên Liệu & Công Thức (`/manager/inventory`)
- Quản lý danh mục nguyên liệu, tồn kho theo **lô (FIFO) + hạn sử dụng (HSD)**, cảnh báo sắp hết hàng.
- **Nhập kho theo đơn vị nhập**: Chọn đơn vị nhập `thùng/kg` kèm hệ số quy đổi (`unit_conversion`) — tự quy về đơn vị gốc (`chai/g`).
- **Phiếu nhập / xuất / điều chỉnh**: Nhập kho gắn **Nhà cung cấp** + checkbox **Đã trả tiền**; kiểm kê kho tự hàn drift; backfill `stock:init-lots`.
- **Định lượng công thức** cho từng món (vd: 1 Cà phê sữa = 25g Cà phê + 40ml Sữa đặc), **tự động tính số phần tối đa (`max_servings`)**.
- **Chặn bán âm kho**: Thanh toán kiểm tra tồn theo lô trước khi xuất, thiếu hàng rollback toàn bộ.

---

### 👥 6. Khách Hàng & Nhà Cung Cấp
- **Khách hàng (`/manager/customers`)**: CRUD + tìm theo SĐT, gắn `customer_id` vào đơn/hóa đơn; hiển thị tên khách trong Order, OrderDetail, SalesInvoiceReport. Không tích điểm (chỉ thông tin).
- **Nhà cung cấp (`/manager/suppliers`)**: CRUD + theo dõi **tổng nhập / đã trả / công nợ**; phiếu nhập lưu NCC, thanh toán công nợ qua modal (chọn phiếu chưa trả).

---

### 💸 7. Hoàn Trả Hàng & Quản Lý Ca Làm Việc
- **Hoàn trả một phần dòng món**: Từ hoá đơn đã thanh toán — chọn dòng + số lượng hoàn + lý do → tạo **payment âm** + **trả nguyên liệu về kho** (theo lô FIFO), có audit log.
- **Chi tiêu / thu ngoài trong ca**: Ghi chi (mua nguyên liệu, điện nước...) & thu ngoài ngay trên `ShiftsPage`; `expectedCash` phản ánh đúng.
- **Đối soát ca chính xác**: Hoàn trả cross-shift được trừ trong ca tiền ra khỏi máy.

---

### 🛡️ 8. Phân Quyền Vai Trò & Bảo Mật OTP (`/admin/roles`, `/admin/permissions`)
- **RBAC đa vai trò**: Gom nhóm quyền theo trang, phân quyền chi tiết (`customers.edit`, `suppliers.view`, `orders.refund`...).
- **Xác thực**: Email/Mật khẩu, Google OAuth, OTP 6 số qua Email, reCAPTCHA v2, idempotency chống double-submit.
- **Admin seed bắt buộc env**: `ADMIN_EMAIL`/`ADMIN_DEFAULT_PASSWORD` — không còn mật khẩu mặc định hardcode.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành Phần | Công Nghệ |
| :--- | :--- |
| **Backend Framework** | Laravel 13.x (PHP 8.3+) |
| **Database** | MySQL 8.0 / MariaDB |
| **Cache & Session** | Docker Redis Container (`redis:latest`) |
| **Realtime WebSockets** | Laravel Reverb + Laravel Echo (kênh private) |
| **Frontend Framework** | React 19 + Inertia.js 2.x (TypeScript) |
| **Styling & UI** | Tailwind CSS v4 + Lucide React Icons |
| **Fonts** | Google Fonts (`Plus Jakarta Sans` & `Inter`) |

---

## 💻 Hướng Dẫn Cài Đặt & Khởi Động

### 1. Clone Repository & Cài Đặt Dependencies
```bash
git clone <repository_url>
cd TapHoa
composer install
npm install
```

### 2. Khởi Động Container Redis (Docker)
```bash
docker run -d --name my-redis -p 6379:6379 redis:latest
```

### 3. Cấu Hình File `.env`
```bash
cp .env.example .env
php artisan key:generate
```
Cập nhật các thông số kết nối Database & Redis + **các biến bắt buộc**:
```ini
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=HeThongTapHoa
DB_USERNAME=root
DB_PASSWORD=your_mysql_password

CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Bắt buộc — không có giá trị mặc định
ADMIN_EMAIL=admin@example.com
ADMIN_DEFAULT_PASSWORD=password_that_you_set
```

**Tùy chọn — QR thanh toán VietQR** (điền tài khoản nhận tiền thật khi deploy, sau đó `php artisan config:cache`):
```ini
PAYMENT_QR_ENABLED=true
PAYMENT_QR_BANK_CODE=970422    # Mã BIN ngân hàng (970422 = VCB, 970405 = TPBank...)
PAYMENT_QR_ACCOUNT_NO=0368192905
PAYMENT_QR_ACCOUNT_NAME=NGUYEN MINH DUC
```

**Tùy chọn — CORS WebSocket nếu deploy nhiều domain**:
```ini
REVERB_ALLOWED_ORIGINS=http://localhost
```

### 4. Chạy Migration & Nạp Dữ Liệu Mau
```bash
php artisan migrate:fresh --seed
```
> Lưu ý: `--seed` cần `ADMIN_EMAIL` + `ADMIN_DEFAULT_PASSWORD` trong `.env` (seeder dừng kèm lỗi nếu thiếu).

> Nếu là nâng cấp từ bản cũ (có dữ liệu tồn kho trước đây), chạy một lần:
> ```bash
> php artisan stock:init-lots   # tạo lô "Tồn đầu kỳ" cho nguyên liệu cũ chưa có lô
> ```

### 5. Khởi Động Lệnh Chạy Tự Động (Dev Server All-in-One)
```bash
npm run dev:all
```
*Khởi động đồng thời: Laravel Web Server (`php artisan serve`), Vite (`vite`), Reverb (`php artisan reverb:start`), Queue Worker.*

---

## 🔐 Tài Khoản Đăng Nhập Mặc Định

Tài khoản Admin được tạo từ **biến môi trường** khi seed — không còn mật khẩu mặc định hardcode:

| Biến | Mô tả |
| :--- | :--- |
| `ADMIN_EMAIL` | Email tài khoản Super Admin (tạo tự động khi seed nếu chưa tồn tại) |
| `ADMIN_DEFAULT_PASSWORD` | Mật khẩu tài khoản Admin |

Ví dụ: `ADMIN_EMAIL=admin@example.com` + `ADMIN_DEFAULT_PASSWORD=MySecurePass123` → đăng nhập bằng cặp này tại `/login`.

---

## 🧪 Kiểm Thử & Chất Lượng

```bash
php artisan test              # 426+ test (Pest, RefreshDatabase)
composer types:check          # PHPStan (0 errors)
npm run lint:check            # ESLint (0 errors)
npm run types:check           # tsc --noEmit (tsc --noEmit)
npm run build                 # Vite build
```

CI (GitHub Actions `.github/workflows/tests.yml` + `lint.yml`) chạy PHP 8.3/8.4/8.5 + Node 22: install deps → build assets → PHPStan → Pest suite → ESLint.

---

## 📖 Tài Liệu Kiến Trúc & Routing Chi Tiết
Để xem chi tiết sơ đồ Routing, danh sách Controller và các quy tắc thiết kế hệ thống, xem tại file [docs/PROJECT_CONTEXT_AND_ROUTING.md](docs/PROJECT_CONTEXT_AND_ROUTING.md).
