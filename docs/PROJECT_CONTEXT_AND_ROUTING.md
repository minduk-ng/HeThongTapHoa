# PROJECT CONTEXT & ROUTING DOCUMENTATION

> **Dự án**: Hệ Thống Quản Lý Tạp Hóa & Cà Phê (POS, Kitchen & System Management)
> **Phiên bản kiến trúc**: Laravel 11 + Inertia.js (React 19, TypeScript) + Laravel Reverb (WebSockets)

---

## 1. 📌 Tổng Quan Hệ Thống (System Overview)

Ứng dụng quản lý bán hàng (POS), hiển thị màn hình Bếp (Kitchen Display System), quản lý thực đơn, nguyên liệu, định lượng món, sơ đồ bàn, phân quyền tài khoản đa vai trò, xác thực OTP qua Email & Google OAuth, và hệ thống tự động dọn dẹp dữ liệu/cache.

### Công Nghệ Sử Dụng (Tech Stack)
- **Backend**: Laravel 11.x (PHP 8.2+), MySQL/MariaDB.
- **Frontend**: React 19, Inertia.js 2.x, TypeScript, Tailwind CSS.
- **Realtime / WebSockets**: Laravel Reverb, Laravel Echo, Pusher JS connector.
- **Icons & Styling**: Lucide React icons, Google Fonts (`Plus Jakarta Sans` & `Inter`).
- **Sơ đồ Luồng Hoạt Động Hệ Thống**: Xem chi tiết tại [system_flowcharts.md](file:///d:/Projects/TapHoa/docs/flowcharts/system_flowcharts.md).
- **Sơ đồ Luồng Chi Tiết POS & Kitchen**: Xem chi tiết tại [pos_kitchen_flowcharts.md](file:///d:/Projects/TapHoa/docs/flowcharts/pos_kitchen_flowcharts.md).

---

## 2. 🗺️ Sơ Đồ Routing & Cấu Trúc File (Routing & Component Mapping)

### 2.1 Màn Hình Xác Thực & Tài Khoản (Auth & Profile Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/login` | `Auth\AuthController` | `resources/js/pages/auth/login.tsx` | Đăng nhập tài khoản & kiểm tra số lần thử |
| `/signup` | `Auth\SignupController` | `resources/js/pages/auth/signup.tsx` | Đăng ký tài khoản mới & gửi OTP xác thực |
| `/verify-otp` | `Auth\OtpController` | `resources/js/pages/auth/verify-otp.tsx` | Xác thực mã OTP 6 số gửi qua Email |
| `/forgot-password` | `Auth\ForgotPasswordController` | `resources/js/pages/auth/forgot-password.tsx` | Quên mật khẩu & gửi mã OTP khôi phục |
| `/reset-password` | `Auth\ForgotPasswordController` | `resources/js/pages/auth/reset-password.tsx` | Đặt lại mật khẩu mới |
| `/auth/google` | `Auth\GoogleAuthController` | — | Chuyển hướng đăng nhập qua Google OAuth |
| `/settings` | `Auth\ProfileController` | `resources/js/pages/settings.tsx` | Cập nhật hồ sơ, đổi Email/Mật khẩu xác thực OTP |

### 2.2 Màn Hình Nhân Viên (Staff Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/staff/pos` | `Staff\POSController` | `resources/js/pages/staff/pos/POSManager.tsx` | Bán hàng POS. Có các API phụ trợ: `GET /staff/pos/serving-queue` (lấy hàng chờ phục vụ), `POST /staff/pos/mark-served` (đánh dấu đã phục vụ). Gồm 4 tab: Chọn bàn, Chọn món, Phục vụ, Nhật ký Event. |
| `/staff/kitchen` | `Staff\KitchenController` | `resources/js/pages/staff/kitchen/KitchenDisplay.tsx` | Màn hình Bếp (chế độ tràn màn hình, thanh công cụ compact 1 dòng trên cùng với filter khu vực + thống kê + actions, grid cards full-width, đã loại bỏ nút hủy món/đơn và KitchenLogPanel) |

### 2.3 Màn Hình Quản Lý (Manager Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/manager/categories` | `Manager\CategoryController` | `resources/js/pages/manager/CategoryManager.tsx` | Quản lý danh mục món ăn / thức uống |
| `/manager/products` | `Manager\ProductController` | `resources/js/pages/manager/ProductManager.tsx` | Quản lý danh sách sản phẩm, giá bán, thuế VAT, Import/Export Excel |
| `/manager/tables` | `Manager\TableController` | `resources/js/pages/manager/TableManager.tsx` | Quản lý khu vực & sơ đồ bàn, tạo hàng loạt bàn (batch) |
| `/manager/inventory/ingredients` | `Manager\IngredientController` | `resources/js/pages/manager/inventory/IngredientManager.tsx` | Quản lý kho nguyên liệu, tồn kho, đơn vị tính, nhập kho Excel |
| `/manager/inventory/recipes` | `Manager\RecipeController` | `resources/js/pages/manager/inventory/RecipeManager.tsx` | Quản lý định lượng công thức món (chế biến) |

### 2.4 Màn Hình Quản Trị Hệ Thống (Admin Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/admin/pages` | `Admin\PageController` | `resources/js/pages/admin/PagesManager.tsx` | Quản lý cấu hình trang hệ thống & gom nhóm navigation |
| `/admin/roles` | `Admin\RoleController` | `resources/js/pages/admin/RolesManager.tsx` | Quản lý nhóm quyền (Role) & phân quyền chi tiết cho trang/chức năng |
| `/admin/permissions` | `Admin\UserPermissionController` | `resources/js/pages/admin/UserPermissionsManager.tsx` | Gán nhóm quyền (Role) cho tài khoản người dùng |

---

## 3. ⏱️ Tiến Trình Tự Động & Lịch Trình (Scheduled Tasks & Console Commands)

Tất cả các tác vụ tự động ngầm được khai báo tại `routes/console.php` và chạy tự động qua `php artisan schedule:work` (đã tích hợp màu `green` vào lệnh `npm run dev:all` / `start-dev.bat`):

1. **`cleanup-expired-otps` (Hàng phút)**:
   - Tự động xóa các bản ghi mã OTP đã quá hạn (`expires_at < now()`) trong bảng `otp_codes` để giữ CSDL luôn gọn nhẹ và bảo mật.
2. **`cache:prune-expired` (Hàng ngày)**:
   - Tự động dọn dẹp bộ nhớ đệm (cache key) đã hết hạn khỏi hệ thống Storage / Database Cache.

---

## 4. ⚡ Cơ Chế Realtime & WebSockets (Laravel Reverb)

Hệ thống sử dụng **Laravel Reverb** kết hợp **Laravel Echo** để truyền nhận sự kiện tức thời:

### 4.1 Các Kênh Truyền Thông (Broadcast Channels - `routes/channels.php`)
- **`private-pos-channel`**:
  - Tín hiệu: `OrderCompleted`, `ItemsReadyToServe`, `TableStatusUpdated`, `OrderSentToKitchen`, `TableTransferred`.
  - Nhiệm vụ: Làm mới danh sách bàn, trạng thái đơn hàng, đồng bộ sơ đồ bàn, và thêm món mới hoàn thành vào hàng chờ Phục vụ trên POS.
- **`private-kitchen-channel`**:
  - Tín hiệu: `OrderSentToKitchen`, `OrderCompleted`, `TableTransferred`.
  - Nhiệm vụ: Tự động tải vé đơn mới, ẩn vé đơn hoàn thành, và cập nhật tên bàn thực tế trên thẻ vé đơn Bếp khi có chuyển/gộp bàn.
- **`private-inventory-channel`**:
  - Tín hiệu: `IngredientStockUpdated`.
  - Nhiệm vụ: Tự động nạp lại danh sách sản phẩm và tính toán số phần tối đa realtime trên POS khi định lượng kho thay đổi.
- **`presence-pos-room`**:
  - Tín hiệu Whisper (Client-to-Client): `table-draft-cart-updated`, `table-checkout-started`, `table-checkout-ended`.
  - Nhiệm vụ: Đồng bộ nhãn **"Chuẩn bị (X món)"** khi nhân viên đang chọn món, và **Khóa nút Thanh toán đồng thời cho tất cả các bàn trong nhóm gộp** khi có nhân viên mở drawer thanh toán cho bàn đó.

### 4.2 Cơ Chế Chống Trùng Lặp Request (3-Layer Idempotency Key)
- **Layer 1 (Client Lock)**: Khóa nút `submitting = true` ngay khi click "Gửi bếp chế biến" hoặc "Thanh toán", kèm Safety Timeout 8 giây.
- **Layer 2 (Client Optimistic WebSocket Sync)**: Khi nhận `.OrderSentToKitchen` qua Reverb, POS tự động xóa nháp local (`clearUnconfirmedDraft`) ngay lập tức mà không chờ HTTP response.
- **Layer 3 (Backend Cache Lock)**: Backend kiểm tra `Cache::add("idempotency:action:key", true, 30s)`. Nếu request bị gửi trùng do mạng chập chờn, Backend lập tức bỏ qua ghi CSDL trùng lặp và trả kết quả thành công mà không gây sinh đơn lặp.

---

## 5. 🛡️ Chuỗi Middleware Bảo Vệ (Middleware Pipeline)

- **`auth`**: Bắt buộc tài khoản đã đăng nhập mới được truy cập các đường dẫn nội bộ.
- **`guest`**: Giới hạn chỉ dành cho người dùng chưa đăng nhập (Trang Đăng nhập, Đăng ký, Quên mật khẩu).
- **`CheckPageAccess`**: Middleware kiểm tra xem nhóm quyền (Role) của người dùng hiện tại có được phép truy cập vào trang này hay không dựa trên bảng `pages`.
- **`permission:{name}`**: Kiểm tra phân quyền chi tiết cho từng hành động cụ thể (ví dụ `permission:pos.bypass_kitchen_lock`, `permission:products.export`).

---

## 6. 🔒 Hệ Thống Phân Quyền & Đăng Ký Quyền (Permissions Architecture)

### 6.1 Quy Tắc Đặt Tên (Naming Convention)
- Quyền có cấu trúc: `{page_prefix}.{action_name}`.
- Ví dụ: `pos.view`, `pos.create`, `pos.bypass_kitchen_lock`, `pos.cancel_item`, `kitchen.cancel_item`, `products.export`, `users.edit`.
- `page_prefix` trùng khớp với segment đường dẫn trang để `RolesManager.tsx` tự động gom nhóm hiển thị.

### 6.2 Cơ Chế Tự Động Đăng Ký (Auto-Registration)
- Danh sách quyền được khai báo đồng thời tại:
  1. `database/seeders/AuthorizationSeeder.php` (`$permissions`)
  2. `app/Http/Controllers/Admin/RoleController.php` (`$systemPermissions`)
- Khi Admin mở trang `/admin/roles`, `RoleController@index` tự động kiểm tra `Permission::firstOrCreate(['name' => $perm])` để chèn quyền mới vào DB mà không cần chạy lại Command thủ công.

### 6.3 Dịch Nhãn Thân Thiện & Fallback Title Case (`RolesManager.tsx`)
- Từ khóa chuẩn (`view`, `create`, `edit`, `update`, `delete`, `import`, `export`, `cancel`, `approve`) được tự động chuyển Tiếng Việt.
- Tính năng riêng khai báo trong `PERMISSION_LABEL_DICTIONARY` (ví dụ `bypass_kitchen_lock` $\rightarrow$ **"Duyệt khẩn cấp thanh toán"**, `cancel_item` $\rightarrow$ **"Hủy món đã gửi bếp kèm lý do"**).
- Tên mới dạng `snake_case` chưa khai báo từ điển sẽ tự động chuyển sang **Title Case** (ví dụ `force_unlock` $\rightarrow$ **"Force Unlock"**).

---

## 7. 🎨 Quy Tắc Lập Trình & Giao Diện Bắt Buộc (Code Standards)

1. **Icon System**: Tuyệt đối không dùng Emoji thô trong JSX/TSX. Chỉ dùng SVG Icon từ `lucide-react`.
2. **Typography**: Headings dùng font `Plus Jakarta Sans` (`.font-display`), nội dung dùng font `Inter` (`.font-sans`).
3. **Copywriting**: Trích dẫn dùng Smart Quotes (`“...”`, `‘...’`), giá trị mặc định dùng em-dash (`—`), không dùng All-Caps Eyebrows.
4. **Color Tokens**:
   - `sky`: Accent / Hành động chính.
   - `emerald`: Thành công / Hoàn thành / Bàn trống.
   - `amber`: Đang xử lý / Bàn đang dùng / Món chuẩn bị.
   - `rose`: Nguy hiểm / Cảnh báo / Hết hàng / Đang thanh toán.
   - `purple`: Đặt trước.
5. **Async Resiliency**: Kiểm tra `if (submitting) return` chống click đúp, safety timeout 8 giây, reload nền luôn có `onError: () => {}`.

---

## 8. 🛒 Luồng Giỏ Hàng POS & Giảm Số Lượng Món Chờ Gửi Bếp (POS Cart & Staged Reduction Flow)

### 8.1 Chọn món & Tăng số lượng (`POSMenuTab.tsx` & `usePOSCart.ts`)
- Khi nhấp món ở Tab **Chọn món (Menu)**:
  - Nếu món chưa có trong giỏ hàng ➔ Thêm món vào nháp với `quantity = 1`.
  - Nếu món đã có trong giỏ nháp (`isConfirmed: false`) ➔ Tăng số lượng `quantity + 1`.
  - Tuyệt đối không xóa/hủy món khi bấm lại trong menu.
  - Số hiển thị tổng lượng món (`getCartItemQuantity`) tính tổng số lượng món đó trên giỏ hàng (bất kể món ở trạng thái nháp hay đã gửi Bếp).

### 8.2 Giảm số lượng món nháp (`POSCartPanel.tsx`)
- Khi nhấp nút `-` trên dòng món nháp (`isConfirmed: false`):
  - Khi số lượng giảm về 0, tự động **xóa món hoàn toàn khỏi giỏ hàng nháp** thay vì giữ dòng số `0`.

### 8.3 Nút `+` trên món đã gửi Bếp & Giảm món kèm lý do
- **Nút `+` trên dòng món đã gửi bếp (`isConfirmed: true`)**:
  - Hoạt động song song với Tab chọn món: Khi nhấp `+`, hệ thống tự động tạo hoặc tăng số lượng ở 1 dòng món nháp mới (`isConfirmed: false`) để chuẩn bị gửi lượt mới xuống Bếp.
- **Nút `-` trên dòng món đã gửi bếp (`isConfirmed: true`, `isKitchenCompleted: false`)**:
  - Mở **Modal xác nhận lý do giảm món** (`ReduceItemModal`).
  - Khi xác nhận Modal: lưu lại **trạng thái chờ giảm (Staged Reduction Draft)** trên giỏ hàng và làm sáng nút **"Gửi bếp chế biến"**.
- **Gửi bếp chế biến (`POSController.php@sendToKitchen`)**:
  - Khi nhấp "Gửi bếp chế biến", payload gồm cả `items` (món mới gọi thêm) và `reduced_items` (món giảm/hủy kèm lý do) được xử lý trong cùng 1 DB Transaction.
  - Tự động cập nhật `order_items`, tính lại tổng tiền đơn hàng, và phát event Reverb WebSocket `OrderSentToKitchen` để màn hình Bếp cập nhật tức thời.

### 8.4 Khóa nút Thanh toán (`POSCartPanel.tsx` & `usePOSCheckout.ts`)
- **Khóa khi có giỏ nháp chưa gửi Bếp**: Khi có món nháp (`hasUnconfirmedChanges`), nút Thanh toán bị khóa hoàn toàn (kể cả với Manager/Admin), bắt buộc phải bấm "Gửi bếp chế biến" để lưu đơn xuống Bếp trước.
- **Khóa khi món đang chế biến**: Khi đơn hàng có món đang chờ Bếp làm (`hasKitchenPendingOrders`), nút Thanh toán bị khóa trừ khi Quản lý/Admin bấm "Duyệt khẩn cấp".

### 8.5 Đồng bộ Realtime Bếp ↔ POS qua Reverb (`POSManager.tsx`)
- `POSManager.tsx` đăng ký đầy đủ các sự kiện `.OrderSentToKitchen`, `.OrderCompleted`, `.ItemsReadyToServe`, `.TableStatusUpdated`, `.TableTransferred` trên `pos-channel`.
- Khi Bếp hoàn thành món/đơn, POS tự động làm mới dữ liệu bàn (`router.reload({ only: ['tables'] })`) ngay lập tức mà không cần bấm F5 / tải lại trang thủ công.
- **Lưu ý**: Bếp không còn quyền hủy món hoặc hủy đơn. Việc hủy/giảm món chỉ được thực hiện từ POS qua luồng `ReduceItemModal` (xem 8.3).

### 8.6 Màn hình Nhật ký Event Realtime (`POSLogTab.tsx`)
- **Tại POS (`POSManager.tsx`)**: Bổ sung Tab thứ 3 **"Nhật ký Event"** cạnh "Chọn bàn" & "Chọn món". Hiển thị dòng log realtime các sự kiện WebSocket gửi/nhận dạng `HH:mm:ss : [Gửi/Nhận] <Nội dung>`.
- **Tại Bếp (`KitchenDisplay.tsx`)**: Giao diện thanh công cụ compact 1 dòng: bên trái ChefHat icon + "Bếp" + WS status, giữa bộ lọc khu vực (Tất cả/Pha chế/Bếp nóng), bên phải stats badges (tổng đơn + cảnh báo) + nút âm thanh + refresh + fullscreen. Order cards grid chiếm toàn bộ không gian phía dưới. Đã loại bỏ KitchenLogPanel và các nút hủy món/đơn.

### 8.7 Tối Ưu Hóa Redis Cache Tags & Bộ Lọc Chống Trùng Event
- **Cấu hình Redis**: Dự án chạy với `CACHE_STORE=redis`, `SESSION_DRIVER=redis`, `QUEUE_CONNECTION=redis` trong `.env`.
- **Hệ thống Caching 2 lớp (Redis Cache Tags)**:
  1. **User Auth & Navigation**: Cache mảng vai trò, quyền hạn, và cấu trúc menu điều hướng trong `HandleInertiaRequests.php` bằng khóa `user_inertia_data:{id}` thuộc các thẻ `user_inertia` và `user_{id}`.
  2. **Bàn & Đơn hàng POS**: Cache trong `POSController.php` bằng khóa `pos_tables_list` thuộc thẻ `pos_tables`.
  3. **Thực đơn & Danh mục**: Cache trong `POSController.php` bằng các khóa `pos_categories` và `pos_products` thuộc thẻ `pos_products_and_categories`.
- **Phòng thủ kết nối (Database Fallback)**: Mọi thao tác đọc/ghi cache được bọc trong khối `try-catch`. Nếu kết nối Redis bị đứt, hệ thống tự động fallback trực tiếp về truy vấn MySQL, tránh lỗi Single Point of Failure (SPOF) làm sập ứng dụng.

### 8.8 Trung Tâm Giải Phóng Bộ Đệm Tập Trung (Centralized Cache Invalidation)
- **Model Events (`AppServiceProvider.php`)**: Đăng ký các sự kiện Eloquent model (`saved`, `deleted`) tập trung tại `AppServiceProvider@registerCacheInvalidators` để tự động dọn dẹp các thẻ cache tương ứng:
  - `User`, `Role`, `Page` ➔ Flush thẻ `user_inertia`.
  - `Table`, `Order`, `OrderItem` ➔ Flush thẻ `pos_tables`.
  - `MenuItem`, `MenuCategory`, `Ingredient` ➔ Flush thẻ `pos_products_and_categories`.
- **Pivot Controller Syncs**:
  - `UserPermissionController` ➔ Dọn dẹp thẻ của user cụ thể `user_{userId}` ngay sau khi đồng bộ vai trò.
  - `RoleController` ➔ Dọn dẹp thẻ nhóm `user_inertia` ngay sau khi thay đổi quyền hoặc gán trang mới cho vai trò.
- **Bảo vệ Inertia SSR (`resources/js/echo.ts`)**: Bọc kiểm tra `if (typeof window !== 'undefined')` trước khi khởi tạo Echo/Pusher để đảm bảo Server-Side Rendering (SSR) không ném lỗi `ReferenceError: window is not defined`.

### 8.10 Hàng Chờ Phục Vụ (Serving Queue) — `POSServingTab.tsx`
- **Luồng**: Bếp hoàn thành món (`KitchenController`) → dispatch `ItemsReadyToServe` event → POS nhận qua Reverb → thêm vào `servingQueue` state + badge đếm trên tab "Phục vụ".
- **API endpoints**:
  - `GET /staff/pos/serving-queue` — Lấy danh sách items `status = completed` + `served_at IS NULL` (chỉ order hôm nay).
  - `POST /staff/pos/mark-served` — Nhận `item_ids: number[]`, set `served_at = now()`.
- **Tab "Phục vụ"**: Nút `ConciergeBell` trên `POSToolbar` với badge đếm số lượng card đang chờ. Log (Activity) chuyển sang bên phải toolbar.
- **Card serving**: Hiển thị tên bàn (font-display), đồng hồ đếm thời gian chờ (ElapsedTimer), danh sách món (tên + số lượng + ghi chú), nút "Đã phục vụ" (emerald).
- **DB**: `order_items.served_at` (timestamp, nullable) — `status = completed` + `served_at IS NULL` = đang chờ phục vụ.

### 8.9 Phòng Vệ Tuần Tự Hóa & Ép Kiểu Dữ Liệu Props (Array Values & Serialization Resiliency)
- **Tại Backend**: Khi lưu danh sách Bàn gộp vào Redis cache trong `POSController.php`, bắt buộc gọi `$tables->values()->toArray()` để đảm bảo mảng luôn có các chỉ số số nguyên tuần tự (`0, 1, 2...`), giúp serializer của Laravel/Inertia xuất ra JSON Array `[...]` thay vì JSON Object `{...}`.
- **Tại Frontend**: Bọc phòng vệ ở các hooks và components xử lý sơ đồ bàn (`usePOSTables`, `usePOSCart`, `POSTableTab`, `TransferMergeModal`) bằng cách chuyển hóa object/dictionary thành mảng phẳng nếu nhận được dạng object từ backend:
  ```typescript
  const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
  ```
  Cách bọc này ngăn chặn hoàn toàn lỗi runtime `TypeError: tables.reduce/forEach/filter is not a function` gây sập trắng màn hình (White Screen crash) khi cập nhật dữ liệu qua WebSocket/Inertia reload.
