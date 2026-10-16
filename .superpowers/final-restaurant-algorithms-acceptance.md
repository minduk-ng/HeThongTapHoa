# Nghiệm thu cuối restaurant algorithms — chưa đạt

## Mốc kiểm tra

- Root: `D:\Projects\TapHoa`; feature HEAD trước kiểm tra: `c0051786a2504bef45559c7d0a83166546bcd27e`.
- `main`: `5a77d03`; một worktree tại root; trạng thái ban đầu sạch.
- Đã đọc bốn đặc tả `docs/superpowers/specs/2026-10-16-*-design.md` tương ứng menu, Undo, kitchen và Top-K; đọc kế hoạch tương ứng (menu đến dòng 250, kitchen đến dòng 250, Undo/Top-K toàn bộ). Không coi checkbox hay review trước là bằng chứng đạt.
- Chưa sửa mã ứng dụng; chưa merge, chưa push. Tài liệu này ghi bằng chứng và công việc chưa xong, không xác nhận hoàn tất.

## Kiểm thử thực chạy trên cây mã c005178

| Gate | Kết quả |
| --- | --- |
| Full `php artisan test` | 915/915 tests, 7.265 assertions, 683.092 giây ở lần chạy hợp lệ cuối |
| SimulationAcceptanceTest | 120 cells, 365 ngày, 3 items; 516,65 giây; artifact `storage/app/forecasting-acceptance/1` |
| Node toàn bộ 11 file test trong `resources/js` | 109 tests, 32 suites, 109 pass, 0 fail/skip, khoảng 7,55 giây |
| `npm run types:check` | Đạt |
| ESLint mã TS/TSX thay đổi so main, trừ `.test.ts`/`.bench.ts` | Đạt, không output lỗi |
| PHPStan `PaidProductRankingService.php`, `DashboardService.php`, `KitchenDispatchService.php` | Đạt, 0 lỗi |
| `npm run build` | Đạt; cảnh báo chunk lớn hơn 500 kB và thời gian plugin; không phải lỗi build |

Lệnh Node:

```powershell
node --test "resources/js/components/navigation/*.test.ts" "resources/js/components/planning/*.test.ts" "resources/js/components/planning/*.test.mjs" "resources/js/components/reports/*.test.ts" "resources/js/pages/staff/kitchen/utils/*.test.ts" "resources/js/pages/staff/pos/utils/*.test.ts"
```

Môi trường PHP đặt trong process: `APP_ENV=testing`, `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`, `DB_URL` rỗng; `APP_CONFIG_CACHE` trỏ tên UUID không tồn tại trong thư mục temp được cho phép. `APP_KEY` tạo 32 byte ngẫu nhiên qua `RandomNumberGenerator.Create().GetBytes(byte[])`, admin email `acceptance@example.test`, mật khẩu UUID dùng một lần. Không lấy secret repo. `phpunit.xml` cũng quy định SQLite bộ nhớ, cache array, broadcast null, queue sync.

Lần PHP đầu dùng overload RNG không hỗ trợ trên PowerShell 5.1, báo lỗi tạo APP_KEY dù suite vẫn đạt 915 tests/7.265 assertions trong 623,379 giây. Không dùng lần đó để xác nhận điều kiện key dùng một lần; đã chạy lại toàn bộ bằng API tương thích, kết quả bảng trên.

Không chạy migrate/backfill trên DB vận hành. Suite tự tạo schema trong SQLite bộ nhớ. Chưa chạy benchmark lớn trong phiên này. Edge tồn tại tại `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`; chưa chạy fixture UI hay phiên đăng nhập thật. Không có bằng chứng nghiệm thu trình duyệt.

## Phát hiện có căn cứ mã nguồn

### P1 — Undo chưa nối vòng đời request

`resources/js/pages/staff/pos/hooks/usePOSCart.ts:678-781` định nghĩa `onSendBegin`, `onSendSuccess`, `onSendFailure`, `onSendAmbiguous`; cuối hook export các hàm này cùng `invalidateContexts`. Tìm toàn bộ `resources/js` chỉ thấy định nghĩa/export trong hook, không có caller. Vì vậy không được coi yêu cầu capture context/generation, khóa sửa/Undo khi gửi, xử lý kết quả mơ hồ là đã tích hợp. Cần nối send/checkout/transfer thực tế, test đổi bàn giữa request và realtime trước response. Chưa kết luận toàn bộ reconciliation sai; chưa hoàn tất audit duplicate rows/confirmed isolation.

`draftUndo.ts:107` dùng `max_servings ?? 999`, trái yêu cầu chặn restore khi thiếu dữ liệu capacity. `cloneRows` chỉ spread từng dòng trước recursive freeze; metadata lồng nhau chưa được clone sâu. Cần regression theo dữ liệu thực trước sửa.

### P1 — Menu không giữ hiển thị hợp lệ gần nhất

`hooks/usePOSMenuIndex.ts:10-22` trả `index: null` khi payload lỗi, không lưu index trước. `components/POSMenuTab.tsx:63-66` trả danh sách rỗng khi range sai. Trái đặc tả giữ kết quả/index hợp lệ gần nhất, ghi nhãn stale và khóa hành động khi payload lỗi. Reset gọi callback tùy chọn; kết quả tìm `onSearchChange` tại `POSManager.tsx:366` chưa đủ chứng minh callback truyền vào menu (còn phải kiểm tra vị trí JSX cụ thể).

### P1 — Kitchen chưa đủ phạm vi chức năng

- Mapping thực dùng `menuItem->category->kitchen_station_id`, fallback `general`, không suy tên (`KitchenDispatchService.php:235`).
- Tìm `kitchen_dispatch_settings`/`kitchen_station_id` trong app chỉ có đọc settings ở service/backfill và model mapping; chưa có luồng ghi settings/mapping được phân quyền/audit hoặc form quản trị như đặc tả/kế hoạch yêu cầu.
- `KitchenController::index:80` gọi `projectPending` trực tiếp. Projection chỉ đọc groups liên kết; không có readiness check cho pending legacy chưa liên kết trong đường đọc đã xem.
- `KitchenDispatchService::updateDeadline:185` dispatch `OrderSentToKitchen` bên trong transaction. Event implements `ShouldBroadcastNow`, không có hợp đồng after-commit trong file event. Client có thể refetch trước commit, hoặc nhận thông báo cho mutation rollback. Cần after-commit và test rollback/commit thực sự.
- Chưa chứng minh đầy đủ trạng thái disconnected, migration readiness, disabled station và quản trị version/FK.

### P1/P2 — Top-K còn sai lệch hợp đồng

- Heap giới hạn K, aggregate theo ID, trừ refunded_qty và chunk cursor thật đã có trong `PaidProductRankingService.php`.
- `rank:113-115` bỏ dòng net=0 trước cập nhật label, nên hóa đơn mới nhất đã hoàn hết không thể cập nhật tên cho sản phẩm còn net ở dòng cũ. Khác quy tắc tên từ dòng hợp lệ mới nhất.
- `rank:121-126` chỉ giữ mili giây; chưa bảo toàn microsecond khi chọn latest label.
- `product_id` trả integer, frontend khai báo number. `getProductRowKey` chuyển String sau JSON parse không phục hồi độ chính xác ID vượt `Number.MAX_SAFE_INTEGER`.
- `DashboardService::bumpSourceRevision:32-35` dùng has/forever/increment tách rời; khởi tạo có race. `topProducts:250` đọc revision ngoài fallback try/catch, mặc định 1 khi không có key; chưa đáp ứng bypass khi revision không khả dụng.
- `rank` dùng `DB::transaction`, nhưng transaction đơn thuần không chứng minh snapshot nhất quán dưới mọi isolation DB. Chưa test concurrent refund giữa chunk trên DB vận hành tương đương.
- Dashboard sequence tăng khi đổi K (`DashboardManager.tsx:157`), không tăng ở `handleRangeChange:225`; chưa có test UI chứng minh response cũ không thay date mới. Không kết luận race tái hiện khi chưa kiểm tra semantics hủy request của Inertia.
- `end->addSecond()` từ endOfDay cần kiểm tra microsecond boundary; chưa có bằng chứng đạt cho toàn bộ precision contract.

## GitNexus và phạm vi

Index ban đầu stale (`02505cf`, nhánh forecasting). Đã chạy `node .gitnexus/run.cjs analyze`: 5.116 nodes, 11.455 edges, 279 flows, hoàn tất 108,8 giây.

`impact usePOSMenuIndex --direction upstream`: LOW; một caller trực tiếp `POSMenuTab`, một process theo summary, ba flow được liệt kê dưới caller. Chưa sửa symbol nào.

`detect-changes --scope compare --base-ref main`: 46 files, 257 symbols, 55 affected processes, **CRITICAL**. Đã thông báo mức rủi ro cho người dùng trước mọi sửa mã. Đây là phân tích toàn nhánh, không phải bằng chứng mỗi thay đổi đều lỗi. Cần impact riêng từng symbol trước sửa tiếp và staged detect_changes trước commit.

## Kết luận

**Không đạt nghiệm thu cuối; chưa merge main.** Tests hiện có xanh nhưng không kiểm tra đủ tích hợp theo bốn đặc tả. Đã hoàn thành đơn vị kiểm thử nền và tài liệu thuật toán; chưa hoàn thành sửa lỗi, regression integration, browser fixture, audit đầy đủ, hay xác minh cây main bằng cây đã test. Không ghi merge ID giả. Tài liệu mới: `docs/THUAT_TOAN_DANG_SU_DUNG.md`.
