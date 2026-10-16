# Thuật toán đang sử dụng

Đối chiếu mã nguồn nhánh `feat/restaurant-algorithms`, nền `c005178`. Phạm vi: bốn tính năng ngày 16/10/2026; không phải danh mục toàn hệ thống. Có thuật toán hoạt động nhưng tích hợp chưa đạt nghiệm thu cuối.

| Tính năng | Thuật toán/cấu trúc thực tế | Bằng chứng mã nguồn | Chi phí và giới hạn |
| --- | --- | --- | --- |
| Tìm món POS | Chuẩn hóa Unicode NFD, bỏ dấu, đổi `đ`, tìm chuỗi con tuyến tính | `resources/js/pages/staff/pos/utils/menuAlgorithms.ts`: `normalizeName`, `queryMenu`; gọi từ `components/POSMenuTab.tsx` | Duyệt n món; chi phí còn phụ thuộc độ dài chuỗi. Không tìm gần đúng. |
| Lọc khoảng giá | Chỉ mục giá; tìm nhị phân cận dưới/cận trên, lấy khoảng bao gồm hai đầu | Cùng module: `buildMenuIndex`, `lowerBoundPrice`, `upperBoundPrice`, `queryMenu` | Hai cận O(log n); truy vấn đầy đủ vẫn duyệt O(n), cộng lấy ứng viên và sắp kết quả. |
| Sắp món | MergeSort ổn định tự cài đặt, so tên chuẩn hóa hoặc giá; giữ thứ tự khi bằng khóa | Cùng module: `mergeSortStable`, `queryMenu` | Xây chỉ mục O(n log n); sắp r kết quả O(r log r), bộ nhớ phụ O(n) hoặc O(r). |
| Tra món, huy hiệu số lượng | `Map` theo ID; cộng số lượng qua các dòng giỏ | Cùng module: `buildMenuIndex`, `aggregateCartQuantities`; `hooks/usePOSCart.ts` | Xây map O(n), cộng c dòng O(c), tra kỳ vọng O(1). Không gộp danh tính dòng giỏ. |
| Hoàn tác món nháp | Lịch sử LIFO tối đa 50 snapshot; xác thực nhu cầu bằng `Map`; fingerprint baseline chuẩn hóa | `resources/js/pages/staff/pos/utils/draftUndo.ts`; `hooks/usePOSCart.ts`; `components/POSCartPanel.tsx` | Sao chép snapshot O(d), sao chép mảng lịch sử O(h), h ≤ 50; không được gọi toàn thao tác là O(1). Callback send/invalidation còn chưa nối vào luồng ngoài hook. |
| Gợi ý thứ tự bếp | Binary Min-Heap, bottom-up heapify; FIFO theo giờ gửi/ID hoặc ưu tiên chờ lâu rồi deadline | `resources/js/pages/staff/kitchen/utils/dispatchQueue.ts`: `MinHeap`, `orderGroups`; gọi từ `KitchenDisplay.tsx` | Heapify O(g), xuất toàn bộ O(g log g), bộ nhớ O(g). Chỉ gợi ý, không tự điều phối nhân viên. |
| Chia nhóm gửi bếp | Phân nhóm theo station ID được gán cho danh mục; snapshot batch × station | `app/Services/KitchenDispatchService.php::createBatchForOrderItems`; `POSController::sendToKitchen` | Duyệt các dòng gửi và ghi DB; có truy vấn station riêng. Không suy station từ tên món. Chưa có giao diện quản trị mapping/settings. |
| Top-K món đã thanh toán | Đọc chunk 1.000 dòng; mảng kết hợp PHP theo product ID; heap giới hạn K (`SplHeap`); `usort` kết quả cuối | `app/Services/Manager/PaidProductRankingService.php`: `rank`, `PaidProductMinHeap::compare`; `DashboardService::topProducts` | L dòng, P món: kỳ vọng O(L + P log K + K log K), nhớ O(P + 1.000 + K). `usort` không phải MergeSort tự cài. |

## Quy tắc dữ liệu

- Giá lọc là giá niêm yết, so theo đơn vị phần trăm nguyên; không phải giá sau khuyến mãi.
- Undo chỉ lưu món chưa xác nhận trong phiên; không hoàn tác thanh toán hay gửi bếp.
- Snapshot Undo clone sâu trước freeze; thiếu capacity chặn restore. Menu giữ kết quả/index hợp lệ gần nhất khi dữ liệu hoặc khoảng giá lỗi, hiển thị stale và khóa chọn món; Reset đồng bộ ô tìm kiếm cha.
- Bếp lấy trạng thái/số lượng từ `order_items`; legacy backfill tạo nhóm riêng từng dòng, không dựng lại batch lịch sử chính xác.
- Top-K dùng hóa đơn thật có phương thức thanh toán, trừ `invoice_lines.refunded_qty`; không suy số món hoàn từ tiền hoàn. Dòng thiếu ID bị loại và có bộ đếm độ phủ.
- Cache, SQL `orderBy`, collection sort và framework không được coi là bằng chứng tự cài MergeSort/heap.

## Trạng thái nghiệm thu

Baseline PHP: 915 tests, 7.265 assertions đạt; PHPStan ba service đạt. Sau sửa menu và snapshot/capacity Undo: Node 110 tests, TypeScript, scoped ESLint và production build đạt. Menu chưa kiểm thử tương tác trình duyệt; còn lỗi tích hợp lifecycle Undo, thiếu quản trị/readiness bếp và độ chính xác/cache Top-K. **Chưa chấp nhận merge `main`.** Chi tiết: `.superpowers/final-restaurant-algorithms-acceptance.md`.

Chưa migrate/backfill DB vận hành. Test SQLite bộ nhớ không chứng minh schema đã triển khai hoặc nghiệp vụ trình duyệt đăng nhập đã đạt.
