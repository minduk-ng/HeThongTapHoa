# Dashboard làm trang chủ + Báo cáo 2 cấp (sub-group + mega-menu) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển dashboard manager thành trang chủ tại `/`, và gom nhóm Báo cáo thành 2 cấp (sub-group "Doanh thu"/"Hoạt động") hiển thị qua mega-menu 2 cột trong Sidebar.

**Architecture:** Route `/` trỏ `DashboardController::index`, `/dashboard` redirect 301. Bảng `pages` thêm cột `sub_group`; `HandleInertiaRequests::share` build navigation 2 tầng (`__subs` khi có sub_group, flat khi không). Sidebar: group có `__subs` → mega-menu 2 cột (trái sub_group + mũi tên, phải items); group không `__subs` → dropdown phẳng cũ. Seeder cập nhật dữ liệu.

**Tech Stack:** Laravel 12, Inertia + React 19 + TypeScript, Pest, Tailwind, lucide-react.

## Global Constraints

- `day`/giờ: không áp dụng (nav không liên quan thời gian).
- Navigation shape: group có sub_group → `{ '__subs': { 'Doanh thu': [items], 'Hoạt động': [items] } }`; không sub_group → flat `[items]`.
- `sub_group` nullable string(50); 8 báo cáo: Doanh thu = sales-invoices, invoice-items, product-details, payments, profit; Hoạt động = cancelled, reservations, shifts.
- Route `/dashboard` redirect 301 → `/`.
- Seeder xoá page `Trang chủ` route `/`, đổi page `Tổng quan` route_path → `/`.
- Cache `user_inertia` TTL 7200s — sau khi sửa data pages, flush cache để nav cập nhật.
- Sidebar: group flat → giữ hành vi cũ; group `__subs` → mega-menu 2 cột.
- Spec: `docs/superpowers/specs/2026-08-13-dashboard-home-and-report-groups-design.md`

---

### Task 1: Migration + Page model + PageController + Seeder (sub_group + route path)

**Files:**
- Create: `database/migrations/2026_08_13_000001_add_sub_group_to_pages.php`
- Modify: `app/Models/Page.php` (fillable + @property)
- Modify: `app/Http/Controllers/Admin/PageController.php` (store/update rules + create/update)
- Modify: `database/seeders/AuthorizationSeeder.php` (xoá Trang chủ, đổi Tổng quan → `/`, thêm sub_group 8 báo cáo)
- Test: `tests/Feature/PageControllerTest.php` (nếu có) hoặc `tests/Feature/Admin/PageControllerTest.php`

**Interfaces:**
- Produces: cột `sub_group` trên `pages`; `Page::sub_group` fillable.
- Produces: request field `sub_group` trên POST/PUT `/admin/pages`.

- [ ] **Step 1: Viết migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $table->string('sub_group', 50)->nullable()->after('group_name');
        });
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $table->dropColumn('sub_group');
        });
    }
};
```

- [ ] **Step 2: Cập nhật Page model**

`$fillable` thêm `'sub_group'`. DocBlock `@property string|null $sub_group`.

- [ ] **Step 3: Cập nhật PageController store/update**

Xem `app/Http/Controllers/Admin/PageController.php` — `store` (dòng ~51-68) và `update` (~71-89). Trong cả 2, thêm vào validate: `'sub_group' => ['nullable', 'string', 'max:50'],` và vào create/update: `'sub_group' => $validated['sub_group'] ?? null,`.

- [ ] **Step 4: Cập nhật Seeder**

Trong `database/seeders/AuthorizationSeeder.php`:
- **Xoá** entry `['name' => 'Trang chủ', 'route_path' => '/', 'group_name' => 'Tổng quan', 'sort_order' => 1]`.
- **Đổi** entry `['name' => 'Tổng quan', 'route_path' => '/manager/dashboard', ...]` thành `'route_path' => '/'`.
- **Thêm** `'sub_group' => 'Doanh thu'` vào 5 báo cáo (sales-invoices, invoice-items, product-details, payments, profit) và `'sub_group' => 'Hoạt động'` vào 3 (cancelled, reservations, shifts).

- [ ] **Step 5: Viết failing test**

Tìm file test PageController hiện có (glob `tests/**/PageControllerTest.php`). Nếu chưa có, tạo `tests/Feature/Admin/PageControllerTest.php`:

```php
<?php

use App\Models\Page;
use App\Models\Role;

function adminPage(): \App\Models\User
{
    $u = \App\Models\User::factory()->create();
    $u->assignRole('admin');
    return $u;
}

test('admin tao page co sub_group', function () {
    $admin = adminPage();
    $this->actingAs($admin)->post('/admin/pages', [
        'name' => 'Bao cao test', 'route_path' => '/reports/xyz', 'group_name' => 'Báo cáo', 'sub_group' => 'Doanh thu',
    ])->assertSessionHasNoErrors();

    $page = Page::where('route_path', '/reports/xyz')->first();
    expect($page->sub_group)->toBe('Doanh thu');
});

test('admin sua page cap nhat sub_group', function () {
    $admin = adminPage();
    $page = Page::create(['name' => 'Old', 'route_path' => '/reports/old', 'group_name' => 'Báo cáo', 'sort_order' => 99]);

    $this->actingAs($admin)->put("/admin/pages/{$page->id}", [
        'name' => 'New', 'route_path' => '/reports/old', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động',
    ])->assertSessionHasNoErrors();

    expect($page->fresh()->sub_group)->toBe('Hoạt động');
});
```

Lưu ý: kiểm tra `tests/Pest.php` có helper tạo admin không (vd `posAdmin()`). Dùng helper có sẵn nếu có, không tự tạo mới nếu trùng.

- [ ] **Step 6: Chạy test xác nhận fail**

Run: `php artisan test --filter='PageControllerTest'`
Expected: FAIL — `sub_group` chưa được lưu.

- [ ] **Step 7: Chạy test xác nhận pass + full suite**

Run: `php artisan test --filter='PageControllerTest'`
Run: `php artisan test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add database/migrations/2026_08_13_000001_add_sub_group_to_pages.php app/Models/Page.php app/Http/Controllers/Admin/PageController.php database/seeders/AuthorizationSeeder.php tests/Feature/Admin/PageControllerTest.php
git commit -m "feat: pages them sub_group + dashboard route path / + seeder 2 nhom bao cao"
```

---

### Task 2: Route — dashboard làm trang chủ

**Files:**
- Modify: `routes/web.php`

**Interfaces:**
- Produces: `GET /` → `DashboardController::index` (middleware permission:dashboard.view); `GET /dashboard` → redirect 301 `/`.

- [ ] **Step 1: Sửa route**

Trong `routes/web.php`, thay `Route::inertia('/', 'welcome')->name('home')->middleware('auth');` (dòng ~40) bằng:

```php
Route::get('/', [DashboardController::class, 'index'])->name('home')->middleware('permission:dashboard.view');
Route::get('/dashboard', function () {
    return redirect('/', 301);
})->name('dashboard.legacy')->middleware('permission:dashboard.view');
```

DashboardController đã import (dòng 13). Bỏ import `Inertia` nếu không còn dùng ở đó — KHÔNG, `Inertia` vẫn dùng ở chỗ khác trong file (các route Inertia::render khác). Giữ nguyên.

- [ ] **Step 2: Kiểm tra route không xung đột**

Run: `php artisan route:list --path=/`
Expected: chỉ còn `GET|HEAD /` → DashboardController@index (welcome đã bỏ).

- [ ] **Step 3: Chạy test**

Không có test route cụ thể — chạy full suite để đảm bảo không phá:
Run: `php artisan test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add routes/web.php
git commit -m "feat: dashboard lam trang chủ tai /, /dashboard redirect 301"
```

---

### Task 3: HandleInertiaRequests — navigation 2 tầng (__subs)

**Files:**
- Modify: `app/Http/Middleware/HandleInertiaRequests.php`
- Test: `tests/Feature/NavigationTest.php` (tạo mới)

**Interfaces:**
- Produces: `navigation[group]` = `['__subs' => ['Doanh thu' => [items], 'Hoạt động' => [items]]]` khi group có sub_group; flat `[items]` khi không.

- [ ] **Step 1: Viết failing test**

Tạo `tests/Feature/NavigationTest.php`:

```php
<?php

test('navigation bao cao chia __subs theo sub_group, group khac flat', function () {
    // Dùng admin (isAdmin → tất cả pages)
    $admin = posAdmin();

    $res = $this->actingAs($admin)->get('/')->assertOk();
    // Render qua Inertia — kiểm tra props navigation
    $props = $res->viewData('page')['props'] ?? [];
    $nav = $props['navigation'] ?? [];

    expect(isset($nav['Báo cáo']))->toBeTrue();
    $reports = $nav['Báo cáo'];
    // Báo cáo phải là object có __subs
    expect(isset($reports['__subs']))->toBeTrue();
    expect(array_keys($reports['__subs']))->toContain('Doanh thu');
    expect(array_keys($reports['__subs']))->toContain('Hoạt động');
    expect(count($reports['__subs']['Doanh thu']))->toBe(5);
    expect(count($reports['__subs']['Hoạt động']))->toBe(3);

    // Group không sub_group (vd Quản lý) flat array
    expect(isset($nav['Quản lý']))->toBeTrue();
    expect(is_array($nav['Quản lý']))->toBeTrue();
    expect(array_key_exists('__subs', $nav['Quản lý']))->toBeFalse();
});
```

Lưu ý: kiểm tra cách test Inertia props — có thể dùng `assertInertia` helper từ `Inertia\Testing\AssertableInertia`. Xem các test hiện có (vd `PromotionControllerTest` dùng `assertInertia(fn ($page) => $page->component(...).where(...))`). Dùng pattern đó:
```php
$this->actingAs($admin)->get('/')->assertInertia(fn ($page) => $page
    ->component('manager/dashboard/DashboardManager')
    ->has('navigation.Báo cáo.__subs.Doanh thu', 5)
    ->has('navigation.Báo cáo.__subs.Hoạt động', 3));
```
Nếu `assertInertia` không available, fallback `viewData`.

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='NavigationTest'`
Expected: FAIL — navigation Báo cáo flat (chưa có __subs).

- [ ] **Step 3: Cập nhật `HandleInertiaRequests::share`**

Trong block build navigation (cả 2 nhánh cache + fallback), thay vòng `foreach ($pages as $page)`:

```php
                        $pages = Page::orderBy('sort_order')->get();
                        foreach ($pages as $page) {
                            if ($page->route_path === '/' || in_array($page->id, $allowedPageIds)) {
                                $item = [
                                    'id' => $page->id,
                                    'name' => $page->name,
                                    'route_path' => $page->route_path,
                                ];
                                if ($page->sub_group) {
                                    $navigation[$page->group_name]['__subs'][$page->sub_group][] = $item;
                                } else {
                                    $navigation[$page->group_name][] = $item;
                                }
                            }
                        }
```

Áp dụng cho **cả 2 nhánh** (block `try` dòng ~62-74 và block fallback `catch` dòng ~103-115). Lưu ý: nếu group chỉ toàn sub_group pages, `$navigation[$group]['__subs']` tự tạo; nếu có cả flat + sub trong cùng group → cả 2 key tồn tại. Sidebar (Task 4) sẽ xử lý ưu tiên `__subs`.

- [ ] **Step 4: Flush cache user_inertia**

Chạy:
```bash
php artisan tinker --execute="Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();"
```
hoặc tạo `php artisan cache:clear` — **quan trọng** vì TTL 7200s, nếu không flush test/UI vẫn dùng cache cũ. Trong test env cache là `array` nên tự refresh.

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `php artisan test --filter='NavigationTest'`
Expected: PASS.

- [ ] **Step 6: Chạy full suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Middleware/HandleInertiaRequests.php tests/Feature/NavigationTest.php
git commit -m "feat: navigation 2 tang __subs theo sub_group"
```

---

### Task 4: Sidebar — mega-menu 2 cột cho group có __subs

**Files:**
- Modify: `resources/js/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `navigation[group]` = `{ '__subs': {...} }` hoặc flat array (Task 3).
- Produces: mega-menu 2 cột cho group có `__subs`; dropdown phẳng cho group flat.

- [ ] **Step 1: Thêm state + logic phân nhánh**

Trong `Sidebar.tsx`, thêm state `activeSubGroup` (string|null). Khi group có `__subs`, mặc định `activeSubGroup = Object.keys(subGroups)[0]` khi mở.

Thêm type cho item/nav:
```ts
interface NavItem { id: number; name: string; route_path: string; }
type NavGroup = NavItem[] | { __subs: Record<string, NavItem[]> };
```

Trong render `Object.entries(navigation).map(([groupName, groupValue]) => ...)`:
```ts
const hasSubs = !Array.isArray(groupValue) && groupValue.__subs !== undefined;
const subs = hasSubs ? (groupValue as { __subs: Record<string, NavItem[]> }).__subs : null;
const subKeys = subs ? Object.keys(subs) : [];
const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (subKeys[0] ?? null);
```

`hasActiveChild` mở rộng:
```ts
const hasActiveChild = hasSubs
    ? Object.values(subs).flat().some(item =>
        currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path)))
    : (groupValue as NavItem[]).some(item =>
        currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path)));
```

- [ ] **Step 2: Render mega-menu**

Thay phần dropdown `{isOpen && (...)}` bằng 2 nhánh:

**Nhánh A — flat (không đổi):**
```jsx
{isOpen && !hasSubs && (
    <div className="absolute left-0 mt-1.5 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in">
        <div className="space-y-1">
            {(groupValue as NavItem[]).map((item) => { /* giữ nguyên */ })}
        </div>
    </div>
)}
```

**Nhánh B — mega-menu 2 cột:**
```jsx
{isOpen && hasSubs && (
    <div className="absolute left-0 mt-1.5 flex rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in">
        {/* Cột trái: sub_group */}
        <div className="w-40 shrink-0 space-y-0.5">
            {subKeys.map((key) => {
                const isActiveSub = activeSub === key;
                const subActive = subs[key].some(item =>
                    currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path)));
                return (
                    <button key={key} type="button"
                        onMouseEnter={() => setActiveSubGroup(key)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                            isActiveSub
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                        }`}>
                        <span>{key}</span>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                );
            })}
        </div>
        {/* Cột phải: items của activeSub */}
        <div className="w-60 space-y-0.5 border-l border-slate-200 pl-1 dark:border-slate-700">
            {activeSub && subs[activeSub].map((item) => {
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
```

- [ ] **Step 3: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 4: Kiểm tra thủ công**

Vào app → hover "Báo cáo" thấy 2 cột (trái Doanh thu/Hoạt động, phải items của sub active). Hover chuyển sub_group. Nhóm khác (Quản lý, Kho, Nhân viên) vẫn dropdown phẳng. Vào `/` thấy dashboard.

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/Sidebar.tsx
git commit -m "feat: sidebar mega-menu 2 cot cho group co sub_group"
```

---

### Task 5: PagesManager — hiển thị + chỉnh sub_group

**Files:**
- Modify: `resources/js/pages/admin/PagesManager.tsx`

**Interfaces:**
- Consumes: `sub_group` field trong Page (Task 1 backend).
- Produces: form tạo/sửa page có ô `sub_group`; bảng hiển thị `sub_group`.

- [ ] **Step 1: Thêm sub_group vào form**

Trong `PagesManager.tsx`:
- `useForm({ name, route_path, group_name })` → thêm `sub_group: ''`.
- `openEditModal` → `setData({ ..., sub_group: page.sub_group ?? '' })`.
- `openCreateModal` reset → thêm `sub_group: ''`.
- Thêm input trong modal form (sau group_name): ô text `sub_group` label "Nhóm con (sub-group)" placeholder "VD: Doanh thu" — dùng class giống input group_name hiện có.

- [ ] **Step 2: Hiển thị sub_group trong bảng**

Trong bảng page list, thêm cột/hiển thị `sub_group` (nhãn nhỏ dưới group_name hoặc cột riêng). Dùng class `text-xs text-zinc-500`.

- [ ] **Step 3: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/admin/PagesManager.tsx
git commit -m "feat: PagesManager hien thi + chinh sub_group"
```

---

### Task 6: Test toàn diện + cleanup

**Files:**
- Toàn bộ thay đổi.

- [ ] **Step 1: Chạy full test suite PHP**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 2: Type check + build**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: ESLint file sửa**

Run: `npx eslint resources/js/components/Sidebar.tsx resources/js/pages/admin/PagesManager.tsx`
Expected: không lỗi mới do thay đổi (bỏ qua style pre-existing).

- [ ] **Step 4: Flush cache user_inertia (production)**

Nếu env không phải test, chạy:
```bash
php artisan tinker --execute="Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();"
```

- [ ] **Step 5: Kiểm tra git status**

```bash
git status
```
Đảm bảo không file tạm, không thay đổi ngoài phạm vi. (File `probe_pages.php` tạm — xoá nếu còn.)
