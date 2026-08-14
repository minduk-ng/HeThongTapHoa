# Sidebar Flyout — Cấp 2 Mở Theo Mục Cha, Ngang Hàng, Không Đè: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Điều chỉnh `Sidebar.tsx` để menu cấp 2 của group có `__subs` (Báo cáo) chỉ xuất hiện khi hover/click mục cha (sub_group), mở sang phải ngang hàng đỉnh mục cha, panel riêng không che mục cha nào.

**Architecture:** Chỉ sửa 1 file `resources/js/components/Sidebar.tsx`. Bỏ mặc định `activeSub = subKeys[0]` → cấp 2 không tự mở. Bọc mỗi nút mục cha trong `<div className="relative">` và render cấp 2 bên trong mục cha đó với `absolute left-full top-0 ml-2` → bắt đầu ngang hàng đỉnh mục cha đang hover. Giữ nguyên toàn bộ logic hover/click/close hiện có.

**Tech Stack:** React + TypeScript + Tailwind (Inertia.js app, Laravel backend).

## Global Constraints

- Chỉ sửa `resources/js/components/Sidebar.tsx` — không đụng file khác.
- Giữ nguyên group không `__subs` (dropdown phẳng cũ).
- Giữ nguyên `activeSubName` (sub chứa page đang active) làm fallback khi mở group.
- Không thêm dependency mới. Không thêm test JS (project không có setup Vitest/Jest cho component).
- Verify bắt buộc: `npm run types:check`, `npm run build`, `npx eslint resources/js/components/Sidebar.tsx`, `php artisan test`.
- Commit message tiếng Việt. Không dùng emoji/inline SVG trong JSX.

---

### Task 1: Cấp 2 chỉ mở khi hover/click mục cha + ngang hàng mục cha

**Files:**
- Modify: `resources/js/components/Sidebar.tsx:63` (handleMouseEnter)
- Modify: `resources/js/components/Sidebar.tsx:131` (activeSub)
- Modify: `resources/js/components/Sidebar.tsx:198-267` (cấp 1 + cấp 2)

**Interfaces:**
- Consumes: `navigation` (PageProps), `activeSubGroup` state, `subKeys`, `subs`, `activeSubName`, `currentUrl`, `setActiveSubGroup`, `setOpenGroup`, `setPinnedGroup`, `handleMouseEnter`, `handleMouseLeave` — tất cả đều đã có trong file, không thay đổi tên.
- Produces: `activeSub` (string | null) — `null` khi chưa hover mục cha nào và không có page active trong group.

- [ ] **Step 1: Đọc file hiện tại**

```bash
type resources/js/components/Sidebar.tsx
```

Xác định vị trí 3 khối cần sửa (dòng hiện tại: 63, 131, 198-267). Lưu ý số dòng có thể lệch sau mỗi edit — tìm theo nội dung, không theo số dòng cứng.

- [ ] **Step 2: Sửa `handleMouseEnter` — không tự mở sub đầu**

Trong `handleMouseEnter` (dòng ~63), đổi:
```ts
setActiveSubGroup(active ?? keys[0] ?? null);
```
thành:
```ts
setActiveSubGroup(active ?? null);
```
Giữ nguyên `active` (tìm sub chứa page đang active). Đảm bảo biến `keys` vẫn được dùng ở dòng `const keys = Object.keys(group.__subs);` — nếu không còn dùng ở đây, kiểm tra có dùng ở nơi khác không (không xoá biến nếu nghi ngờ).

- [ ] **Step 3: Sửa `activeSub` — không tự mặc định sub đầu**

Tại dòng ~131, đổi:
```ts
const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (activeSubName ?? subKeys[0] ?? null);
```
thành:
```ts
const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (activeSubName ?? null);
```

- [ ] **Step 4: Bọc mục cha trong `relative` và render cấp 2 bên trong mục cha**

Thay khối cấp 1 (dòng ~198-214) và khối cấp 2 nằm sau menu cấp 1 (dòng ~241-267).

CẤU TRÚC MỚI — khối flyout cấp 1 (thay cho `{subKeys.map(...)}` cũ):

```jsx
{subKeys.map((key) => {
    const isActiveSub = activeSub === key;

    return (
        <div key={key} className="relative">
            <button type="button"
                onMouseEnter={() => setActiveSubGroup(key)}
                onClick={() => setActiveSubGroup(key)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isActiveSub
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}>
                <span>{key}</span>
                <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {/* Cấp 2: chỉ khi activeSub === key — mở bên phải, ngang hàng đỉnh mục cha */}
            {activeSub === key && subs[key].length > 0 && (
                <div className="absolute left-full top-0 ml-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in">
                    <div className="space-y-0.5">
                        {subs[key].map((item) => {
                            const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));

                            return (
                                <Link key={item.route_path} href={item.route_path}
                                    onClick={() => {
                                        setOpenGroup(null);
                                        setPinnedGroup(null);
                                    }}
                                    className={`block rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'bg-sky-600 text-white font-semibold shadow-xs'
                                            : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                    }`}>
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
})}
```

XÓA khối cấp 2 cũ nằm sau menu cấp 1 (dòng ~241-267, block `{activeSub && subs[activeSub].length > 0 && (...)}`) — nó đã được chuyển vào từng mục cha ở trên.

GIỮ NGUYÊN:
- `<div className="space-y-0.5">` bọc toàn bộ cấp 1.
- Khối flat items của mixed group (dòng ~216-238) — nằm sau vòng `subKeys.map`, có divider.
- Container menu cấp 1 (dòng ~190-195): `absolute left-0 mt-1.5 w-48 rounded-xl ... onMouseEnter={() => handleMouseEnter(groupName)} onMouseLeave={handleMouseLeave}` — KHÔNG đổi.

- [ ] **Step 5: Verify TypeScript + build**

```bash
npm run types:check
npm run build
```
Expected: cả 2 pass, không lỗi.

- [ ] **Step 6: Verify ESLint**

```bash
npx eslint resources/js/components/Sidebar.tsx
```
Expected: 0 errors (không cần `--fix`, chỉ check).

- [ ] **Step 7: Verify PHP tests**

```bash
php artisan test
```
Expected: 355 tests pass.

- [ ] **Step 8: Kiểm tra thủ công (browser)**

```bash
npm run dev
```
Kiểm tra với tài khoản có quyền xem Báo cáo:
1. Hover "Báo cáo" → menu cấp 1 hiện (Doanh thu, Hoạt động), cấp 2 CHƯA hiện (nếu không ở page thuộc nhóm đó).
2. Hover "Hoạt động" → cấp 2 Hoạt động mở sang bên phải, bắt đầu ngang hàng đỉnh dòng Hoạt động, không che Doanh thu.
3. Di chuột sang "Doanh thu" → cấp 2 đổi thành Doanh thu.
4. Di chuột rời dropdown → đóng sau ~200ms.
5. Group không `__subs` (vd Quản lý) → dropdown phẳng cũ, không đổi.
6. Vào page thuộc "Hoạt động" rồi mở Báo cáo → cấp 2 Hoạt động tự mở (fallback activeSubName).

- [ ] **Step 9: Commit**

```bash
git add resources/js/components/Sidebar.tsx
git commit -m "feat: cap 2 sidebar flyout chi mo khi hover/click muc cha, ngang hang muc cha, khong de"
```

---

## Self-Review Notes

- **Spec coverage:** Cả 3 yêu cầu đều ở Task 1 — (1) bỏ `?? subKeys[0]` ở cả handleMouseEnter và activeSub → chỉ mở khi hover/click; (2) `relative` trên mục cha + `absolute left-full top-0` → ngang hàng đỉnh mục cha; (3) `left-full` panel riêng → không che mục cha. Không cần task riêng vì đây là thay đổi nhỏ trong 1 file.
- **Không placeholder:** mọi bước có code cụ thể hoặc lệnh chạy cụ thể.
- **Type consistency:** `activeSub: string | null`, `activeSubGroup`, `setActiveSubGroup`, `subs[key]: NavigationItem[]` — giữ nguyên tên đã tồn tại trong file.
- **Lưu ý line drift:** các số dòng trong plan là vị trí tại thời điểm viết; agent nên tìm theo nội dung.
