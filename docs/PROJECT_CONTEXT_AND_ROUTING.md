# PROJECT CONTEXT & ROUTING DOCUMENTATION

> **Dự án**: Hệ Thống Quản Lý Tạp Hóa & Cà Phê (POS, Kitchen & System Management)
> **Phiên bản kiến trúc**: Laravel 13 (PHP 8.3+) + Inertia.js 2.x (React 19, TypeScript) + Laravel Reverb (WebSockets)

---

## 1. 📌 Tổng Quan Hệ Thống (System Overview)

Ứng dụng quản lý bán hàng (POS), đặt bàn & đặt cọc, hiển thị màn hình Bếp (Kitchen Display System), màn hình Phục vụ (Serving Display), quản lý thực đơn, nguyên liệu, định lượng món, sơ đồ bàn, danh sách đơn hàng, phân quyền tài khoản đa vai trò, xác thực OTP qua Email & Google OAuth, và hệ thống tự động dọn dẹp dữ liệu/cache.

### Công Nghệ Sử Dụng (Tech Stack)
- **Backend**: Laravel 13.x (PHP 8.3+), MySQL/MariaDB, Redis (cache/session/queue), Pest (test).
- **Frontend**: React 19, Inertia.js 2.x, TypeScript, Tailwind CSS, Vite.
- **Realtime / WebSockets**: Laravel Reverb, Laravel Echo, Pusher JS connector.
- **Icons & Styling**: Lucide React icons, Google Fonts (`Plus Jakarta Sans` & `Inter`).
- **Sơ đồ Luồng Hoạt Động Hệ Thống**: Xem chi tiết tại [system_flowcharts.md](file:///d:/Projects/TapHoa/docs/flowcharts/system_flowcharts.md).
- **Sơ đồ Luồng Chi Tiết POS & Kitchen**: Xem chi tiết tại [pos_kitchen_flowcharts.md](file:///d:/Projects/TapHoa/docs/flowcharts/pos_kitchen_flowcharts.md).

---

## 2. 🗺️ Sơ Đồ Routing & Cấu Trúc File (Routing & Component Mapping)

### 2.1 Màn Hình Xác Thực & Tài Khoản (Auth & Profile Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/login` | `Auth\AuthController` | `resources/js/pages/auth/Auth.tsx` (+ `components/LoginForm.tsx`) | Đăng nhập tài khoản & kiểm tra số lần thử |
| `/signup` | `Auth\SignupController` | `resources/js/pages/auth/Auth.tsx` (+ `components/SignupForm.tsx`) | Đăng ký tài khoản mới & gửi OTP xác thực |
| `/verify-otp` | `Auth\OtpController` | `resources/js/pages/auth/components/OtpVerify.tsx` | Xác thực mã OTP 6 số gửi qua Email |
| `/forgot-password` | `Auth\ForgotPasswordController` | `resources/js/pages/auth/components/ForgotPassword.tsx` | Quên mật khẩu & gửi mã OTP khôi phục |
| `/reset-password` | `Auth\ForgotPasswordController` | `resources/js/pages/auth/components/ResetPassword.tsx` | Đặt lại mật khẩu mới |
| `/auth/google` | `Auth\GoogleAuthController` | — | Chuyển hướng đăng nhập qua Google OAuth |
| `/settings` | `Auth\ProfileController` | `resources/js/pages/profile/Settings.tsx` | Cập nhật hồ sơ, đổi Email/Mật khẩu xác thực OTP |

### 2.2 Màn Hình Nhân Viên (Staff Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/staff/pos` | `Staff\POSController` | `resources/js/pages/staff/pos/POSManager.tsx` | Bán hàng POS. Gồm 4 tab: Chọn bàn, Chọn món, Phục vụ, Nhật ký Event. |
| `/staff/kitchen` | `Staff\KitchenController` | `resources/js/pages/staff/kitchen/KitchenDisplay.tsx` | Màn hình Bếp (chế độ tràn màn hình, thanh công cụ compact 1 dòng: filter khu vực + thống kê + actions, grid cards full-width) |
| `/staff/serving` | `Staff\ServingController` | `resources/js/pages/staff/serving/ServingDisplay.tsx` | Màn hình Phục vụ độc lập: danh sách món Bếp đã xong chờ bưng ra bàn (`POST /staff/serving/mark-served`) |

**Các API phụ trợ của POS** (prefix `/staff/pos`, khai báo tại `routes/web.php`):
| Endpoint | Method | Chức năng |
| :--- | :--- | :--- |
| `/reserve` | POST | Tạo đơn đặt bàn (status `reserved`), kèm cọc tuỳ chọn (nested `deposit: {amount, method}`) |
| `/reservation/check-in` | POST | Check-in khách đến: đơn `reserved` → `draft`, bàn → `occupied`, xóa mirror `tables.reservation_*` (422 nếu đơn không ở trạng thái `reserved`) |
| `/reservation/cancel` | POST | Hủy đặt bàn; nếu có cọc đang giữ bắt buộc chọn `deposit_resolution: refund\|forfeit` (422 nếu thiếu) |
| `/deposit` | POST | Thu cọc cho đơn đã gửi bếp (payload `method: cash\|transfer`) |
| `/send-to-kitchen` | POST | Gửi món mới + giảm món (`reduced_items`) xuống Bếp trong 1 transaction |
| `/checkout` | POST | Thanh toán 1 đơn (tự động cấn trừ cọc; trả `deposit_refund` nếu cọc > tổng hoá đơn) — hỗ trợ `selected_promotion_id` (chọn auto promotion cụ thể) |
| `/bulk-checkout` | POST | Thanh toán gộp toàn bộ đơn trên bàn/nhóm bàn gộp — hỗ trợ `selected_promotion_id` |
| `/validate-promotion` | POST | Kiểm tra/áp mã coupon/voucher (`code`/`codes`) + auto promotion (`selected_promotion_id`), trả từng `promotions: [{id, name, code, discount_amount}]` + tổng discount |
| `/available-promotions` | POST | Trả danh sách auto promotion (`type=promotion`) khớp giỏ hàng kèm `estimated_discount` (không increment used_count) |
| `/transfer-table`, `/merge-tables`, `/unmerge-table` | POST | Chuyển / gộp / tách bàn |
| `/serving-queue` | GET | Lấy hàng chờ phục vụ (`status = completed` + `served_at IS NULL`, chỉ đơn hôm nay) |
| `/mark-served` | POST | Đánh dấu đã phục vụ (`item_ids: number[]` → `served_at = now()`) |
| `/cancel-order` | POST | Hủy toàn bộ đơn kèm lý do (quyền `pos.cancel_item\|kitchen.cancel_item`) |

### 2.3 Màn Hình Quản Lý (Manager Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/` (trang chủ) | `Manager\DashboardController` | `resources/js/pages/manager/dashboard/DashboardManager.tsx` | Trang chủ hệ thống: báo cáo phân tích doanh thu & giám sát KDS/Sơ đồ bàn realtime. `/dashboard` redirect 301 về `/`. Yêu cầu quyền `dashboard.view` |
| `/manager/categories` | `Manager\CategoryController` | `resources/js/pages/manager/categories/CategoriesManager.tsx` | Quản lý danh mục món ăn / thức uống |
| `/manager/products` | `Manager\ProductController` | `resources/js/pages/manager/products/ProductsManager.tsx` | Quản lý danh sách sản phẩm, giá bán, thuế VAT, Import/Export Excel |
| `/manager/tables` | `Manager\TableController` | `resources/js/pages/manager/tables/TableManager.tsx` | Quản lý khu vực & sơ đồ bàn, tạo hàng loạt bàn (batch), đặt bàn kiểu Manager (`TableFormDrawer` — chỉ ghi `tables.reservation_*`, không tạo đơn) |
| `/manager/inventory/ingredients` | `Manager\IngredientController` | `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx` | Quản lý kho nguyên liệu, tồn kho, đơn vị tính, nhập kho Excel |
| `/manager/inventory/recipes` | `Manager\RecipeController` | `resources/js/pages/manager/inventory/recipes/RecipesManager.tsx` | Quản lý định lượng công thức món (chế biến) |
| `/manager/orders` | `Manager\OrderListController` | `resources/js/pages/manager/orders/OrderList.tsx` / `OrderDetail.tsx` | Danh sách & chi tiết đơn hàng đã phát sinh |
| `/manager/promotions` | `Manager\PromotionController` | `resources/js/pages/manager/promotions/PromotionsManager.tsx` | Quản lý chương trình khuyến mãi: chiến dịch (promotion tự động / coupon / voucher), điều kiện & giới hạn, mục tiêu (`target_usage`), analytics (KPI theo hoá đơn distinct), bảng Campaign Performance + modal danh sách hoá đơn đã dùng mã |

**API bổ trợ của Promotion** (prefix `/manager/promotions`, khai báo tại `routes/web.php`):
| Route Path | Method | Chức Năng |
| :--- | :--- | :--- |
| `/analytics` | GET | KPI doanh thu/lượt dùng theo **hoá đơn distinct** dùng KM, biểu đồ theo ngày, tỷ lệ sử dụng theo loại, danh sách campaign (revenue/discount_total/roi) |
| `/{promotion}/invoices` | GET | Danh sách hoá đơn đã dùng mã của campaign (join `invoice_promotions` + `invoices`) |

### 2.4 Màn Hình Quản Trị Hệ Thống (Admin Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/admin/pages` | `Admin\PageController` | `resources/js/pages/admin/PagesManager.tsx` | Quản lý cấu hình trang hệ thống & gom nhóm navigation |
| `/admin/roles` | `Admin\RoleController` | `resources/js/pages/admin/RolesManager.tsx` | Quản lý nhóm quyền (Role) & phân quyền chi tiết cho trang/chức năng |
| `/admin/permissions` | `Admin\UserPermissionController` | `resources/js/pages/admin/UsersPermission.tsx` | Gán nhóm quyền (Role) cho tài khoản người dùng |

### 2.5 Màn Hình Báo Cáo (Reports Routes)
| Route Path | Controller | React Page Component | Chức Năng Chính |
| :--- | :--- | :--- | :--- |
| `/reports/sales-invoices` | `Reports\SalesInvoiceReportController` | `resources/js/pages/reports/SalesInvoiceReport.tsx` | Báo cáo hoá đơn bán hàng (doanh thu, số hoá đơn, avg/HĐ, HĐ chuyển khoản, lọc theo khoảng ngày & PTTT, CSV/XLSX export, in báo cáo) |
| `/reports/invoice-items` | `Reports\InvoiceItemsReportController` | `resources/js/pages/reports/InvoiceItemsReport.tsx` | Báo cáo chi tiết hoá đơn (các dòng món bán ra trong kỳ, số lượng, đơn giá, thành tiền, PTTT) |
| `/reports/product-details` | `Reports\ProductDetailsReportController` | `resources/js/pages/reports/ProductDetailsReport.tsx` | Báo cáo chi tiết sản phẩm hàng hoá (doanh số, số lượng, giá trung bình gom theo từng món trong khoảng thời gian, lọc theo danh mục) |
| `/reports/cancelled` | `Reports\CancelledReportController` | `resources/js/pages/reports/CancelledReport.tsx` | Báo cáo hoá đơn huỷ (danh sách đơn huỷ nguyên trạng và món bị huỷ riêng lẻ kèm lý do, người huỷ và thời điểm huỷ) |
| `/reports/profit` | `Reports\ProfitReportController` | `resources/js/pages/reports/ProfitReport.tsx` | Báo cáo lợi nhuận (doanh thu, giá vốn nguyên liệu theo định lượng, lợi nhuận gộp, tỷ suất margin và biểu đồ cột doanh thu & lợi nhuận theo ngày) |
| `/reports/reservations` | `Reports\ReservationsReportController` | `resources/js/pages/reports/ReservationsReport.tsx` | Báo cáo đặt bàn (lượt khách đặt bàn trước, trạng thái kết quả đã đến/đã huỷ/chưa chốt và tổng tiền đặt cọc giữ chỗ) |
| `/reports/payments` | `Reports\PaymentsReportController` | `resources/js/pages/reports/PaymentsReport.tsx` | Báo cáo thanh toán (doanh thu và phương thức thanh toán, so sánh tăng trưởng doanh thu với kỳ trước, biểu đồ tròn tỷ trọng tiền mặt/chuyển khoản) |

**Bộ Component Báo Cáo Dùng Chung** (nằm tại `resources/js/components/reports/*`):
- `ReportPage.tsx`: Khung trang báo cáo chuẩn (chứa tiêu đề, Metric Cards, bộ lọc, menu ẩn/hiện cột, export, print, layout in độc lập).
- `ReportFilterBar.tsx`: Thanh lọc khoảng ngày (DatePicker) + tìm kiếm nhanh + extra filters slot + nút đặt lại gọn gàng 1 dòng.
- `ReportTable.tsx`: Bảng báo cáo đa năng hỗ trợ tự động sort, resize độ rộng cột bằng kéo thả chuột, ẩn/hiện cột qua Context, phân trang local + compact mode.
- `useReportFilters.ts`: React Hook quản lý trạng thái khoảng ngày, đồng bộ URL parameters và xử lý reload trang.
- `reportExport.ts`: Tiện ích xuất dữ liệu báo cáo dạng CSV (có UTF-8 BOM hiển thị tiếng Việt chính xác) và Excel XLSX (lazy import thư viện `xlsx` dung lượng ~0.9MB để tối ưu hóa hiệu năng tải trang).
- `reportFormat.ts`: Helper định dạng tiền tệ VND, thời gian và nhãn phương thức thanh toán dùng chung cho các báo cáo.
- `ReportDonut.tsx`: Biểu đồ tròn Recharts hiển thị tỷ trọng các phương thức thanh toán.
- `ReportDailyBars.tsx`: Biểu đồ cột Recharts hiển thị so sánh doanh thu & lợi nhuận theo ngày.

### 2.6 Navigation Sidebar & Nhóm Báo Cáo (Menu `__subs` + Sidebar Flyout)
- **Nguồn dữ liệu menu**: bảng `pages` (group_name, sub_group, sort_order) → `HandleInertiaRequests.php` build `navigation`. Group có `sub_group` trở thành object `{ __subs: { <sub_group>: [...] } }`; group không có là mảng phẳng. `RolesManager` / `PagesManager` chỉnh nhóm trang.
- **Nhóm Báo cáo** gồm 2 sub_group:
  - **Doanh thu**: `/reports/sales-invoices`, `/reports/invoice-items`, `/reports/product-details`, `/reports/profit`.
  - **Hoạt động**: `/reports/cancelled`, `/reports/reservations`, `/reports/payments`.
- **Sidebar (menu header)**: `resources/js/components/Sidebar.tsx` — group có `__subs` render **flyout 2 cấp kiểu file-tree** (cấp 1 danh sách sub_group dọc, cấp 2 mở sang phải ngang hàng mục cha, chỉ hiện khi hover/click mục cha — xem quy tắc mục 15 trong `AGENTS.md`). Group phẳng giữ dropdown 1 cột cũ.
- **Trang chủ** là group riêng đứng đầu sidebar (`group_name = "Trang chủ"`, `sort_order = 1`, route `/`).

### 2.7 Shared Components Dùng Chung (`resources/js/components`)
- **`resources/js/components/DatePicker.tsx`**: DatePicker dùng chung (mode `single`/`range`, controlled, wire `Y-m-d`, hiển thị `dd/mm/yyyy`, segmented input dd/mm/yyyy, nhảy nhanh tháng/năm, hỗ trợ min/max + dark mode). Helpers: `resources/js/utils/date.ts`. Spec: `docs/superpowers/specs/2026-07-31-date-picker-design.md`. Ứng dụng trong PromotionFormDrawer (mode `single`; ngày bắt đầu 00:00, ngày kết thúc 23:59:59).

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
- **`permission:{name}`**: Kiểm tra phân quyền chi tiết cho từng hành động cụ thể (ví dụ `permission:products.export`).

---

## 6. 🔒 Hệ Thống Phân Quyền & Đăng Ký Quyền (Permissions Architecture)

### 6.1 Quy Tắc Đặt Tên (Naming Convention)
- Quyền có cấu trúc: `{page_prefix}.{action_name}`.
- Ví dụ: `pos.view`, `pos.create`, `pos.cancel_item`, `kitchen.cancel_item`, `products.export`, `users.edit`.
- `page_prefix` trùng khớp với segment đường dẫn trang để `RolesManager.tsx` tự động gom nhóm hiển thị.

### 6.2 Cơ Chế Tự Động Đăng Ký (Auto-Registration)
- Danh sách quyền được khai báo đồng thời tại:
  1. `database/seeders/AuthorizationSeeder.php` (`$permissions`)
  2. `app/Http/Controllers/Admin/RoleController.php` (`$systemPermissions`)
- Khi Admin mở trang `/admin/roles`, `RoleController@index` tự động kiểm tra `Permission::firstOrCreate(['name' => $perm])` để chèn quyền mới vào DB mà không cần chạy lại Command thủ công.

### 6.3 Dịch Nhãn Thân Thiện & Fallback Title Case (`RolesManager.tsx`)
- Từ khóa chuẩn (`view`, `create`, `edit`, `update`, `delete`, `import`, `export`, `cancel`, `approve`) được tự động chuyển Tiếng Việt.
- Tính năng riêng khai báo trong `PERMISSION_LABEL_DICTIONARY` (ví dụ `cancel_item` $\rightarrow$ **"Hủy món đã gửi bếp kèm lý do"**).
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
- **Thanh toán khi món đang chế biến**: Đơn có món đang chờ Bếp làm (`hasKitchenPendingOrders`) VẪN thanh toán được. Sau khi thanh toán (`paid`), Bếp/Phục vụ tiếp tục hoàn thành món bình thường.

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

### 8.9 Hàng Chờ Phục Vụ (Serving Queue) — `POSServingTab.tsx`
- **Luồng**: Bếp hoàn thành món (`KitchenController`) → dispatch `ItemsReadyToServe` event → POS nhận qua Reverb → thêm vào `servingQueue` state + badge đếm trên tab "Phục vụ".
- **API endpoints**:
  - `GET /staff/pos/serving-queue` — Lấy danh sách items `status = completed` + `served_at IS NULL` (chỉ order hôm nay).
  - `POST /staff/pos/mark-served` — Nhận `item_ids: number[]`, set `served_at = now()`.
- **Tab "Phục vụ"**: Nút `ConciergeBell` trên `POSToolbar` với badge đếm số lượng card đang chờ. Log (Activity) chuyển sang bên phải toolbar.
- **Card serving**: Hiển thị tên bàn (font-display), đồng hồ đếm thời gian chờ (ElapsedTimer), danh sách món (tên + số lượng + ghi chú), nút "Đã phục vụ" (emerald).
- **DB**: `order_items.served_at` (timestamp, nullable) — `status = completed` + `served_at IS NULL` = đang chờ phục vụ.

### 8.10 Phòng Vệ Tuần Tự Hóa & Ép Kiểu Dữ Liệu Props (Array Values & Serialization Resiliency)
- **Tại Backend**: Khi lưu danh sách Bàn gộp vào Redis cache trong `POSController.php`, bắt buộc gọi `$tables->values()->toArray()` để đảm bảo mảng luôn có các chỉ số số nguyên tuần tự (`0, 1, 2...`), giúp serializer của Laravel/Inertia xuất ra JSON Array `[...]` thay vì JSON Object `{...}`.
- **Tại Frontend**: Bọc phòng vệ ở các hooks và components xử lý sơ đồ bàn (`usePOSTables`, `usePOSCart`, `POSTableTab`, `TransferMergeModal`) bằng cách chuyển hóa object/dictionary thành mảng phẳng nếu nhận được dạng object từ backend:
  ```typescript
  const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
  ```
  Cách bọc này ngăn chặn hoàn toàn lỗi runtime `TypeError: tables.reduce/forEach/filter is not a function` gây sập trắng màn hình (White Screen crash) khi cập nhật dữ liệu qua WebSocket/Inertia reload.

---

## 9. 📅 Đặt Bàn & Đặt Cọc (Reservation & Deposit Flow)

> Spec chi tiết: `docs/superpowers/specs/2026-07-28-pos-reservation-deposit-design.md`

### 9.1 Mô Hình Dữ Liệu (Source of Truth)
- **Đơn hàng là nguồn sự thật** cho đặt bàn: đơn có `status = 'reserved'` + các cột `orders.reservation_name/phone/time/note`.
- `tables.reservation_*` chỉ là **bản mirror** — chỉ được ghi khi bàn chuyển `available → reserved` (bàn đang `occupied` vẫn nhận đơn đặt chờ mà không đổi status bàn).
- **Đồng bộ phía Quản lý (`TableController.php`)**: Khi Manager tạo hoặc cập nhật trạng thái bàn thành `reserved` trong trang Quản lý Bàn (`TableManager`), hệ thống sẽ tự động tạo/cập nhật hoặc hủy (`status = 'cancelled'`) một đơn hàng `status = 'reserved'` tương ứng dưới Database. Việc này giúp giữ vững tính nhất quán: tất cả các lịch đặt bàn đều có Order thực sự gắn liền, đảm bảo khi có đơn hàng phục vụ khác tại bàn đó thì thông tin đặt lịch không bị mất, và POS hiển thị chính xác tab đặt lịch tương ứng.
- **Bảng `deposits`**: mỗi lần thu cọc tạo 1 record `status = 'held'`; khi thanh toán → `applied`, hủy đặt bàn → `refunded` (hoàn) hoặc `forfeited` (thu phạt).
- **Serialization** (`POSController@index`): mỗi order trong `active_orders` được append `deposit_total` (float, SUM cọc `held`). **Bảng tables KHÔNG có field cọc nào** — frontend phải đọc `order.deposit_total`, không có `deposit_amount`.
- Vòng đời đơn: `reserved` → (check-in) → `draft` → `pending/confirmed/processing/completed` → `paid`.

### 9.2 Luồng Trên POS (`POSCartPanel.tsx` + `usePOSReservation.ts`)
- **Đặt bàn**: tab nháp mới (key `draft_*`) chưa gửi bếp → nút "Đặt bàn" mở `ReservationFormDrawer` → xác nhận qua `ReservationConfirmModal` → `POST /staff/pos/reserve` (có thể kèm món chọn trước + cọc nested `deposit: {amount, method}`).
- **Nhận diện đơn đặt theo TAB** (không theo status bàn): `reservedOrder = active_orders.find(o => o.status === 'reserved' && o.order_code === activeInvoiceId)`. Banner tím + nút Check-in/Hủy chỉ hiện ở đúng tab của đơn đặt; đặt bàn kiểu Manager (không có đơn) fallback đọc `tables.reservation_*` để hiển banner nhưng ẩn 2 nút này.
- **Check-in**: gửi `reservedOrder.id` → đơn thành `draft`, bàn `occupied`, xóa mirror. **Hủy đặt bàn**: `CancelReservationModal` — nếu `deposit_total > 0` bắt buộc chọn Hoàn cọc / Thu cọc.
- **Đặt cọc sau khi gửi bếp**: chevron drop-up cạnh nút Thanh toán → mục "Đặt cọc" mở `PaymentDrawer` ở `drawerMode = 'deposit'`. Chevron chỉ khóa bởi `isCheckoutLocked` (không bị khóa khi Bếp đang chế biến) — cơ chế khóa thanh toán (`isPaymentBlocked`) chỉ áp lên mục "Thanh toán riêng đơn này" bên trong menu.

### 9.3 Cấn Trừ Cọc Khi Thanh Toán (`PaymentDrawer.tsx` + `usePOSCheckout.ts`)
- `PaymentDrawer` hiển thị dòng **"Đặt cọc: −X đ"** và preset tiền mặt tính theo số còn lại sau cấn cọc (`deposit_total` của đơn đang xem, hoặc tổng cọc của các đơn khi thanh toán gộp).
- Backend `checkout`/`bulk-checkout` tự cấn cọc; nếu cọc > tổng hóa đơn trả về `deposit_refund` → POS alert hoàn khách + bill K80 (`ReceiptPrintModal`) in dòng "Đã cọc" và "Hoàn khách".

### 9.4 Quy Ước Tab/Key Frontend (`usePOSCart.ts`)
- Key tab hóa đơn: đơn thật dùng `order_code`; nháp chưa gửi bếp dùng `draft_${id}` / `draft_default`. Đơn nháp xác định bằng `order.status === 'draft'`.
- Bàn ảo **"Mang đi"** có `id = 0`: mỗi đơn là khách độc lập, không có thanh toán gộp, không đặt bàn.
- Types tập trung tại `resources/js/pages/staff/pos/types/pos.types.ts` (`POSOrderData` mang `deposit_total` + `reservation_*`).

---

## 10. 🖼️ Quản Lý & Lưu Trữ Hình Ảnh Qua Sirv CDN (Sirv CDN Storage & Integration)

> Spec chi tiết: [2026-08-05-sirv-cdn-integration-design.md](file:///d:/Projects/TapHoa/docs/superpowers/specs/2026-08-05-sirv-cdn-integration-design.md)

### 10.1 Cấu Trúc Kỹ Thuật (Architecture & Components)
- **Công tắc môi trường (`SIRV_ENABLED=true/false` trong `.env`)**: Cho phép chuyển đổi linh hoạt giữa lưu trữ Sirv CDN (`https://ngminduk-191.sirv.com/TapHoa/...`) và asset local khi chạy offline dev.
- **Custom Flysystem Driver (`sirv`)**:
  - `App\Services\Sirv\SirvClientService`: Quản lý OAuth2 Token v2 (với cache 1000s & cơ chế fallback), upload, delete, fileExists qua Sirv REST API v2.
  - `App\Services\Sirv\SirvFlysystemAdapter`: Implement `League\Flysystem\FilesystemAdapter` bổ sung `getUrl($path)` cho chuẩn Laravel.
  - `App\Providers\SirvStorageServiceProvider`: Đăng ký `Storage::extend('sirv', ...)` trong hệ thống Laravel Storage Manager.
- **Helper URL dùng chung**:
  - Backend: `cdn_asset($path)` tự động sinh URL Sirv CDN khi `SIRV_ENABLED=true` và URL local khi `false`.
  - Frontend: `resources/js/utils/cdn.ts` (`cdnAsset(path)`).
- **Artisan Sync Command**: Lệnh `php artisan sirv:sync` tự động duyệt và tải toàn bộ ảnh tĩnh cũ (`public/logo`, `public/banner`, `public/QR_chuyen_khoan`) và ảnh sản phẩm lên Sirv CDN dưới thư mục `/TapHoa/...`.
