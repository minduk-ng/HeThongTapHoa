# 🏪 Tạp Hóa POS — Hệ Thống Quản Lý Bán Hàng & Màn Hình Bếp Realtime

> **Dự án**: Hệ Thống Bán Hàng POS, Màn Hình Chế Biến Bếp (KDS), Quản Lý Định Lượng Kho Nguyên Liệu & Phân Quyền Vai Trò Toàn Diện.  
> **Công nghệ**: Laravel 11/13 + React 19 + Inertia.js 2.x (TypeScript) + Laravel Reverb (WebSockets) + Docker Redis.

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
- **In Hóa Đơn & Đa Phương Thức Thanh Toán**: Hỗ trợ Tiền mặt, Chuyển khoản QR, Thẻ ngân hàng, tính tiền thừa tự động.

---

### 👨‍🍳 2. Màn Hình Hiển Thị Bếp Realtime — Kitchen Display (`/staff/kitchen`)
- **Vé Order Chế Biến Tức Thời**: Nhận tín hiệu Order mới từ POS qua WebSockets trong dưới **100ms** kèm **Âm thanh chuông báo**.
- **Lọc Theo Trạm Chế Biến (Station Filter)**: Lọc danh sách món theo trạm **Tất cả**, **Pha chế (Bar)** hoặc **Bếp nóng (Kitchen)**.
- **Header & Stats Tối Giản**:
  - Nút bật/tắt âm thanh chuông dạng icon **Chuông** (`Volume2`/`VolumeX`) nhỏ cạnh tiêu đề.
  - 2 thẻ thống kê chỉ số nằm gọn trong 1 hàng: **Tổng số đơn active** & **Cảnh báo (Chờ > 10 phút hoặc gọi thêm món)**.
- **Màn Hình Nhật Ký Event Bếp (Kitchen Event Log Box)**: Hiển thị dòng log realtime các sự kiện gửi/nhận dạng `HH:mm:ss : [Gửi/Nhận] <Nội dung>`.
- **Hủy Món / Hủy Đơn Hàng Từ Bếp**: Cho phép Bếp hủy từng món hoặc hủy cả đơn kèm lý do, tự động đồng bộ về POS và giải phóng bàn khi đơn trống.

---

### ⚡ 3. Đồng Bộ Realtime Bếp ↔ POS qua Laravel Reverb
- Tự động đồng bộ sơ đồ bàn, vé đơn Bếp, và giỏ hàng local giữa các thiết bị mà **không cần tải lại trang (F5)**.
- **Bộ Lọc Chống Trùng Event (`isDuplicateEvent`)**: Sử dụng cửa sổ thời gian 1.000ms triệt tiêu các sự kiện lặp lại, đảm bảo dữ liệu reload và log chỉ ghi đúng 1 lần duy nhất.

---

### 🚀 4. Tối Ưu Hiệu Năng Với Docker Redis Cache
- **Cấu hình Redis Container (`my-redis:6379`)**: Sử dụng Redis cho `CACHE_STORE`, `SESSION_DRIVER`, và `QUEUE_CONNECTION`.
- **Cache Dữ liệu Thực Đơn**: Lưu trữ danh mục (`pos_categories`) và sản phẩm (`pos_products`) dạng mảng JSON thuần trên RAM của Redis, **giảm 80-90% số lượng truy vấn Query vào MySQL DB**.
- **Tự Động Xóa Cache Khi Thay Đổi (Model Observers)**: Tự động xóa cache Redis ngay lập tức khi Admin/Quản lý thay đổi Sản phẩm (`MenuItem`), Danh mục (`MenuCategory`), hoặc Tồn kho nguyên liệu (`Ingredient`).

---

### 📦 5. Quản Lý Định Lượng Công Thức & Kho Nguyên Liệu (`/manager/inventory`)
- Quản lý chi tiết danh mục nguyên liệu, tồn kho, đơn vị tính, cảnh báo sắp hết hàng.
- Định lượng công thức chế biến cho từng món (ví dụ: 1 Cà phê sữa = 25g Cà phê + 40ml Sữa đặc).
- **Tự Động Tính Số Phần Tối Đa (`max_servings`)**: Tính toán realtime số lượng đĩa/ly tối đa có thể phục vụ dựa trên tồn kho thực tế.

---

### 🛡️ 6. Phân Quyền Vai Trò & Bảo Mật OTP (`/admin/roles`, `/admin/permissions`)
- **Phân Quyền Đa Vai Trò (RBAC)**: Tự động gom nhóm quyền theo từng trang, phân quyền chi tiết cho từng hành động (`products.export`, `users.edit`).
- **Xác Thực Bảo Mật**: Đăng nhập Email/Mật khẩu, Google OAuth, mã OTP 6 số qua Email, chống dò quét Brute-force reCAPTCHA v2.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành Phần | Công Nghệ |
| :--- | :--- |
| **Backend Framework** | Laravel 11.x / 13.x (PHP 8.2+) |
| **Database** | MySQL 8.0 / MariaDB |
| **Cache & Session** | Docker Redis Container (`redis:latest`, `predis/predis`) |
| **Realtime WebSockets** | Laravel Reverb + Laravel Echo |
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
Chạy container Redis trên cổng 6379:
```bash
docker run -d --name my-redis -p 6379:6379 redis:latest
```

### 3. Cấu Hình File `.env`
Sao chép mẫu `.env` và tạo APP_KEY:
```bash
cp .env.example .env
php artisan key:generate
```
Cập nhật các thông số kết nối Database & Redis trong `.env`:
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

REDIS_CLIENT=predis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 4. Chạy Migration & Nạp Dữ Liệu Mau
```bash
php artisan migrate:fresh --seed
```

### 5. Khởi Động Lệnh Chạy Tự Động (Dev Server All-in-One)
```bash
npm run dev:all
```
*Lệnh trên sẽ khởi động đồng thời cả Laravel Web Server (`php artisan serve`), Vite Client assets compiler (`vite`), Reverb WebSockets Server (`php artisan reverb:start`), và Queue Worker.*

---

## 🔐 Tài Khoản Đăng Nhập Mặc Định

| Vai Trò | Email | Mật Khẩu |
| :--- | :--- | :--- |
| **Super Admin / Quản Lý** | `minhducqwe0123@gmail.com` | `minhduc123` |

---

## 📖 Tài Liệu Kiến Trúc & Routing Chi Tiết
Để xem chi tiết sơ đồ Routing, danh sách Controller và các quy tắc thiết kế hệ thống, xem tại file [docs/PROJECT_CONTEXT_AND_ROUTING.md](file:///d:/Projects/TapHoa/docs/PROJECT_CONTEXT_AND_ROUTING.md).
