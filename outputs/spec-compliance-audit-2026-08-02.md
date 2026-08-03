# Báo cáo đối chiếu 3 implementation với specification

**Ngày rà soát:** 2026-08-02  
**Phạm vi:** Hoàn kho khi hủy món, khuyến mãi tại POS, mở/đóng ca và đối soát tiền mặt.  
**Phương pháp:** Đối chiếu trực tiếp design spec, implementation plan, controller/model/migration/frontend/test và trạng thái diff hiện tại. Không sửa mã nguồn trong đợt audit này.

## Kết luận điều hành

Ba hạng mục đã triển khai **đúng phần lớn luồng nghiệp vụ chính** và bộ kiểm thử backend hiện có đã từng chạy đạt **131 tests / 644 assertions**. Tuy nhiên, chưa nên coi là hoàn toàn khớp spec để đưa lên production mà không xử lý các điểm dưới đây:

1. **Cao — In hóa đơn K80 bỏ qua khuyến mãi:** checkout và PaymentDrawer tính đúng, nhưng receipt vẫn in tổng trước giảm giá.
2. **Cao — Ràng buộc “chỉ một ca mở toàn hệ thống” chưa được bảo đảm chắc chắn khi concurrent:** `lockForUpdate()->exists()` không khóa được gì nếu chưa có row open; migration cũng không có constraint bảo vệ.
3. **Cao — Hoàn kho có thể ghi sai nhân viên:** code nhận `users.id` nhưng kiểm tra như `employees.id`, thay vì tra `employees.user_id`.
4. **Trung bình — POS hủy toàn đơn không khóa trực tiếp các `order_items`:** có nguy cơ race với luồng Bếp hủy một món, dẫn tới hoàn kho hai lần.
5. **Trung bình — CRUD khuyến mãi đang hard delete, trong khi phần Testing của design yêu cầu soft delete.**

Ngoài ra còn các lệch spec mức trung bình/thấp về thông báo lỗi khuyến mãi, trạng thái mã giảm 0 đồng, React hook order, permission tests, deposit tests và concurrency tests.

---

## 1. Hoàn kho khi hủy món

### Mức độ phù hợp

**Cơ bản đúng spec/plan.** Hai luồng Bếp và POS đều chỉ hoàn kho khi trạng thái trước đó là `completed`, chạy trong transaction, dùng công thức recipe hiện tại × số lượng món, bỏ qua nguyên liệu bị thiếu và tạo `inventory_transactions` loại `import`.

### Điểm đúng

- `KitchenController::cancelItem()` khóa `order_items` bằng `lockForUpdate`, bỏ qua item đã `cancelled`, và gọi hoàn kho trước khi đổi status (`app/Http/Controllers/Staff/KitchenController.php:215-240`).
- `POSController::cancelOrder()` chỉ hoàn kho item `completed`, rồi đổi item/order thành `cancelled` trong transaction (`app/Http/Controllers/Staff/POSController.php:1382-1415`).
- Service dùng recipe hiện tại, nhân số lượng và bỏ qua nguyên liệu đã bị xóa (`app/Services/InventoryIngredientService.php:19-28`).
- Mỗi nguyên liệu được ghi một transaction `import`, có lý do và thời điểm (`app/Services/InventoryIngredientService.php:30-36`).
- Idempotency tuần tự được bảo vệ bằng kiểm tra status `cancelled` ở luồng Bếp và điều kiện `status !== cancelled` ở POS.

### Phát hiện

#### [CAO] INV-01 — Có thể ghi sai `employee_id` khi hoàn kho

- **Vị trí:** `app/Services/InventoryIngredientService.php:13-17`; caller truyền `$request->user()?->id` tại `KitchenController.php:230-233` và `POSController.php:1400-1403`.
- **Nguyên nhân:** `inventory_transactions.employee_id` tham chiếu `employees.id`, trong khi giá trị truyền vào là `users.id`. Bảng `employees` có quan hệ thật ở `employees.user_id` (`database/migrations/2026_07_17_140100_create_employees_table.php:13`).
- **Rủi ro:**
  - Nếu không có `employees.id` trùng với `users.id`, attribution bị mất (`null`).
  - Nếu vô tình có ID trùng nhưng thuộc nhân viên khác, transaction có thể bị gán sai người — đây là lỗi integrity/audit nghiêm trọng hơn việc để null.
- **Khuyến nghị:** truyền `userId`, rồi resolve `Employee::where('user_id', $userId)->value('id')`; đổi tên tham số để tránh nhầm domain ID. Thêm test với `employee.id != user.id`.

#### [TRUNG BÌNH] INV-02 — Race giữa POS hủy toàn đơn và Bếp hủy một món

- **Vị trí:** Bếp khóa item ở `KitchenController.php:215`; POS chỉ khóa order tại `POSController.php:1385-1388`, còn items được eager-load nhưng không `lockForUpdate`.
- **Kịch bản:** một transaction Bếp và một transaction POS có thể cùng đọc item là `completed` từ các lock khác nhau, rồi đều gọi hoàn kho trước khi status `cancelled` được quan sát.
- **Rủi ro:** stock và inventory import transaction tăng hai lần.
- **Khuyến nghị:** thống nhất thứ tự khóa cho cả hai luồng, ví dụ khóa order rồi khóa tất cả `order_items` theo ID trước khi kiểm tra status; bổ sung integration/concurrency test trên MySQL.

#### [THẤP — tài liệu] INV-03 — Chuỗi lý do fallback không nhất quán trong design

- Main rule/plan/implementation dùng `Hoàn kho do hủy món` (và thêm order code nếu có).
- Một đoạn edge-case trong design dùng câu khác `Hoàn kho khi hủy`.
- Đây là mâu thuẫn tài liệu, không phải lỗi nghiệp vụ. Implementation đang theo plan và quy tắc chính.

---

## 2. Khuyến mãi — CRUD và checkout POS

### Mức độ phù hợp

**Backend checkout đúng phần lớn plan, nhưng UI/in hóa đơn và một số yêu cầu design còn thiếu.**

### Điểm đúng

- Model có đủ fillable/casts theo plan (`app/Models/Promotion.php:9-33`).
- CRUD index/store/update/destroy hoạt động, có unique validation và xác nhận mật khẩu khi xóa (`PromotionController.php:16-74`).
- Routes và permissions được đăng ký nhất quán theo implementation plan: `promotions.view/create/edit/delete` (`routes/web.php:111-114`, seeder và RoleController).
- Validation áp đủ điều kiện active, thời gian, số lượt, min order; lookup không phân biệt hoa thường (`POSController.php:1511-1544`).
- Percentage/fixed/cap/subtotal cap được dùng chung (`POSController.php:1547-1557`).
- Checkout đơn lẻ validate lại trong transaction, khóa promotion row, ghi `promotion_id`, `discount_amount`, `total`, invoice total và tăng `used_count` (`POSController.php:761-849`).
- Bulk checkout validate trên grand subtotal, phân bổ floor và giao remainder cho đơn cuối, tăng usage đúng một lần (`POSController.php:968-1099`).
- Deposit-aware payable backend và PaymentDrawer cùng dùng total sau giảm (`POSController.php:824-826`, `1021-1022`; `PaymentDrawer.tsx:49-51`).
- UI có input tại PaymentDrawer, lỗi nội tuyến và dòng giảm giá.

### Phát hiện

#### [CAO] PRO-01 — Hóa đơn K80 in sai tổng khi có promotion

- **Vị trí:**
  - Receipt state không có discount: `resources/js/pages/staff/pos/types/pos.types.ts:91-101`.
  - Khi checkout thành công, receipt snapshot không lưu discount: `usePOSCheckout.ts:328-339`.
  - `ReceiptPrintModal` tính `totalAmount = subtotal` và in `subtotal - deposit`, không trừ promotion: `ReceiptPrintModal.tsx:42-48`, `209-218`.
  - `POSManager` không truyền discount vào receipt: `POSManager.tsx:482-493`.
- **Tác động:** Backend lưu/invoice đúng nhưng phiếu K80 đưa khách hiển thị tổng cao hơn số thực trả; có thể gây tranh chấp và sai chứng từ bán hàng.
- **Khuyến nghị:** snapshot `promotionCode`/`promotionDiscount` hoặc tốt hơn trả invoice summary chuẩn từ backend; receipt in dòng giảm giá và dùng `subtotal - discount - deposit`.

#### [CAO/TRUNG BÌNH] PRO-02 — Hard delete trái yêu cầu test soft delete của design

- **Vị trí:** model không dùng `SoftDeletes` (`app/Models/Promotion.php`); controller gọi `$promotion->delete()` (`PromotionController.php:55`); test kỳ vọng `find(...)` null (`PromotionControllerTest.php:43-45`).
- **Đối chiếu:** design architecture nói soft delete nếu model dùng trait, nhưng phần Testing ghi rõ “soft delete”. Implementation plan lại mô tả hard delete.
- **Kết luận:** implementation khớp plan nhưng không khớp đầy đủ design. Đây cũng là nguy cơ FK/history nếu promotion đã được order tham chiếu; tùy FK, delete có thể bị chặn hoặc làm mất khả năng quản trị lịch sử.
- **Khuyến nghị:** chốt lại yêu cầu. Nếu cần audit lịch sử, thêm `deleted_at`, `SoftDeletes`, và giữ relation từ order.

#### [TRUNG BÌNH] PRO-03 — Không trả lý do lỗi nghiệp vụ cụ thể

- **Vị trí:** `POSController.php:719-723`, helper trả `null` cho mọi lý do (`1523-1539`).
- **Spec:** yêu cầu thông báo rõ “hết hạn / chưa tới hạn / hết lượt / dưới mức tối thiểu / không tồn tại / không hoạt động”.
- **Hiện tại:** mọi case trả “không hợp lệ hoặc đã hết hạn”. Tests cũng chỉ assert `ok=false` (`PromotionApplyTest.php:36-49`).
- **Khuyến nghị:** trả result có mã lỗi hoặc exception domain (`not_found`, `inactive`, `not_started`, `expired`, `exhausted`, `minimum_not_met`) và test từng message/code.

#### [TRUNG BÌNH] PRO-04 — Mã hợp lệ giảm 0 đồng không có trạng thái “đã áp” trên UI

- **Vị trí:** UI suy ra trạng thái đã áp từ `promotionDiscount > 0` (`PaymentDrawer.tsx:236`, `240`, `264`).
- **Kịch bản:** promotion hợp lệ có `discount_value=0`, percentage trên subtotal 0, hoặc cap 0. Hook vẫn lưu code (`usePOSCheckout.ts:201-208`), nhưng input vẫn mở và nút vẫn là “Áp dụng”; người dùng không thấy confirmation/hủy mã.
- **Khuyến nghị:** truyền `promotionCode`/`appliedPromotion` riêng vào drawer và dùng nó làm state, không dùng số tiền giảm làm cờ boolean.

#### [TRUNG BÌNH — chất lượng/runtime] PRO-05 — `PaymentDrawer` vi phạm Rules of Hooks

- **Vị trí:** component return sớm trước `useState`/`useEffect` (`PaymentDrawer.tsx:40`, hooks tại `53-72`).
- **Rủi ro:** khi cùng instance chuyển từ closed/no table sang open/table, số lượng hooks giữa các render thay đổi; React có thể báo “Rendered more hooks than during the previous render”.
- **Khuyến nghị:** luôn gọi hooks trước; chỉ return null sau toàn bộ hooks hoặc tách phần nội dung thành child component chỉ mount khi open.

#### [THẤP/TRUNG BÌNH] PRO-06 — Thiếu `show()` và permission name lệch prose design

- Design architecture nhắc REST `index, store, show, update, destroy` và permission `promotions.update`.
- Plan/routes triển khai `index/store/update/destroy`, không `show`, và dùng `promotions.edit` (`routes/web.php:111-114`).
- UI hiện không cần endpoint show, nên đây chủ yếu là lệch design/plan. Cần chuẩn hóa tài liệu hoặc route nếu API show thực sự cần.

#### [TEST GAP] PRO-T01 — Thiếu permission-denial tests

- Design yêu cầu CRUD đủ quyền và thiếu quyền bị chặn.
- `PromotionControllerTest` chỉ dùng `posAdmin()`; không test user thiếu từng permission.
- Shift tests tương tự chỉ chứng minh đường thành công với đủ quyền.

#### [TEST GAP] PRO-T02 — Thiếu test concurrent `max_uses`

- Code có `lockForUpdate`, nhưng SQLite tuần tự không chứng minh hai checkout đồng thời khi còn đúng một lượt.
- Nên có MySQL integration test hoặc test harness multi-connection.

#### [TEST GAP] PRO-T03 — Thiếu promotion + deposit và bulk invalid rollback

- Không có test ghép promotion với held deposit ở single/bulk checkout.
- Không có test bulk promotion hết hạn/invalid đảm bảo toàn bộ orders, invoice, deposit, `used_count` rollback.

#### [THẤP] PRO-T04 — Thiếu test case-insensitive code và password sai

- Code đã hỗ trợ case-insensitive, nhưng chưa có regression test.
- Delete có kiểm mật khẩu, nhưng chỉ test mật khẩu đúng.

---

## 3. Ca làm việc và đối soát tiền mặt

### Mức độ phù hợp

**Đúng công thức và UI/endpoint chính; chưa bảo đảm tuyệt đối invariant một ca mở khi concurrent.**

### Điểm đúng

- Migration có đầy đủ các cột theo spec (`create_shifts_table.php:11-22`).
- Model có fillable/casts và scope open (`app/Models/Shift.php:10-33`).
- Open/current/close và page route đúng plan; permissions đã đăng ký (`routes/web.php:171-174`).
- `expected_cash` chỉ cộng invoice cash, theo `issued_at` trong khoảng mở→hiện tại/đóng, dùng `amount_received`, không trừ change (`ShiftController.php:103-110`).
- Close lưu expected vào `closing_cash`, actual, timestamp, status, closed_by và trả difference (`ShiftController.php:71-100`).
- Không có logic chặn checkout khi chưa mở ca, đúng YAGNI/ràng buộc.
- Frontend là trang riêng, lỗi inline, có guard submitting, hiển thị expected/difference.

### Phát hiện

#### [CAO] SHIFT-01 — Invariant “toàn hệ thống chỉ một ca open” chưa an toàn dưới concurrent open

- **Vị trí:** `ShiftController.php:29-40`; migration không có unique/constraint cho open shift (`create_shifts_table.php:11-23`).
- **Vấn đề:** `Shift::open()->lockForUpdate()->exists()` chỉ khóa row khớp. Khi bảng chưa có row open, tùy isolation/index/query plan của MySQL, không có row cụ thể để khóa; hai transaction có thể cùng thấy false và cùng insert.
- **Tác động:** có thể tồn tại hai ca `status=open`, làm `current()` chọn ca ID mới nhất và bỏ qua ca còn lại; đối soát sai.
- **Khuyến nghị ưu tiên:** bảo vệ ở DB thay vì chỉ application check. Các lựa chọn:
  1. Thêm generated nullable key, ví dụ `open_guard = CASE WHEN status='open' THEN 1 ELSE NULL END`, unique index trên `open_guard` (MySQL); có chiến lược tương thích SQLite tests.
  2. Dùng bảng/singleton row cấu hình luôn tồn tại và khóa row đó khi mở/đóng.
  3. Dùng advisory lock MySQL với timeout, kèm unique safeguard nếu có thể.
- **Test:** chạy concurrent integration trên MySQL; SQLite tuần tự hiện tại không đủ.

#### [TRUNG BÌNH] SHIFT-02 — `current()` che giấu trạng thái dữ liệu hỏng nếu đã có nhiều ca open

- **Vị trí:** `ShiftController.php:50-60` dùng `latest('id')->first()`.
- **Tác động:** nếu invariant bị phá, UI chỉ thấy một ca; ca open cũ trở thành orphan và chặn/méo các thao tác sau.
- **Khuyến nghị:** sau khi thêm DB guard, cân nhắc phát hiện `count > 1` và trả lỗi vận hành rõ để sửa dữ liệu, thay vì âm thầm chọn latest.

#### [TRUNG BÌNH — ranh giới dữ liệu] SHIFT-03 — Spec prose nói `created_at`, plan/code dùng `issued_at`

- Design formula line 61 nói `created_at`, nhưng phần hiện trạng nhấn mạnh invoice và implementation plan chốt `issued_at`. Code dùng `issued_at` (`ShiftController.php:107`).
- Implementation khớp plan; tài liệu design cần chuẩn hóa. `issued_at` hợp lý hơn về nghiệp vụ nếu đó là thời điểm phát hành hóa đơn.

#### [TEST GAP] SHIFT-T01 — Thiếu test boundary và invoice ngoài khoảng

Nên bổ sung:
- Invoice cash trước `opened_at` không được tính.
- Invoice đúng `opened_at` và đúng `closed_at` được tính (do `whereBetween` inclusive).
- Invoice sau thời điểm close snapshot không được tính.
- Ca qua đêm vẫn tính đầy đủ.

#### [TEST GAP] SHIFT-T02 — Thiếu permission-denial và concurrent-open tests

- Test hiện có kiểm đường thành công và validation, không kiểm từng route bị chặn khi thiếu quyền.
- “Mở ca thứ hai” chỉ là hai request tuần tự (`ShiftControllerTest.php:5-12`), không phải race test.

#### [THẤP — chất lượng] SHIFT-UI01 — Request helper được tạo lại, `load` dùng closure bỏ dependency

- `request` được định nghĩa trong component nhưng `load` có dependency array rỗng (`ShiftsPage.tsx:37-74`). Build vẫn pass và helper hiện không phụ thuộc state, nhưng lint hooks có thể cảnh báo/logic dễ stale nếu helper thay đổi.
- Nên đưa helper ra module hoặc bọc `useCallback`; không phải lỗi nghiệp vụ hiện tại.

---

## 4. Kiểm chứng tích hợp và trạng thái test

### Đã xác nhận từ đợt triển khai

- Backend full suite: **131 tests, 644 assertions — pass**.
- PHP syntax: pass.
- TypeScript check và Vite production build: pass.
- Routes promotions/validate-promotion/shifts đã đăng ký.
- `git diff --check`: pass, không có whitespace error.

### Hạn chế của bằng chứng hiện tại

- Test DB là SQLite `:memory:` nên không kiểm chứng được locking/gap lock/unique behavior thực tế trên MySQL.
- Repository-wide ESLint có baseline lỗi lớn; các file frontend chạm tới vẫn có một số vấn đề hooks/style, đặc biệt `PaymentDrawer`.
- Không có browser/UI test cho receipt, promotion state hoặc shift modal.
- Không có commit được tạo; các bước commit trong plan vẫn để trống đúng thực tế.
- Working tree còn nhiều file sửa/untracked ngoài ba hạng mục; cần tách phạm vi trước khi commit để tránh cuốn thay đổi không liên quan.

---

## 5. Thứ tự sửa đề xuất

1. **PRO-01:** sửa receipt K80 nhận và in promotion discount; thêm test/component coverage hoặc ít nhất pure calculation test.
2. **SHIFT-01:** thêm DB-level guard/singleton locking cho một ca open; test concurrent trên MySQL.
3. **INV-01:** resolve employee theo `employees.user_id`; thêm test ID lệch nhau.
4. **INV-02:** thống nhất row locking cho item cancellation giữa Kitchen và POS.
5. **PRO-02:** quyết định và triển khai soft delete hoặc sửa design nếu hard delete là chủ đích.
6. **PRO-03/PRO-04/PRO-05:** lỗi rõ theo từng lý do, state promotion riêng, sửa hook order.
7. Bổ sung test gaps: permissions, promotion+deposit, bulk rollback, max-use concurrency, shift time boundaries.

## Phán quyết

- **Hoàn kho:** đạt chức năng chính, nhưng cần sửa attribution và concurrency trước khi coi là audit-safe.
- **Khuyến mãi:** backend tính tiền đạt plan; chưa đạt end-to-end do receipt in sai và một số yêu cầu design/test còn thiếu.
- **Ca làm việc:** đạt luồng tuần tự và công thức; chưa đạt cam kết “duy nhất toàn hệ thống” trong môi trường concurrent nếu chưa có DB-level guard.

**Kết luận chung:** implementation hiện tại là một bản hoàn thiện tốt về happy path và regression tuần tự, nhưng **chưa hoàn toàn đúng spec ở mức production/concurrency/audit**. Không có lỗi Critical làm mất dữ liệu tức thời được chứng minh, nhưng có ba lỗi mức Cao cần ưu tiên trước khi phát hành.