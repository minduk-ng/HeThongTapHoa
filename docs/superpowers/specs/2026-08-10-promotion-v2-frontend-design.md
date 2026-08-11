# Promotion v2 — Frontend Quản lý (Spec 2/3)

> Spec 2 của loạt 3 spec: làm lại UI quản lý khuyến mãi theo 2 mẫu HTML (`D:\Downloads\giao_dien\tong_quan_khuyen_mai.html` — tổng quan/analytics, `them_moi_khuyen_mai.html` — form thêm mới). Spec 1 = DB + engine (đã viết). Spec 3 = analytics stats chi tiết.

**Goal:** Thay `PromotionsManager.tsx` + `PromotionFormDrawer.tsx` hiện tại bằng UI mới theo mẫu: trang tổng quan (danh sách chiến dịch + KPI sơ bộ) và form thêm/sửa promotion v2 (type/code/conditions/actions/exclusive/stackable + preview). KHÔNG làm analytics chi tiết (spec 3).

**Scope:** Frontend React/TSX + 1 controller method (`PromotionController::index/store/update` đã đổi shape ở spec 1 — frontend phải theo). KHÔNG đổi backend logic.

---

## Phần 1 — Giao diện tổng quan (PromotionsManager mới)

Thay thế `PromotionsManager.tsx` + `PromotionTable.tsx` + `PromotionFormDrawer.tsx` (3 file hiện tại) bằng trang mới theo mẫu `tong_quan_khuyen_mai.html`.

**Layout (bám sát mẫu):**
- Sidebar (ManagerPageLayout pattern như các trang khác): search, filter trạng thái (Tất cả/Đang chạy/Đã kết thúc), thống kê "Tổng chiến dịch", lối tắt "Chiến dịch mới".
- **4 KPI cards** (bento): Tổng doanh thu từ KM, Tổng lượt đã dùng, Giá trị giảm trung bình, Chi phí KM (ROI). Số liệu sơ bộ từ controller (spec 3 làm chi tiết; spec 2 hiển thị giá trị có sẵn hoặc 0).
- **Bảng Campaign Performance**: Mã/Tên chiến dịch, Loại (badge Promotion/Coupon/Voucher), Số đơn hàng, Tổng doanh thu, Tổng giảm giá, Hiệu suất (progress bar %).
- Nút "Xuất báo cáo" (spec 3 nối; spec 2 hiển thị disabled/placeholder).

**Controller `PromotionController::index` trả:**
```php
'promotions' => $query->with(['conditions', 'actions'])->latest('id')->get()->map(fn ($p) => [
    'id' => $p->id,
    'name' => $p->name,
    'type' => $p->type,
    'code' => $p->code,
    'start_date' => $p->start_date?->format('d/m/Y'),
    'end_date' => $p->end_date?->format('d/m/Y'),
    'status' => $p->status,
    'used_count' => $p->used_count,
    'max_usage' => $p->max_usage,
    'exclusive' => $p->exclusive,
    'stackable' => $p->stackable,
    'conditions' => $p->conditions->map(fn ($c) => ['cond_type' => $c->cond_type, 'cond_value' => $c->cond_value]),
    'actions' => $p->actions->map(fn ($a) => ['action_type' => $a->action_type, 'action_value' => $a->action_value, 'max_discount_amount' => $a->max_discount_amount]),
]),
'stats' => ['total_campaigns' => ..., 'total_orders' => 0, 'total_revenue' => 0, 'total_discount' => 0, 'avg_discount' => 0, 'roi' => 0],  // sơ bộ; spec 3 nối thật
```

**Hiệu suất sơ bộ (spec 2):** dùng `used_count/max_usage` nếu max_usage; ngược lại hiển thị "—". Spec 3 thay bằng số thật.

---

## Phần 2 — Form thêm/sửa promotion v2 (PromotionFormDrawer mới)

Thay thế hoàn toàn `PromotionFormDrawer.tsx` theo mẫu `them_moi_khuyen_mai.html` (form nhiều section + preview bên phải).

**Section A — Thông tin chung:**
- Tên chương trình (required)
- Loại hình: select `Promotion (tự động)` / `Coupon` / `Voucher`
- Mã Code (chỉ hiện khi Coupon/Voucher; nút shuffle tạo ngẫu nhiên)
- Từ ngày / Đến ngày (DatePicker)

**Section B — Cấu hình giảm giá (actions — NHIỀU dòng, thêm/xoá):**
- Mỗi dòng action: select `Giảm %` / `Giảm tiền` / `Tặng món` + giá trị + (nếu %) mức giảm tối đa + (nếu tặng món) SearchableSelect chọn món
- Nút "+ Thêm hành động" / xoá dòng
- Với "Giảm %", "Mức giảm tối đa" hiện (giống mẫu — disabled khi không phải %)

**Section C — Điều kiện & Giới hạn (conditions — NHIỀU dòng, thêm/xoá):**
- Mỗi dòng condition: select `Đơn tối thiểu (đ)` / `Số lượng món tối thiểu` / `Món cụ thể` + giá trị (nếu món cụ thể → SearchableSelect)
- Nút "+ Thêm điều kiện" / xoá dòng
- "Tổng số lượt sử dụng tối đa" (max_usage)

**Section D — Toggle:**
- Độc quyền (exclusive): "Không áp dụng chung với chương trình khác"
- Áp dụng đồng thời (stackable): "Cho phép đè lên promotion tự động"

**Section E — Preview (bên phải, sticky):**
- Thẻ giả lập giống mẫu: badge loại, tên, "Giảm X" (từ action đầu), đơn tối thiểu, HSD
- Cập nhật realtime theo form

**Bottom:** Hủy bỏ / Lưu & Kích hoạt.

**Payload gửi lên (khớp spec 1 controller):**
```ts
{
  name, type, code?, start_date?, end_date?, status, max_usage?,
  exclusive, stackable,
  conditions: [{cond_type, cond_value}],
  actions: [{action_type, action_value, max_discount_amount?}],
}
```

---

## Phần 3 — Routes + tương thích

- Routes giữ nguyên (`GET/POST /manager/promotions`, `POST /manager/promotions/{id}`).
- `PromotionController::store/update` đã đổi shape ở spec 1 — frontend mới gửi đúng shape.
- Xoá `PromotionTable.tsx` cũ (hoặc giữ nếu dùng chỗ khác — kiểm tra; chỉ PromotionsManager import).
- `menu_items`/`menu_categories` props cho SearchableSelect (controller index đã trả).

---

## Chiến lược kiểm thử

- `npm run types:check` + `npm run build` pass.
- Render smoke: mở trang promotions → list render, mở form → sections hiện, add/remove condition/action dòng, preview cập nhật.
- Submit form tạo promotion v2 → POST đúng shape → controller (spec 1) lưu 3 bảng.
- Backend regression: `php artisan test` (spec 1 đã xanh).

## File Structure

**Sửa:**
- `resources/js/pages/manager/promotions/PromotionsManager.tsx` — rewrite theo mẫu tổng quan
- `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx` — rewrite theo mẫu thêm mới
- `app/Http/Controllers/Manager/PromotionController.php` — index trả shape mới + stats sơ bộ (store/update đã ở spec 1)

**Xoá hoặc bỏ không dùng:**
- `resources/js/pages/manager/promotions/components/PromotionTable.tsx` (nếu không còn dùng)

**Tạo mới:**
- `resources/js/pages/manager/promotions/components/PromotionActionsEditor.tsx` (thêm/xoá dòng action)
- `resources/js/pages/manager/promotions/components/PromotionConditionsEditor.tsx` (thêm/xoá dòng condition)
- `resources/js/pages/manager/promotions/components/PromotionPreview.tsx` (thẻ preview)
- `resources/js/pages/manager/promotions/components/PromotionStatsCards.tsx` (4 KPI cards)
