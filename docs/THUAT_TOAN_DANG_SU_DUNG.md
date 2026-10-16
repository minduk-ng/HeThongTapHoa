# Thuật toán đang sử dụng

Đối chiếu mã nguồn nhánh `feat/restaurant-algorithms` sau nghiệm thu cuối. Phạm vi: bốn tính năng ngày 16/10/2026; không phải danh mục toàn hệ thống. Tất cả thuật toán đã tích hợp và đạt nghiệm thu.

| Tính năng | Thuật toán/cấu trúc thực tế | Bằng chứng mã nguồn | Chi phí và giới hạn |
| --- | --- | --- | --- |
| Tìm món POS | Chuẩn hóa Unicode NFD, bỏ dấu, đổi `đ`, tìm chuỗi con tuyến tính | `resources/js/pages/staff/pos/utils/menuAlgorithms.ts`: `normalizeName`, `queryMenu`; gọi từ `components/POSMenuTab.tsx` | Duyệt n món; chi phí còn phụ thuộc độ dài chuỗi. Không tìm gần đúng. |
| Lọc khoảng giá | Chỉ mục giá; tìm nhị phân cận dưới/cận trên, lấy khoảng bao gồm hai đầu | Cùng module: `buildMenuIndex`, `lowerBoundPrice`, `upperBoundPrice`, `queryMenu` | Hai cận O(log n); truy vấn đầy đủ vẫn duyệt O(n), cộng lấy ứng viên và sắp kết quả. |
| Sắp món | MergeSort ổn định tự cài đặt, so tên chuẩn hóa hoặc giá; giữ thứ tự khi bằng khóa | Cùng module: `mergeSortStable`, `queryMenu` | Xây chỉ mục O(n log n); sắp r kết quả O(r log r), bộ nhớ phụ O(n) hoặc O(r). |
| Tra món, huy hiệu số lượng | `Map` theo ID; cộng số lượng qua các dòng giỏ | Cùng module: `buildMenuIndex`, `aggregateCartQuantities`; `hooks/usePOSCart.ts` | Xây map O(n), cộng c dòng O(c), tra kỳ vọng O(1). Không gộp danh tính dòng giỏ. |
| Hoàn tác món nháp | Lịch sử LIFO tối đa 50 snapshot; xác thực nhu cầu bằng `Map`; fingerprint baseline chuẩn hóa; lifecycle nối vào luồng gửi/thanh toán/chuyển-gộp bàn | `resources/js/pages/staff/pos/utils/draftUndo.ts`; `hooks/usePOSCart.ts`, `hooks/usePOSCheckout.ts`; `components/POSCartPanel.tsx` | Sao chép snapshot O(d), sao chép mảng lịch sử O(h), h ≤ 50; không được gọi toàn thao tác là O(1). Chỉ hoàn tác phần chưa gửi; món đã xác nhận giữ nguyên. |
| Gợi ý thứ tự bếp | Binary Min-Heap, bottom-up heapify; FIFO theo giờ gửi/ID hoặc ưu tiên chờ lâu rồi deadline | `resources/js/pages/staff/kitchen/utils/dispatchQueue.ts`: `MinHeap`, `orderGroups`; gọi từ `KitchenDisplay.tsx` | Heapify O(g), xuất toàn bộ O(g log g), bộ nhớ O(g). Chỉ gợi ý, không tự điều phối nhân viên. |
| Chia nhóm gửi bếp | Phân nhóm theo station ID được gán cho danh mục; snapshot batch × station; quản trị settings/mapping có quyền và audit; cổng readiness cho dữ liệu legacy | `app/Services/KitchenDispatchService.php::createBatchForOrderItems`; `POSController::sendToKitchen`; `KitchenController` (settings, mapping, deadline); broadcast deadline sau commit | Duyệt các dòng gửi và ghi DB; có truy vấn station riêng. Không suy station từ tên món. Cấu hình mới chỉ áp dụng batch mới. |
| Top-K món đã thanh toán | Đọc chunk 1.000 dòng; mảng kết hợp PHP theo product ID; heap giới hạn K (`SplHeap`); `usort` kết quả cuối | `app/Services/Manager/PaidProductRankingService.php`: `rank`, `PaidProductMinHeap::compare`; `DashboardService::topProducts` | L dòng, P món: kỳ vọng O(L + P log K + K log K), nhớ O(P + 1.000 + K). `usort` không phải MergeSort tự cài. |

## Quy tắc dữ liệu

- Giá lọc là giá niêm yết, so theo đơn vị phần trăm nguyên; không phải giá sau khuyến mãi.
- Undo chỉ lưu món chưa xác nhận trong phiên; không hoàn tác thanh toán hay gửi bếp.
- Snapshot Undo clone sâu trước freeze; thiếu capacity chặn restore. Menu giữ kết quả/index hợp lệ gần nhất khi dữ liệu hoặc khoảng giá lỗi, hiển thị stale và khóa chọn món; Reset đồng bộ ô tìm kiếm cha.
- Bếp lấy trạng thái/số lượng từ `order_items`; legacy backfill tạo nhóm riêng từng dòng, không dựng lại batch lịch sử chính xác.
- Top-K dùng hóa đơn thật có phương thức thanh toán, trừ `invoice_lines.refunded_qty`; không suy số món hoàn từ tiền hoàn. Dòng thiếu ID bị loại và có bộ đếm độ phủ.
- Cache, SQL `orderBy`, collection sort và framework không được coi là bằng chứng tự cài MergeSort/heap.

## Trạng thái nghiệm thu

PHP đầy đủ trên SQLite bộ nhớ: **927 tests, 7.355 assertions đạt**. Node: **109 tests đạt**. TypeScript, PHPStan, ESLint phạm vi thay đổi và production build đạt. Các lỗi tích hợp đã sửa và có regression: lifecycle Undo nối vào luồng gửi/thanh toán/chuyển-gộp; menu giữ kết quả hợp lệ gần nhất khi lỗi; bếp có quản trị settings/mapping, lọc station ID, cổng readiness, broadcast sau commit; Top-K nhãn mới nhất, ID an toàn JS, cache revision nguyên tử, biên ngày nửa mở. Chi tiết: `.superpowers/final-restaurant-algorithms-acceptance.md` và các báo cáo `*-fix-report.md`.

Chưa migrate/backfill DB vận hành; schema mới chỉ có hiệu lực sau khi chạy migration. Nghiệm thu trình duyệt đăng nhập thật chưa thực hiện.
