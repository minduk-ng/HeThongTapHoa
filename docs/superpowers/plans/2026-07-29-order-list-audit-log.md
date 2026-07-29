# Order List & Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an order management page with full audit trail logging for every order lifecycle action.

**Architecture:** Synchronous audit logging via `OrderActivityLogger` service within existing DB transactions. New `order_activities` table stores immutable timeline entries with JSON meta. Frontend: two Inertia pages (OrderList + OrderDetail) under `/manager/orders`.

**Tech Stack:** Laravel 12, MySQL 8, Inertia.js v2, React 19, TypeScript, Tailwind CSS 4, Lucide React

## Global Constraints

- Icons: Lucide React only, no emoji, no inline SVG. Sizes: `w-4 h-4 stroke-[1.5]` standard, `w-3.5 h-3.5` inline small
- Typography: `font-display` (Plus Jakarta Sans) for all headings/card titles; `tabular-nums` for numbers/dates/prices
- Colors: zinc (UI chrome), sky (accent), emerald (success), amber (warning), rose (danger)
- Copywriting: Smart quotes ("..."), em-dash (—) for empty values, no all-caps labels
- Async: Guard re-entry (`if (submitting) return`), 8s safety timeout, `onError: () => {}` for background reloads
- Frontend defense: `Array.isArray()` wrapper for all list props from backend
- Empty states: Asymmetric left-aligned layout with Lucide icon
- Permission naming: `orders.view` format, register in AuthorizationSeeder + RoleController
- Commit after each task with conventional commit message

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php` | Schema + data migration |
| Create | `app/Models/OrderActivity.php` | Eloquent model |
| Modify | `app/Models/Order.php` | Add `activities()` relation |
| Create | `app/Services/OrderActivityLogger.php` | Static logging service |
| Modify | `app/Http/Controllers/Staff/POSController.php` | Add logging to sendToKitchen, cancelOrder, checkout |
| Modify | `app/Http/Controllers/Staff/KitchenController.php` | Add logging to completeOrder, completeItems |
| Modify | `app/Http/Controllers/Staff/ServingController.php` | Add logging to markServed |
| Create | `app/Http/Controllers/Manager/OrderListController.php` | List + detail endpoints |
| Modify | `routes/web.php` | Add manager/orders routes |
| Modify | `database/seeders/AuthorizationSeeder.php` | Add `orders.view` permission |
| Modify | `app/Http/Controllers/Admin/RoleController.php` | Add `orders.view` to $systemPermissions |
| Create | `resources/js/pages/manager/orders/OrderList.tsx` | Order list page |
| Create | `resources/js/pages/manager/orders/OrderDetail.tsx` | Order detail + timeline page |
| Modify | `docs/PROJECT_CONTEXT_AND_ROUTING.md` | Update architecture docs |

---

### Task 1: Migration + Model

**Files:**
- Create: `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php`
- Create: `app/Models/OrderActivity.php`
- Modify: `app/Models/Order.php`

**Interfaces:**
- Produces: `OrderActivity` model with fillable `[order_id, action, user_id, meta, created_at]`, casts `meta → array`, `created_at → datetime`
- Produces: `Order::activities()` hasMany relation ordered by created_at

- [ ] **Step 1: Create migration file**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('action', 30);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['order_id', 'created_at'], 'idx_order_timeline');
            $table->index('action', 'idx_action');
        });

        // Migrate takeaway orders: table_id 15 → NULL
        DB::table('orders')->where('table_id', 15)->update(['table_id' => null]);

        // Remove "Mang đi" table record
        DB::table('tables')->where('id', 15)->delete();
    }

    public function down(): void
    {
        Schema::dropIfExists('order_activities');
    }
};
```

- [ ] **Step 2: Create OrderActivity model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderActivity extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'order_id',
        'action',
        'user_id',
        'meta',
        'created_at',
    ];

    protected $casts = [
        'meta' => 'array',
        'created_at' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 3: Add activities() relation to Order model**

In `app/Models/Order.php`, add after the `invoice()` method:

```php
public function activities()
{
    return $this->hasMany(OrderActivity::class)->orderBy('created_at');
}
```

- [ ] **Step 4: Run migration**

Run: `php artisan migrate`
Expected: "Migrated: 2026_07_29_000000_create_order_activities_and_migrate_takeaway"

- [ ] **Step 5: Verify migration**

Run: `php artisan tinker --execute="echo \App\Models\OrderActivity::count() . ' activities, Orders with null table: ' . \App\Models\Order::whereNull('table_id')->count();"`
Expected: `0 activities, Orders with null table: 107`

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php app/Models/OrderActivity.php app/Models/Order.php
git commit -m "feat(orders): add order_activities table, model, and takeaway migration"
```

---

### Task 2: OrderActivityLogger Service

**Files:**
- Create: `app/Services/OrderActivityLogger.php`

**Interfaces:**
- Consumes: `OrderActivity` model from Task 1
- Produces: `OrderActivityLogger::log(Order $order, string $action, ?int $userId, array $meta): void`

- [ ] **Step 1: Create service class**

```php
<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderActivity;

class OrderActivityLogger
{
    public static function log(Order $order, string $action, ?int $userId = null, array $meta = []): void
    {
        OrderActivity::create([
            'order_id' => $order->id,
            'action' => $action,
            'user_id' => $userId,
            'meta' => $meta ?: null,
        ]);
    }
}
```

- [ ] **Step 2: Verify autoload**

Run: `php artisan tinker --execute="echo class_exists(\App\Services\OrderActivityLogger::class) ? 'OK' : 'FAIL';"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/Services/OrderActivityLogger.php
git commit -m "feat(orders): add OrderActivityLogger service"
```

---

### Task 3: Integrate Logging — POSController

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`

**Interfaces:**
- Consumes: `OrderActivityLogger::log()` from Task 2

- [ ] **Step 1: Add import**

At top of POSController.php, add:

```php
use App\Services\OrderActivityLogger;
```

- [ ] **Step 2: Add logging to sendToKitchen — new order (created + sent_kitchen)**

Inside `sendToKitchen`, within the transaction, after the `foreach ($validated['items'] as $item)` loop that creates OrderItems (around line 241), and before `return $createdOrder`, add:

```php
// Audit log
$userId = $request->user()?->id;
$itemMeta = collect($validated['items'])->map(fn ($i) => [
    'name' => MenuItem::find($i['menu_item_id'])?->name ?? 'Món',
    'qty' => $i['quantity'],
    'price' => $i['unit_price'],
])->toArray();

if (empty($validated['order_id'])) {
    OrderActivityLogger::log($createdOrder, 'created', $userId, [
        'items' => $itemMeta,
        'total' => $validated['total'],
        'item_count' => count($validated['items']),
    ]);
    OrderActivityLogger::log($createdOrder, 'sent_kitchen', $userId, [
        'items' => collect($validated['items'])->map(fn ($i) => ['name' => MenuItem::find($i['menu_item_id'])?->name ?? 'Món', 'qty' => $i['quantity']])->toArray(),
        'is_additional' => false,
    ]);
} else {
    OrderActivityLogger::log($createdOrder, 'additional', $userId, [
        'items' => $itemMeta,
        'total_added' => $validated['total'],
    ]);
}
```

- [ ] **Step 3: Add logging to sendToKitchen — reduced_items (item_cancel)**

Inside the `foreach ($validated['reduced_items'] as $red)` loop, after the item update logic (after the `if ($parentOrder)` block), add:

```php
// Audit log for cancellation
$cancelItemName = $orderItem->menuItem?->name ?? 'Món';
OrderActivityLogger::log($orderItem->order ?? $parentOrder, 'item_cancel', $request->user()?->id, [
    'items' => [['name' => $cancelItemName, 'qty' => $reduceQty, 'reason' => $reasonStr]],
]);
```

Note: Need to load `$orderItem->menuItem` — add `->with('menuItem')` or access via `$orderItem->menuItem`.

- [ ] **Step 4: Add logging to cancelOrder**

Inside `cancelOrder`, within the transaction, after `$order->update(['status' => 'cancelled'])` (line 605), add inside the foreach loop:

```php
OrderActivityLogger::log($order, 'order_cancel', $request->user()?->id, [
    'reason' => $reasonStr,
    'total_lost' => (float) $order->total,
]);
```

- [ ] **Step 5: Add logging to checkout**

Inside `checkout`, within the transaction, after `Invoice::updateOrCreate(...)` (around line 326), add:

```php
OrderActivityLogger::log($order, 'paid', $request->user()?->id, [
    'invoice_code' => $invoiceCode,
    'total' => $totalAmount,
    'received' => (float) $validated['amount_received'],
    'change' => (float) $validated['change_amount'],
    'method' => $validated['payment_method'],
    'discount_amount' => 0,
    'discount_percent' => 0,
]);
```

- [ ] **Step 6: Fix validation + order_code for takeaway in sendToKitchen**

Change validation rule (line 113):

```php
// Before:
'table_id' => 'required|exists:tables,id',

// After:
'table_id' => 'nullable|exists:tables,id',
```

Replace the table lookup (line 142):

```php
// Before:
$table = Table::findOrFail($validated['table_id']);

// After:
$table = !empty($validated['table_id']) ? Table::findOrFail($validated['table_id']) : null;
```

Replace order_code prefix (around line 206):

```php
// Before:
$normalized = str_replace('-', '', strtoupper(Str::slug($table->table_number)));

// After:
$normalized = $table
    ? str_replace('-', '', strtoupper(Str::slug($table->table_number)))
    : 'MD';
```

Guard table status update (line 230):

```php
// Before:
$table->update(['status' => 'occupied']);

// After:
if ($table) {
    $table->update(['status' => 'occupied']);
}
```

- [ ] **Step 7: Verify no syntax errors**

Run: `php artisan route:list --path=staff/pos`
Expected: No errors, routes listed

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php
git commit -m "feat(orders): integrate audit logging into POSController + takeaway order_code"
```

---

### Task 4: Integrate Logging — KitchenController + ServingController

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php`
- Modify: `app/Http/Controllers/Staff/ServingController.php`

**Interfaces:**
- Consumes: `OrderActivityLogger::log()` from Task 2

- [ ] **Step 1: KitchenController — add import and logging to completeOrder**

Add import: `use App\Services\OrderActivityLogger;`

Inside `completeOrder`, within the transaction, after `$order->update(['status' => 'completed', ...])` (line 70-73), add:

```php
OrderActivityLogger::log($order, 'completed', $request->user()?->id);
```

- [ ] **Step 2: KitchenController — add logging to completeItems**

Inside `completeItems`, within the transaction, after the `if ($remainingActive === 0)` block that updates order status (around line 136-139), add:

```php
if ($remainingActive === 0) {
    $order->update([
        'status' => 'completed',
        'has_additional_items' => false,
    ]);
    OrderActivityLogger::log($order, 'completed', $request->user()?->id);
}
```

(Replace the existing block with this version that includes the log call.)

- [ ] **Step 3: ServingController — add import and logging to markServed**

Add import: `use App\Services\OrderActivityLogger;`

Inside `markServed`, after the `if ($count > 0)` block and before `return response()->json(...)`, add logging for each affected order:

```php
// Audit log
if ($count > 0) {
    $affectedOrders = Order::whereIn('id', $orderIds)->with('items.menuItem')->get();
    foreach ($affectedOrders as $affectedOrder) {
        $servedItemNames = $affectedOrder->items
            ->whereIn('id', $validated['item_ids'])
            ->map(fn ($i) => ['name' => $i->menuItem?->name ?? 'Món', 'qty' => $i->quantity])
            ->toArray();
        OrderActivityLogger::log($affectedOrder, 'served', $request->user()?->id, [
            'items' => $servedItemNames,
        ]);
    }
}
```

Place this inside the existing `if ($count > 0)` block, after the event dispatch.

- [ ] **Step 4: Verify no syntax errors**

Run: `php artisan route:list --path=staff`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Staff/ServingController.php
git commit -m "feat(orders): integrate audit logging into Kitchen and Serving controllers"
```

---

### Task 5: OrderListController + Routes + Permissions

**Files:**
- Create: `app/Http/Controllers/Manager/OrderListController.php`
- Modify: `routes/web.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`

**Interfaces:**
- Consumes: `Order::activities()` relation from Task 1
- Produces: `/manager/orders` → Inertia `manager/orders/OrderList` with props `{orders, stats, filters}`
- Produces: `/manager/orders/{order}` → Inertia `manager/orders/OrderDetail` with prop `{order}`

- [ ] **Step 1: Create OrderListController**

```php
<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Inertia\Inertia;

class OrderListController extends Controller
{
    public function index(Request $request)
    {
        $from = $request->input('from', now()->startOfDay()->toDateString());
        $to = $request->input('to', now()->endOfDay()->toDateString());

        $query = Order::with(['table', 'invoice'])
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->orderByDesc('created_at');

        $orders = $query->get()->toArray();

        $stats = [
            'total' => count($orders),
            'open' => count(array_filter($orders, fn ($o) => in_array($o['status'], ['pending', 'confirmed', 'processing', 'completed']))),
            'paid' => count(array_filter($orders, fn ($o) => $o['status'] === 'paid')),
            'cancelled' => count(array_filter($orders, fn ($o) => $o['status'] === 'cancelled')),
        ];

        return Inertia::render('manager/orders/OrderList', [
            'orders' => $orders,
            'stats' => $stats,
            'filters' => ['from' => $from, 'to' => $to],
        ]);
    }

    public function show(Order $order)
    {
        $order->load(['table', 'items.menuItem', 'invoice', 'activities.user']);

        return Inertia::render('manager/orders/OrderDetail', [
            'order' => $order,
        ]);
    }
}
```

- [ ] **Step 2: Add routes**

In `routes/web.php`, inside the `Route::prefix('manager')` group (after Tables Management block, before the closing `});`), add:

```php
// Orders Management
Route::get('/orders', [OrderListController::class, 'index'])->middleware('permission:orders.view');
Route::get('/orders/{order}', [OrderListController::class, 'show'])->middleware('permission:orders.view');
```

Add import at top: `use App\Http\Controllers\Manager\OrderListController;`

- [ ] **Step 3: Register permission in AuthorizationSeeder**

In `database/seeders/AuthorizationSeeder.php`, add `'orders.view'` to the `$permissions` array.

- [ ] **Step 4: Register permission in RoleController**

In `app/Http/Controllers/Admin/RoleController.php`, add `'orders.view'` to the `$systemPermissions` array.

- [ ] **Step 5: Run seeder to insert permission**

Run: `php artisan db:seed --class=AuthorizationSeeder`
Expected: Permission created

- [ ] **Step 6: Verify routes**

Run: `php artisan route:list --path=manager/orders`
Expected: 2 routes listed (GET /manager/orders, GET /manager/orders/{order})

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Manager/OrderListController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php
git commit -m "feat(orders): add OrderListController, routes, and permission registration"
```

---

### Task 6: OrderList Frontend Page

**Files:**
- Create: `resources/js/pages/manager/orders/OrderList.tsx`

**Interfaces:**
- Consumes: props `{orders, stats, filters}` from Task 5 controller
- Produces: Rendered page at `/manager/orders`

- [ ] **Step 1: Create OrderList.tsx**

Create `resources/js/pages/manager/orders/OrderList.tsx` with:
- DashboardLayout wrapper
- Summary cards (grid-cols-4): Tổng order (ClipboardList/sky), Đang mở (Clock/amber), Đã thanh toán (CheckCircle/emerald), Đã hủy (XCircle/rose)
- Filter bar: date from/to inputs (default from props.filters), type select (Tất cả/Tại bàn/Mang đi), search input for order code
- Table with columns: Mã đơn (w-[130px] font-mono text-xs text-sky-600), Vị trí (w-[90px]), Tổng tiền (w-[110px] right tabular-nums text-emerald-600), Trạng thái (w-[100px] center badge), Thanh toán (w-[90px] center badge), HTTT (w-[110px] text-xs), Ngày tạo (w-[120px] text-xs tabular-nums), Ngày đóng (w-[120px] text-xs tabular-nums), Xem (w-[50px] Eye icon)
- Footer: compact toggle + page size (20/50/100) + pagination (same pattern as ProductTable)
- `Array.isArray()` defense on orders prop
- All filtering/pagination client-side
- Date filter changes → `router.get('/manager/orders', {from, to})` server reload
- Type filter: `table_id === null` → "Mang đi", else table.table_number
- Status badge: pending/confirmed/processing/completed → "Đang mở" (sky), paid → "Đã đóng" (emerald), cancelled → "Đã hủy" (rose)
- Payment badge: has invoice → "Đã TT" (emerald), else → "Chưa TT" (amber)
- HTTT: invoice?.payment_method === 'cash' → "Tiền mặt", 'bank_transfer' → "Chuyển khoản", else "—"
- Ngày đóng: invoice?.issued_at formatted or "—"
- Xem button: `router.get(`/manager/orders/${order.id}`)` with Eye icon
- Empty state: asymmetric left-aligned with ClipboardList icon

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/orders/OrderList.tsx
git commit -m "feat(orders): add OrderList frontend page with table, filters, summary cards"
```

---

### Task 7: OrderDetail Frontend Page

**Files:**
- Create: `resources/js/pages/manager/orders/OrderDetail.tsx`

**Interfaces:**
- Consumes: prop `{order}` (with loaded table, items.menuItem, invoice, activities.user) from Task 5

- [ ] **Step 1: Create OrderDetail.tsx**

Create `resources/js/pages/manager/orders/OrderDetail.tsx` with:
- DashboardLayout wrapper
- Header: "← Quay lại" button (`router.get('/manager/orders')`) + order_code as `font-display text-xl font-bold`
- Tabs: "Chi tiết" | "Lịch sử" (useState activeTab)
- **Tab Chi tiết:**
  - Section "Thông tin chung": grid 2 cols — mã đơn, vị trí (table?.table_number ?? "Mang đi"), trạng thái badge, ngày tạo, ngày đóng, nhân viên (order.employee_id — display "—")
  - Section "Danh sách món": table with columns Món, SL, Đơn giá, Thành tiền, Trạng thái. Item status: pending → "Chờ" (amber), completed → "Hoàn thành" (emerald), cancelled → "Đã hủy" (rose). If served_at → append "· Đã phục vụ". Footer row: Tổng cộng
  - Section "Thanh toán" (only if invoice exists): mã HĐ, hình thức, tổng, khách trả, tiền thừa, thời điểm
- **Tab Lịch sử:**
  - Vertical timeline: `border-l-2 border-zinc-200 dark:border-zinc-800 ml-3 pl-6 space-y-6`
  - Each activity: dot (`absolute -left-[7px] h-2.5 w-2.5 rounded-full` — emerald normally, rose for item_cancel/order_cancel)
  - Title row: action label (font-semibold) + timestamp right-aligned (text-xs text-zinc-400 tabular-nums)
  - User: text-xs text-zinc-500 (activity.user?.email ?? "Hệ thống")
  - Meta details: render key-value pairs from meta JSON based on action type
  - ACTION_LABELS map for Vietnamese labels
  - Empty state if no activities: "Chưa có lịch sử hoạt động" with Clock icon, asymmetric left-aligned
- `Array.isArray()` defense on order.items and order.activities
- All numbers use `tabular-nums`, prices formatted with `toLocaleString('vi-VN') + ' đ'`
- Dates formatted `dd/MM/yyyy HH:mm`

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/orders/OrderDetail.tsx
git commit -m "feat(orders): add OrderDetail page with Chi tiết and Lịch sử timeline tabs"
```

---

### Task 8: Documentation + Final Verification

**Files:**
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md`

- [ ] **Step 1: Update PROJECT_CONTEXT_AND_ROUTING.md**

Add to the routing/architecture doc:
- New route group: `/manager/orders` (GET index, GET show)
- New controller: `OrderListController`
- New model: `OrderActivity`
- New service: `OrderActivityLogger`
- New pages: `manager/orders/OrderList`, `manager/orders/OrderDetail`
- Note: takeaway orders use `table_id = NULL`, order_code prefix `MD`

- [ ] **Step 2: Full type check + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: Both pass

- [ ] **Step 3: Run PHPStan (if configured)**

Run: `./vendor/bin/phpstan analyse --memory-limit=512M`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "docs: update architecture with Order List and Audit Log feature"
```
