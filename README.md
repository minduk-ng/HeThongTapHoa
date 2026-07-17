# Laravel 13 + React + Inertia: Modern Authentication & Role Authorization System

Dự án mẫu xây dựng hệ thống đăng nhập, đăng ký và phân quyền toàn diện, sử dụng các công nghệ tiên tiến nhất bao gồm: **Laravel 13**, **React 19**, **Inertia.js v3** và **TailwindCSS v4**.

---

## 🚀 Các Tính Năng Nổi Bật

### 🔐 1. Hệ Thống Authentication & Bảo Mật OTP
- **Đăng ký & Đăng nhập**: Tích hợp xác thực email/mật khẩu tiêu chuẩn.
- **Xác thực qua Google OAuth**: Đăng nhập nhanh bằng tài khoản Google sử dụng Laravel Socialite.
- **Quên mật khẩu & Kích hoạt tài khoản bằng mã OTP**: Mã OTP gửi qua email, tự động hết hạn sau 10 phút.
- **Trải nghiệm OTP kiểu Telegram**:
  - Tự động kiểm tra và gửi yêu cầu xác thực ngay khi người dùng điền đủ 6 số.
  - Tự động focus vào ô nhập số đầu tiên khi tải trang.
  - Hiệu ứng **rung lắc và đổi màu đỏ** kèm xóa sạch số khi nhập sai OTP.
  - Hiệu ứng **phóng to nhẹ và đổi màu xanh lá cây** hiển thị trong 800ms trước khi chuyển hướng khi nhập đúng OTP.
  - **Bộ đếm ngược thời gian hiệu lực OTP**: Hiển thị bộ đếm giây trực quan từ 10:00 về 00:00 để cảnh báo người dùng thời gian hết hiệu lực của mã.
  - **Chặn gửi lại mã (Resend Cooldown)**: Ép buộc chờ 60 giây ở lần gửi đầu tiên và tự động nhân đôi thời gian chờ ở các lần tiếp theo nhằm chống spam.
- **Bảo vệ chống Brute-force & Dò quét thông tin**:
  - **Google reCAPTCHA v2**: Tự động theo dõi số lần đăng nhập sai theo IP + Email. Trên 5 lần đăng nhập sai, hệ thống bắt buộc giải reCAPTCHA v2 trước khi ấn nút gửi.
  - **Rate Limiting mạnh mẽ (Throttling)**: Áp dụng giới hạn tần suất gửi yêu cầu trên hệ thống cho các hành động nhạy cảm: Đăng nhập (10 lần/phút), Đăng ký (5 lần/phút), Quên/Đặt lại mật khẩu (5 lần/phút), Xác thực OTP (10 lần/phút).
  - **Bảo mật phản hồi Quên mật khẩu**: Trả về thông báo thành công chung cho tất cả địa chỉ email mà không tiết lộ email đó đã đăng ký trong hệ thống hay chưa, ngăn chặn việc dò quét dữ liệu tài khoản.
  - **Chặn truy cập tài khoản chưa kích hoạt**: Chặn và đăng xuất ngay lập tức các tài khoản đăng nhập thành công nhưng chưa xác minh OTP, chuyển hướng về trang xác thực kèm thông báo lỗi chi tiết.

### 🛡️ 2. Hệ Thống Phân Quyền Vai Trò (Roles & Permissions)
- **Middleware CheckPageAccess nghiêm ngặt**: Quản lý truy cập tất cả các route của admin động theo database. Nếu route không được đăng ký trong bảng `pages`, hệ thống mặc định từ chối truy cập và trả về lỗi `403`.
- **Làm sạch Cache quyền tự động 3 tầng**:
  - Giảm thời gian sống của cache quyền hạn User xuống còn **15 phút** thay vì 24 giờ.
  - Sử dụng các custom Pivot Models (`UserRole` và `RolePermission`) kết hợp Eloquent model events để tự động xóa sạch cache quyền liên quan ngay lập tức khi: Vai trò của User thay đổi, quyền hạn liên kết với Vai trò được cập nhật/xóa, hoặc cập nhật/xóa bản ghi Vai trò/Quyền hạn gốc.
- **Quản lý Nhóm Quyền (RolesManager)**:
  - Cho phép tạo mới, sửa, hoặc xóa vai trò tùy chỉnh.
  - Phân quyền động: Lựa chọn vai trò nào được phép xem nhóm chức năng hoặc trang cụ thể.
  - Xác thực bảo mật: Bắt buộc xác nhận mật khẩu admin và hiển thị cảnh báo đỏ về ảnh hưởng quyền lợi người dùng trước khi xóa bất kỳ nhóm quyền nào.

### 📁 3. Quản Lý Trang & Sắp Xếp Trực Quan (PagesManager)
- **Giao diện phân tầng**: Menu con được thụt lề (`pl-10`) và hiển thị phân cấp trực quan bằng đường kẻ biên.
- **Kéo thả sắp xếp (Drag & Drop UI)**:
  - Chuyển đổi linh hoạt sang chế độ sắp xếp kéo thả sử dụng HTML5 Drag and Drop API.
  - Cho phép kéo thả các trang con đổi vị trí hoặc kéo đè sang nhóm chức năng khác (nhận nhóm mới tức thì).
  - Cho phép kéo thả cả ô Nhóm chức năng để thay đổi thứ tự nhóm.
  - **Nhấp đúp chuột để thu gọn**: Nhấp đúp chuột vào bất kỳ ô card nhóm chức năng nào để thu gọn/mở rộng nhóm nhanh chóng.
  - Giao diện kéo thả dọc toàn màn hình dễ thao tác.
  - Tự động cập nhật giao diện ngay lập tức khi lưu thay đổi thành công.
- **Đếm số lượng người truy cập**: Cột hiển thị số lượng người dùng thực tế có quyền truy cập vào chức năng (được đếm động theo vai trò được cấp).

### 👥 4. Quản Lý Người Dùng & Thao Tác Hàng Loạt (UsersPermission)
- **Bộ lọc thông minh**: Tìm kiếm nhanh theo tên/email, lọc theo vai trò, và tùy chọn ẩn/hiện cột trực tiếp.
- **Phân trang cục bộ**: Chia trang hiển thị tối đa 20 người dùng trên trang.
- **Chế độ Chỉnh sửa Nhóm (Bulk Edit Mode)**:
  - Tích chọn nhiều user cùng lúc bằng cách **nhấp chuột vào bất kỳ vị trí nào trên dòng (row)**.
  - Checkbox chọn tất cả nằm ở tiêu đề được thiết kế lớn và chỉ áp dụng chọn các user trên trang hiện tại.
  - Thanh công cụ thao tác nhanh: **Gán nhanh quyền** (hiển thị popup checklist vai trò), **Xóa sạch quyền** (khôi phục về Guest), và **Xóa tài khoản khỏi hệ thống**.
  - Tính năng "Xóa" trên từng dòng user đơn lẻ hiển thị menu đa lựa chọn tương tự.
  - Bảo vệ: Tự động khóa và loại trừ tài khoản Super Admin khỏi các hành động xóa/chỉnh sửa nhóm.

### 👤 5. Hồ Sơ & Cài Đặt Tài Khoản (Profile Settings)
- **Quản lý thông tin cá nhân**:
  - Giao diện bố cục chia cột tỉ lệ 1:2 (`md:grid-cols-3`): cột bên trái (1/3 chiều rộng) hiển thị Avatar, tên người dùng và email với đường kẻ chia dọc tinh tế; cột bên phải (2/3 chiều rộng) hiển thị các biểu mẫu chỉnh sửa thông tin. Điều này tối ưu hóa khoảng trống trên các thiết bị màn hình lớn.
  - Cho phép người dùng chỉnh sửa trực tiếp tên hiển thị trên giao diện, đổi địa chỉ email cá nhân hoặc thay đổi/thiết lập mật khẩu.
- **Bảo mật OTP & Chống Spam/DOS Email**:
  - Khi thay đổi email hoặc mật khẩu, hệ thống yêu cầu xác thực qua mã OTP được gửi về địa chỉ email tương ứng.
  - **Chống Spam/DOS**: Backend tự động kiểm tra sự tồn tại của mã OTP chưa hết hạn. Nếu đã có OTP hiệu lực, hệ thống tái sử dụng mã đó thay vì tạo mới và gửi email tiếp theo, hạn chế việc lạm dụng gửi spam mail.
  - **Bộ đếm thời gian gửi lại OTP bền bỉ (Persistent Cooldown)**: Thời gian chờ 60 giây gửi lại mã được quản lý tập trung ở component cha giúp tiếp tục đếm ngược chính xác ngay cả khi người dùng tắt và mở lại overlay nhập mã OTP.

### 🔔 6. Phản Hồi Trải Nghiệm Giao Diện (UX Polish)
- **Double-submit Prevention**: Toàn bộ nút gửi tại màn hình Đăng nhập, Đăng ký, OTP, Quên/Đặt lại mật khẩu sẽ tự động bị vô hiệu hóa khi đang xử lý và hiển thị vòng xoay spinner tải hiệu ứng premium.
- **Floating Toast Notification**: Tích hợp thanh thông báo nổi ở phía trên bên phải tại Dashboard của admin để hiển thị kết quả thành công/thất bại tức thì khi admin phân vai trò, gán trang, hoặc cập nhật thông tin hệ thống.

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend**: Laravel 13, PHP 8.2+, SQLite.
- **Frontend**: React 19, Inertia.js v3, TypeScript.
- **Styling**: TailwindCSS v4, Vanilla CSS (hỗ trợ Dark & Light Mode đồng bộ).

---

## 💻 Cài Đặt Hệ Thống

### 1. Clone repository và cài đặt Dependencies
```bash
git clone <repository_url>
cd <project_dir>
composer install
npm install
```

### 2. Cấu hình biến môi trường
```bash
cp .env.example .env
php artisan key:generate
```
*Mở file `.env` và cập nhật thông tin SMTP để gửi mail OTP (nên cấu hình Queue driver để tăng hiệu năng gửi mail bất đồng bộ), Google Client ID/Secret, và các thông tin thiết lập tài khoản admin ban đầu:*
```env
ADMIN_EMAIL=admin@admin.com
ADMIN_DEFAULT_PASSWORD=244466666
```

### 3. Thiết lập Database & Seed dữ liệu
```bash
# Tạo file SQLite trống
touch database/database.sqlite

# Chạy Migrations và nạp Seed mẫu
php artisan migrate:fresh --seed
```

### 4. Khởi động Development Servers & Queue Worker
Chạy server Laravel:
```bash
php artisan serve
```
Chạy server biên dịch Assets (Vite) trong tab Terminal thứ hai:
```bash
npm run dev
```
Chạy hàng đợi gửi thư điện tử (Queue Worker) trong tab Terminal thứ ba:
```bash
php artisan queue:work
```

### 5. Thiết lập Scheduler để tự động dọn dẹp OTP hết hạn
Cài đặt cronjob trên server chạy mỗi phút:
```bash
* * * * * cd /path-to-your-project && php artisan schedule:run >> /dev/null 2>&1
```
*(Trong môi trường local, bạn có thể chạy thử nghiệm qua câu lệnh: `php artisan schedule:work`)*

---

## 🧪 Chạy Kiểm Thử Tự Động (Testing)
Dự án được tích hợp sẵn bộ kiểm thử sử dụng **Pest**. Bạn có thể chạy các bài test về luồng đăng nhập, xác thực OTP, bảo mật middleware phân quyền bằng lệnh:
```bash
php artisan test
```
