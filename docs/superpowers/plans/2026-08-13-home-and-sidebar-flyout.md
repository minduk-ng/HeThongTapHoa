# Trang chủ nằm riêng + Sidebar flyout 2 cấp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách trang chủ `/` thành group "Trang chủ" đứng đầu sidebar, và đổi dropdown Báo cáo từ mega-menu 2 cột sang **flyout 2 cấp** (menu cấp 1 dọc chứa sub_group, hover mở menu cấp 2 bên phải ngang hàng dòng).

**Architecture:** Seeder đổi `group_name`/`sort_order` cho page route `/`. `Sidebar.tsx` thay block mega-menu 2 cột bằng: menu cấp 1 (dọc sub_group, ChevronRight), menu cấp 2 dùng `absolute left-full top-0 ml-2` (đẩy sang phải, ngang hàng, cách 8px), `rounded-xl`. Group không `__subs` giữ dropdown phẳng.

**Tech Stack:** Laravel 12, Inertia + React 19 + TypeScript, Pest, Tailwind, lucide-react.

## Global Constraints

- Page `/` → `group_name = 'Trang chủ'`, `sort_order = 1` (đứng đầu sidebar).
- Flyout cấp 2: `left-full top-0 ml-2` (khoảng cách 8px, ngang hàng dòng sub_group đầu), `rounded-xl` (12px bo góc).
- Group có `__subs` → flyout 2 cấp; group không `__subs` → dropdown phẳng cũ (không đổi).
- Mixed group (flat + `__subs`) → flat items hiển thị dưới cấp 1.
- `activeSubGroup` reset khi mở group (sub chứa page active, else sub đầu).
- Giữ: active highlight, đóng click ngoài/Escape, lucide-react, không emoji/alert.
- Spec: `docs/superpowers/specs/2026-08-13-home-and-sidebar-flyout-design.md`
- Branch: `feat/dashboard-home-report-groups` (tiếp nối plan trước)

---

### Task 1: Seeder — trang chủ thành group riêng

**Files:**
- Modify: `database/seeders/AuthorizationSeeder.php`
- Test: `tests/Feature/NavigationTest.php` (cập nhật assertion nếu cần)

**Interfaces:**
- Produces: page route `/` có `group_name = 'Trang chủ'`, `sort_order = 1`.

- [ ] **Step 1: Viết failing test (hoặc sửa assertion)**

Trong `tests/Feature/NavigationTest.php` — test hiện tại có thể assert group "Quản lý" chứa Tổng quan. Thêm/đổi để assert:

```php
test('trang chu nam trong group rieng Trang chu dau sidebar', function () {
    $admin = posAdmin();
    $this->actingAs($admin)->get('/')->assertInertia(fn ($page) => $page
        ->component('manager/dashboard/DashboardManager')
        ->has('navigation.Trang chủ', 1)
        ->where('navigation.Trang chủ.0.route_path', '/'));
});
```

Chạy trước khi sửa seeder → FAIL (navigation không có "Trang chủ").

- [ ] **Step 2: Cập nhật seeder**

Trong `AuthorizationSeeder.php`, entry page route `/` (đang `group_name => 'Tổng quan'` hoặc sau plan trước là 'Quản lý' + sort_order):
```php
[
    'name' => 'Tổng quan',
    'route_path' => '/',
    'group_name' => 'Trang chủ',
    'sort_order' => 1,
],
```
Lưu ý: `updateOrInsert` keyed theo `route_path` (kiểm tra cách seeder ghi — nếu dùng `DB::table('pages')->updateOrInsert(['route_path' => ...], [...])` thì chỉ cần sửa giá trị group_name/sort_order trong mảng).

- [ ] **Step 3: Áp dụng seeder cho DB hiện có**

Chạy để cập nhật bản ghi đã tồn tại (seeder `updateOrInsert` cập nhật đúng route_path):
```bash
php artisan db:seed --class=AuthorizationSeeder
```

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `php artisan test --filter='NavigationTest'`
Expected: PASS.

- [ ] **Step 5: Chạy full suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add database/seeders/AuthorizationSeeder.php tests/Feature/NavigationTest.php
git commit -m "feat: trang chu (/) tach thanh group rieng dau sidebar"
```

---

### Task 2: Sidebar — flyout 2 cấp thay mega-menu

**Files:**
- Modify: `resources/js/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `navigation[group]` = `{ '__subs': {...} }` (Task từ plan trước), `flatItems` logic hiện có.
- Produces: group có `__subs` → flyout 2 cấp (cấp 1 dọc sub_group, cấp 2 bên phải ngang hàng).

- [ ] **Step 1: Thay block mega-menu 2 cột**

Tìm block `{isOpen && subs && (` (dòng ~180-222) trong `Sidebar.tsx` — block hiện là mega-menu 2 cột dùng `flex`. Thay bằng flyout 2 cấp:

```jsx
{/* Flyout 2 cấp cho group có sub_group (file-tree style) */}
{isOpen && subs && (
    <div
        className="absolute left-0 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in"
        onMouseEnter={() => handleMouseEnter(groupName)}
        onMouseLeave={handleMouseLeave}
    >
        <div className="space-y-0.5">
            {/* Cấp 1: danh sách sub_group */}
            {subKeys.map((key) => {
                const isActiveSub = activeSub === key;
                return (
                    <button key={key} type="button"
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
                );
            })}
            {/* Flat items của mixed group */}
            {flatItems.length > 0 && (
                <>
                    <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                    {flatItems.map((item) => {
                        const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));
                        return (
                            <Link key={item.route_path} href={item.route_path}
                                onClick={() => { setOpenGroup(null); setPinnedGroup(null); }}
                                className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'bg-sky-600 text-white font-semibold shadow-xs'
                                        : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                }`}>
                                {item.name}
                            </Link>
                        );
                    })}
                </>
            )}
        </div>

        {/* Cấp 2: items của activeSubGroup — đẩy sang phải, ngang hàng dòng đầu, cách 8px */}
        {activeSub && subs[activeSub].length > 0 && (
            <div
                className="absolute left-full top-0 ml-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in"
                onMouseEnter={() => handleMouseEnter(groupName)}
                onMouseLeave={handleMouseLeave}
            >
                <div className="space-y-0.5">
                    {subs[activeSub].map((item) => {
                        const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));
                        return (
                            <Link key={item.route_path} href={item.route_path}
                                onClick={() => { setOpenGroup(null); setPinnedGroup(null); }}
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
)}
```

Giải thích vị trí:
- `absolute left-full top-0 ml-2` — cấp 2 đẩy hẳn sang phải cạnh cấp 1 (`left-full`), bắt đầu ngang hàng dòng đầu tiên (`top-0` — dòng "Doanh thu" nếu là sub đầu), cách 8px (`ml-2`).
- `rounded-xl` (12px) — bo góc đồng bộ với card/drawer.
- Cả 2 cấp nằm trong `relative` của nút nhóm → không đè nhóm khác (vùng dropdown đã mở, các nhóm khác nằm dưới nó trên trang).

- [ ] **Step 2: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: Kiểm tra thủ công**

Hover "Báo cáo" → thấy cấp 1 (Doanh thu, Hoạt động); hover "Doanh thu" → cấp 2 items bên phải ngang hàng, cách 8px, bo góc 12px. Group khác (Quản lý, Kho...) dropdown phẳng cũ. Trang chủ đứng đầu.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/Sidebar.tsx
git commit -m "feat: sidebar flyout 2 cap thay mega-menu (cap 2 ben phai ngang hang, 8px, rounded-xl)"
```

---

### Task 3: Test toàn diện + cleanup

**Files:**
- Toàn bộ thay đổi.

- [ ] **Step 1: Chạy full test suite PHP**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 2: Type check + build**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: ESLint Sidebar**

Run: `npx eslint resources/js/components/Sidebar.tsx`
Expected: không lỗi mới do thay đổi (bỏ qua style pre-existing).

- [ ] **Step 4: Flush cache user_inertia (nếu env không phải test)**

```bash
php artisan tinker --execute="Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();"
```

- [ ] **Step 5: Kiểm tra git status**

```bash
git status
```
Đảm bảo không file tạm, không thay đổi ngoài phạm vi.
