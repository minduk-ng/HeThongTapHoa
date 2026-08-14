# Design: Sidebar flyout — cấp 2 mở theo mục cha, ngang hàng, không đè

**Ngày:** 2026-08-13
**Phạm vi:** Điều chỉnh `Sidebar.tsx` — menu cấp 2 của group có `__subs` (Báo cáo) chỉ xuất hiện khi hover/click mục cha (sub_group), mở sang bên phải ngang hàng đỉnh mục cha, panel riêng không che mục cha nào.

Tiếp nối plan `2026-08-13-home-and-sidebar-flyout` (branch `feat/dashboard-home-report-groups`).

---

## Bối cảnh & Vấn đề

Hiện tại (Sidebar.tsx ~dòng 189-269):
- `activeSub` mặc định = `subKeys[0]` khi mở group → cấp 2 tự mở sẵn dù chưa hover mục cha nào.
- Cấp 2 dùng `absolute left-full top-0 ml-2` với `top-0` so với **toàn menu cấp 1** → luôn bắt đầu từ đỉnh menu, không bám mục cha đang hover.

User muốn:
1. Cấp 2 **chỉ mở khi hover hoặc click vào mục cha** (không tự mở sẵn).
2. Cấp 2 mở sang phải, **bắt đầu ngang hàng đỉnh mục cha đang hover**.
3. Cấp 2 là **panel riêng bên cạnh** — không che khuất bất kỳ mục cha nào (Doanh thu/Hoạt động luôn hiển thị đủ).

## Mục tiêu

- Khi mở dropdown Báo cáo: chỉ hiện menu cấp 1 (Doanh thu, Hoạt động), cấp 2 chưa hiện.
- Hover/click "Doanh thu" → cấp 2 mở bên phải từ đỉnh dòng Doanh thu; hover/click "Hoạt động" → cấp 2 Hoạt động từ đỉnh dòng đó.
- Di chuột sang mục cha khác → cấp 2 đổi nội dung tương ứng.
- Di chuột rời dropdown → đóng (giữ logic hiện tại).
- Group không `__subs` → dropdown phẳng cũ (không đổi).
- Mixed group (flat + `__subs`) → flat items hiển thị dưới cấp 1 (không đổi).

---

## Kiến trúc

### Thay đổi trong `Sidebar.tsx` (block flyout, dòng ~189-269)

**1. `activeSubGroup` không tự mặc định sub đầu:**

Hiện `activeSub` được tính:
```ts
const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (activeSubName ?? subKeys[0] ?? null);
```
Đổi thành: mặc định theo **page đang active** nếu có, còn không thì `null` (không tự mở sub đầu):
```ts
const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (activeSubName ?? null);
```
- `activeSubName` = sub chứa page đang active (đã có, giữ nguyên) → mở đúng nhóm đang xem.
- Không có page active trong group → `activeSub = null` → cấp 2 không hiện cho tới khi hover/click.

**2. Cấp 2 ngang hàng mục cha:**

- Bọc mỗi nút mục cha trong `<div className="relative">`.
- Cấp 2 render **bên trong chính mục cha đó** thay vì trong container menu cấp 1:
```jsx
<div key={key} className="relative">
    <button ...>...</button>
    {activeSub === key && subs[key].length > 0 && (
        <div className="absolute left-full top-0 ml-2 w-60 rounded-xl border ... shadow-xl animate-fade-in">
            {subs[key].map((item) => <Link ...>)}
        </div>
    )}
</div>
```
- `absolute left-full top-0` so với mục cha → bắt đầu ngang hàng đỉnh dòng mục cha, đúng yêu cầu.
- `ml-2` = khoảng cách 8px giữa cấp 1 và cấp 2.
- `rounded-xl` (12px) — bo góc đồng bộ.

**3. Panel bên cạnh, không đè:**
- `absolute left-full` → cấp 2 nằm bên phải mục cha, không che mục cha nào (menu cấp 1 hiển thị đủ).
- Render điều kiện `activeSub === key` → mỗi mục cha có đúng 1 cấp 2 (của chính nó), không dồn vào cuối menu.

**4. Hover/click giữ nguyên:**
- `onMouseEnter={() => setActiveSubGroup(key)}` + `onClick={() => setActiveSubGroup(key)}` trên nút mục cha (giữ).
- Cấp 2 KHÔNG có `onMouseEnter`/`onMouseLeave` riêng (fix từ plan trước giữ nguyên — để tránh reset/close timer).

---

## Error handling

- `activeSubGroup` không hợp lệ (sub đã xoá) → `activeSub = null` → cấp 2 không hiện (fallback an toàn).
- `subs[key]` rỗng → không render cấp 2 (guard `length > 0`).
- Group `__subs` rỗng → menu cấp 1 trống.
- Click ngoài/Escape → đóng cả 2 cấp (logic hiện tại).

---

## Testing

- `npm run types:check && npm run build` pass.
- Kiểm tra thủ công: mở Báo cáo → cấp 2 chưa hiện; hover "Hoạt động" → cấp 2 Hoạt động mở từ đỉnh dòng đó, bên phải, không che Doanh thu; hover "Doanh thu" → đổi; di chuột rời → đóng; group khác dropdown cũ.

---

## Không nằm trong phạm vi

- Đổi cấu trúc sidebar (vẫn header ngang).
- Thay đổi dữ liệu `pages`/`sub_group`.
- Group không `__subs` (không đổi).
