# Design: Khung giờ vàng (Lịch thứ/giờ) + Hiệu suất batch code

**Ngày:** 2026-08-13
**Phạm vi:** Phần B — khung giờ vàng theo thứ + khung giờ trong ngày, kèm hiệu suất tự động cho campaign phát hành mã hàng loạt.

---

## Bối cảnh & Vấn đề

- Promotion hiện chỉ giới hạn theo `start_date`/`end_date` (ngày), không theo **thứ trong tuần** hay **khung giờ trong ngày** → không làm được "khung giờ vàng" (vd T2–T4 11h–13h giảm 30% toàn đơn).
- Campaign batch (mã con) có `codes_count`/`codes_used` nhưng cột Hiệu suất trong Campaign Performance vẫn tính theo `target_usage`/`max_usage` — với batch thì lệch (batch dùng 1 lần/mã).

## Mục tiêu

1. Mỗi campaign cấu hình **nhiều khung giờ vàng** (thứ + giờ bắt đầu/kết thúc), là **điều kiện AND** với các điều kiện hiện có.
2. Engine chỉ áp dụng promotion khi thời điểm hiện tại nằm trong **ít nhất 1** khung giờ của campaign.
3. Cột **Hiệu suất** cho campaign batch tự động = `codes_used / codes_count × 100` (không cần target riêng); campaign thường giữ nguyên.

---

## Kiến trúc

### Schema — bảng `promotion_time_slots`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigint PK | |
| `promotion_id` | FK → promotions, cascadeOnDelete | |
| `day_of_week` | tinyint 0–6 | 0 = Chủ nhật, 1–6 = T2–T7 |
| `start_time` | time | giờ bắt đầu |
| `end_time` | time | giờ kết thúc (nửa mở: `[start, end)`) |
| timestamps | | |

Mỗi campaign có thể nhiều dòng. Ví dụ "T2–T4 11h–13h" = 3 dòng (T2, T3, T4, 11:00–13:00).

**`promotions` không thêm cột** — dùng relation `timeSlots()` hasMany.

### Model

- `PromotionTimeSlot` model: `fillable = ['promotion_id','day_of_week','start_time','end_time']`, casts `day_of_week => 'int'`.
- `Promotion::timeSlots()` hasMany.

### Engine — `PromotionEngine::matchesConditions`

Thêm check khung giờ vào cuối `matchesConditions` (là AND với các condition khác):

```php
// Khung giờ vàng: nếu campaign có time_slots thì thời điểm hiện tại phải nằm trong ít nhất 1 slot
if ($p->timeSlots->isNotEmpty()) {
    $now = now();
    $dow = (int) $now->dayOfWeek; // Carbon: 0=CN ... 6=T7
    $hm = $now->format('H:i');
    $ok = $p->timeSlots->contains(
        fn ($slot) => (int) $slot->day_of_week === $dow
            && $hm >= $slot->start_time
            && $hm < $slot->end_time
    );
    if (! $ok) {
        return false;
    }
}
```

- Campaign **không có** slot nào → không ràng buộc (hành vi cũ).
- `timeSlots` phải được eager load trong `resolveAll` (`->with(['conditions', 'actions', 'timeSlots'])`) và `candidates()`.
- Lưu ý: so sánh `time` dạng chuỗi `'H:i'` — đúng với định dạng `time` trong DB.

### Controller — store/update

- Rules: `time_slots` nullable array; `time_slots.*.day_of_week` required integer 0–6; `time_slots.*.start_time` required date_format H:i; `time_slots.*.end_time` required date_format H:i + `after:start_time`.
- Store/update: xoá `timeSlots` cũ, tạo lại từ `$validated['time_slots']` (pattern giống conditions/actions).
- Index payload: expose `time_slots: [{day_of_week, start_time, end_time}]`.

### Frontend — PromotionFormDrawer section "Khung giờ vàng"

Trong "Điều kiện & Giới hạn", thêm section (tùy chọn, có nút thêm/xoá):

```jsx
// Mỗi slot: checkbox chọn các ngày T2..CN (multi) + giờ bắt đầu + giờ kết thúc
```

- State: `timeSlots: { days: number[], start: string, end: string }[]`.
- Lưu thành nhiều dòng `promotion_time_slots` (mỗi ngày đã chọn = 1 dòng).
- Load khi edit từ `promotionToEdit.time_slots`; reset khi tạo mới.
- Dùng `<input type="time">` native (không cần thư viện picker).

### Hiệu suất batch — PromotionsManager cột Hiệu suất

Ưu tiên theo thứ tự:

```ts
const perf = (p: PromotionData) => {
    if (p.codes_count > 0) {
        return p.codes_count ? Math.min(100, Math.round((p.codes_used / p.codes_count) * 100)) : null;
    }
    const base = p.target_usage ?? p.max_usage;
    return base ? Math.min(100, Math.round((p.used_count / base) * 100)) : null;
};
```

- Campaign batch → % mã đã dùng.
- Campaign thường → % theo target_usage/max_usage (giữ nguyên).
- `codes_count`/`codes_used` đã có trong payload index (task trước).

---

## Error handling

- `end_time` phải sau `start_time` (validation `after:start_time`) — tránh slot rỗng/vô nghĩa.
- Nếu `time_slots` rỗng → không ghi dòng nào (campaign không ràng buộc giờ).
- Engine: nếu slot `end_time <= start_time` trong DB (dữ liệu cũ/corrupt) → so sánh chuỗi vẫn trả false, an toàn (không áp dụng).

---

## Testing (Pest)

- `PromotionEngineTest`: slot đúng ngày + trong giờ → áp dụng; sai ngày → không áp dụng; đúng ngày ngoài giờ → không áp dụng; campaign không slot → vẫn áp dụng (backward compat); nhiều slot → thoả 1 là áp.
- `PromotionControllerTest`: store với time_slots → tạo đúng số dòng; update thay slot → xoá cũ tạo mới; end_time trước start_time → 422; payload index expose time_slots.
- Frontend: `npm run types:check && npm run build` pass.

---

## Không nằm trong phạm vi

- Lịch theo tháng/ngày lễ đặc biệt (chỉ thứ + giờ trong ngày).
- Recurring riêng biệt (nhiều slot đã đủ cho nhu cầu hiện tại).
