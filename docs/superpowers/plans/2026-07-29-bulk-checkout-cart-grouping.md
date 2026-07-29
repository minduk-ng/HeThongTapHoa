# Bulk Checkout & Cart Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable bulk checkout (all orders on a table → 1 invoice), refactor invoice model to 1:many, and group POS cart items by order with compact layout.

**Architecture:** Migration moves `order_id` FK from invoices to orders as `invoice_id`. New `bulkCheckout` endpoint creates one invoice for multiple orders. Frontend groups cart items by `orderCode` and replaces the payment button with a split button + drop-up.

**Tech Stack:** Laravel 12, Inertia.js v2, React 19, TypeScript, Tailwind CSS 4

## Global Constraints

- Lucide icons only, `tabular-nums` for numbers, `font-display` for headings
- Color tokens: zinc/sky/emerald/amber/rose
- `Array.isArray()` defense for all array props
- Em-dash `—` for empty values
- Vietnamese UI labels
- PowerShell: use `;` not `&&`

---

### Task 1: Migration + Model Updates

**Files:**
- Create: `database/migrations/2026_07_29_100000_refactor_invoices_to_support_bulk_checkout.php`
- Modify: `app/Models/Invoice.php`
- Modify: `app/Models/Order.php`

**Interfaces:**
- Produces: `Order.invoice_id` (nullable FK), `Invoice::orders()` hasMany, `Order::invoice()` belongsTo

- [ ] **Step 1: Create migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add invoice_id to orders
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('invoice_id')->nullable()->after('status');
            $table->index('invoice_id', 'orders_invoice_id_index');
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });

        // 2. Migrate data: copy invoices.order_id → orders.invoice_id
        $invoices = DB::table('invoices')->whereNotNull('order_id')->get(['id', 'order_id']);
        foreach ($invoices as $invoice) {
            DB::table('orders')->where('id', $invoice->order_id)->update(['invoice_id' => $invoice->id]);
        }

        // 3. Drop order_id from invoices
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['order_id']);
            $table->dropUnique(['order_id']);
            $table->dropColumn('order_id');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->unsignedBigInteger('order_id')->nullable()->unique();
        });

        $orders = DB::table('orders')->whereNotNull('invoice_id')->get(['id', 'invoice_id']);
        foreach ($orders as $order) {
            DB::table('invoices')->where('id', $order->invoice_id)->update(['order_id' => $order->id]);
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropIndex('orders_invoice_id_index');
            $table->dropColumn('invoice_id');
        });
    }
};
```

- [ ] **Step 2: Update Invoice model**

Replace `app/Models/Invoice.php`:
- Remove `'order_id'` from `$fillable`
- Remove `order()` belongsTo method
- Add `orders()` hasMany:

```php
public function orders()
{
    return $this->hasMany(Order::class, 'invoice_id');
}
```

- [ ] **Step 3: Update Order model**

In `app/Models/Order.php`:
- Add `'invoice_id'` to `$fillable`
- Change `invoice()` method:

```php
public function invoice()
{
    return $this->belongsTo(Invoice::class, 'invoice_id');
}
```

- [ ] **Step 4: Run migration and verify**

Run: `php artisan migrate`
Expected: Migration runs successfully.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_07_29_100000_refactor_invoices_to_support_bulk_checkout.php app/Models/Invoice.php app/Models/Order.php
git commit -m "feat(checkout): refactor invoice model to 1:many with orders"
```

---

### Task 2: Update Existing Single Checkout + Add Bulk Checkout Endpoint

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`
- Modify: `routes/web.php`

**Interfaces:**
- Consumes: `Order.invoice_id`, `Invoice::orders()`
- Produces: `POST /staff/pos/bulk-checkout` endpoint, updated `checkout()` using new FK

- [ ] **Step 1: Update existing `checkout()` method**

In `POSController::checkout()`, replace the `Invoice::updateOrCreate` block (around line 389-402):

```php
// OLD:
// Invoice::updateOrCreate(
//     ['order_id' => $order->id],
//     [...]
// );

// NEW:
$invoice = Invoice::create([
    'invoice_code' => $invoiceCode,
    'table_name' => $tableNameStr,
    'total_amount' => $totalAmount,
    'payment_method' => $validated['payment_method'],
    'amount_received' => $validated['amount_received'],
    'change_amount' => $validated['change_amount'],
    'issued_at' => now(),
]);

$order->update(['invoice_id' => $invoice->id]);
```

Note: The `$order->update(['status' => 'paid'])` line already exists earlier — merge `invoice_id` into that update or keep separate.

- [ ] **Step 2: Add `bulkCheckout()` method**

Add after `checkout()` in POSController:

```php
public function bulkCheckout(Request $request)
{
    $validated = $request->validate([
        'order_ids' => 'required|array|min:1',
        'order_ids.*' => 'exists:orders,id',
        'table_id' => 'nullable|exists:tables,id',
        'payment_method' => 'required|in:cash,transfer',
        'amount_received' => 'required|numeric|min:0',
        'change_amount' => 'required|numeric|min:0',
        'idempotency_key' => 'nullable|string|max:100',
    ]);

    if ($request->filled('idempotency_key')) {
        $lockKey = "idempotency:bulk_checkout:{$request->input('idempotency_key')}";
        if (!Cache::add($lockKey, true, 30)) {
            return $request->wantsJson()
                ? response()->json(['success' => true, 'message' => 'Thanh toán đã được ghi nhận!'])
                : back()->with('success', 'Thanh toán đã được ghi nhận!');
        }
    }

    try {
        $invoice = null;
        $totalAmount = 0;
        $orders = collect();

        $targetTable = DB::transaction(function () use ($validated, $request, &$invoice, &$totalAmount, &$orders) {
            $orders = Order::with('items')->whereIn('id', $validated['order_ids'])->lockForUpdate()->get();

            if ($orders->count() !== count($validated['order_ids'])) {
                throw new \Exception('Một số đơn hàng không tồn tại.');
            }

            $invalidOrder = $orders->first(fn ($o) => in_array($o->status, ['paid', 'cancelled']));
            if ($invalidOrder) {
                throw new \Exception("Đơn {$invalidOrder->order_code} đã được thanh toán hoặc đã hủy.");
            }

            // Kitchen lock check
            $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
            if (!$canBypass) {
                foreach ($orders as $order) {
                    $hasUncompleted = $order->items->contains(fn ($item) => in_array($item->status, ['pending', 'processing']));
                    if ($hasUncompleted) {
                        throw new \Exception("Đơn {$order->order_code} còn món chưa được Bếp hoàn tất.");
                    }
                }
            }

            // Compute total
            $totalAmount = $orders->sum(fn ($order) => $order->items->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_price));

            // Determine table name
            $tableId = $validated['table_id'] ?? $orders->first()?->table_id;
            $targetTable = $tableId ? Table::find($tableId) : null;

            if ($targetTable) {
                $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                $tableNameStr = $subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number;
            } else {
                $primaryId = null;
                $allGroupTables = collect();
                $tableNameStr = 'Mang đi';
            }

            // Create single invoice
            $invoiceCode = 'INV-' . date('Ymd') . strtoupper(Str::random(4));
            $invoice = Invoice::create([
                'invoice_code' => $invoiceCode,
                'table_name' => $tableNameStr,
                'total_amount' => $totalAmount,
                'payment_method' => $validated['payment_method'],
                'amount_received' => $validated['amount_received'],
                'change_amount' => $validated['change_amount'],
                'issued_at' => now(),
            ]);

            // Mark all orders as paid + link invoice
            foreach ($orders as $order) {
                $orderTotal = $order->items->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_price);
                $order->update(['status' => 'paid', 'invoice_id' => $invoice->id]);

                OrderActivityLogger::log($order, 'checkout', $request->user()?->id, [
                    'invoice_code' => $invoiceCode,
                    'payment_method' => $validated['payment_method'],
                    'total' => $orderTotal,
                    'bulk' => true,
                ]);
            }

            // Release tables if no active orders remain
            $allGroupTableIds = $allGroupTables->pluck('id');
            if ($allGroupTableIds->isNotEmpty()) {
                $hasOtherActive = Order::whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->exists();

                if (!$hasOtherActive) {
                    foreach ($allGroupTables as $grpTable) {
                        $grpTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                    }
                }
            }

            return $targetTable;
        });

        $this->safeDispatch(function () use ($targetTable, $orders, $totalAmount) {
            if ($targetTable) {
                TableStatusUpdated::dispatch($targetTable, 'checkout', [
                    'order_code' => $orders->pluck('order_code')->implode(', '),
                    'total_amount' => $totalAmount,
                ]);
            }
        });
        $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'bulk_checkout']));

        if ($request->wantsJson()) {
            return response()->json(['success' => true, 'message' => 'Thanh toán gộp thành công!']);
        }
        return back()->with('success', 'Thanh toán gộp thành công!');
    } catch (\Throwable $e) {
        Log::error('POS bulk checkout error: ' . $e->getMessage());
        if ($request->wantsJson()) {
            return response()->json(['error' => 'Thanh toán thất bại: ' . $e->getMessage()], 422);
        }
        return back()->withErrors(['error' => 'Thanh toán thất bại: ' . $e->getMessage()]);
    }
}
```

- [ ] **Step 3: Add route**

In `routes/web.php`, after the existing checkout route (line 127):

```php
Route::post('/pos/bulk-checkout', [POSController::class, 'bulkCheckout'])->middleware('permission:pos.create');
```

- [ ] **Step 4: Verify routes**

Run: `php artisan route:list --path=bulk-checkout`
Expected: Shows `POST staff/pos/bulk-checkout`

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php routes/web.php
git commit -m "feat(checkout): add bulkCheckout endpoint + update single checkout for new FK"
```

---

### Task 3: Add `orderCode` to CartItem + Grouping Data

**Files:**
- Modify: `resources/js/pages/staff/pos/types/pos.types.ts`
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCart.ts`

**Interfaces:**
- Produces: `CartItem.orderCode?: string` field, populated from order's `order_code`

- [ ] **Step 1: Add `orderCode` to CartItem type**

In `pos.types.ts`, add to `CartItem` interface:

```typescript
orderCode?: string;
```

- [ ] **Step 2: Populate `orderCode` in usePOSCart**

In `usePOSCart.ts`, inside the `allOrders.forEach` block (line 62-87), add `orderCode: key` to each cart item push:

```typescript
tableInvoices[key].push({
    menu_item_id: item.menu_item_id,
    name: item.menu_item?.name || 'Món',
    quantity: item.quantity,
    initialQuantity: item.quantity,
    unit_price: Number(item.unit_price),
    vat_rate: Number(item.menu_item?.vat_rate || 0),
    note: item.note || '',
    isConfirmed: true,
    isKitchenCompleted: item.status === 'completed' || isOrderCompleted,
    isServed: !!item.served_at,
    orderItemId: item.id,
    orderCode: order.order_code || `order_${order.id}`,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/types/pos.types.ts resources/js/pages/staff/pos/hooks/usePOSCart.ts
git commit -m "feat(pos): add orderCode to CartItem for grouping"
```

---

### Task 4: POSCartPanel Item Grouping + Compact Layout

**Files:**
- Modify: `resources/js/pages/staff/pos/components/POSCartPanel.tsx`

**Interfaces:**
- Consumes: `CartItem.orderCode`
- Produces: Items grouped by order with bordered containers and labels

- [ ] **Step 1: Add grouping logic before render**

Inside `POSCartPanel`, before the cart items list section (around line 360), add grouping computation:

```typescript
// Group confirmed items by orderCode, keep drafts separate
const confirmedItems = cartItems.filter((i) => i.isConfirmed);
const draftItems = cartItems.filter((i) => !i.isConfirmed);

const orderGroups: { code: string; items: CartItem[] }[] = [];
const groupMap = new Map<string, CartItem[]>();
confirmedItems.forEach((item) => {
    const code = item.orderCode || 'unknown';
    if (!groupMap.has(code)) groupMap.set(code, []);
    groupMap.get(code)!.push(item);
});
groupMap.forEach((items, code) => orderGroups.push({ code, items }));
```

- [ ] **Step 2: Replace flat item list with grouped rendering**

Replace the `cartItems.map(...)` block (lines 379-553) with grouped rendering:

```tsx
{/* Order Groups */}
{orderGroups.map((group) => (
    <div key={group.code} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="bg-zinc-50/80 dark:bg-zinc-800/60 px-2.5 py-1">
            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 tabular-nums">
                {group.code}
            </span>
            {orderGroups.length > 1 && (
                <span className="ml-1.5 text-[10px] text-zinc-300 dark:text-zinc-600">
                    ({group.items.length} món)
                </span>
            )}
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {group.items.map((item) => {
                /* ... existing item row JSX with compact padding ... */
            })}
        </div>
    </div>
))}

{/* Draft items (not yet sent) */}
{draftItems.length > 0 && (
    <div className="space-y-2">
        {draftItems.map((item) => {
            /* ... existing item row JSX ... */
        })}
    </div>
)}
```

- [ ] **Step 3: Apply compact padding**

Change container: `p-4` → `p-3`, `space-y-3` → `space-y-2`
Change item row: `px-3 py-2.5` → `px-2.5 py-2`, `gap-3` → `gap-2`
Remove `rounded-xl` from individual item rows inside groups (use `rounded-none` or no border since group container handles it).

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/pos/components/POSCartPanel.tsx
git commit -m "feat(pos): group cart items by order with compact layout"
```

---

### Task 5: Bulk Checkout Hook + Split Button UI

**Files:**
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts`
- Modify: `resources/js/pages/staff/pos/components/POSCartPanel.tsx`

**Interfaces:**
- Consumes: `POST /staff/pos/bulk-checkout`, `CartItem.orderCode`
- Produces: `handleBulkCheckout()` function, split button with drop-up

- [ ] **Step 1: Add `handleBulkCheckout` to usePOSCheckout**

Add new function in `usePOSCheckout.ts`:

```typescript
const handleBulkCheckout = (
    selectedTable: POSTableData | null,
    allConfirmedOrders: { id: number; order_code?: string }[],
    paymentMethod: 'cash' | 'bank_transfer',
    amountReceived: number,
    changeAmount: number,
    onSuccess: () => void,
) => {
    if (!selectedTable || allConfirmedOrders.length === 0) return;

    const csrfToken = getCsrfTokenFromCookie();
    const idempotencyKey = `pos_bulk_${selectedTable.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    fetch('/staff/pos/bulk-checkout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-XSRF-TOKEN': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
            order_ids: allConfirmedOrders.map((o) => o.id),
            table_id: selectedTable.id === 0 ? null : selectedTable.id,
            payment_method: paymentMethod,
            amount_received: amountReceived,
            change_amount: changeAmount,
            idempotency_key: idempotencyKey,
        }),
    })
        .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.success) {
                onSuccess();
                router.reload({ only: ['tables'] });
            } else {
                alert(data.error || 'Thanh toán gộp thất bại!');
            }
        })
        .catch(() => {
            alert('Không thể kết nối đến máy chủ.');
        });
};
```

Export it from the hook's return object.

- [ ] **Step 2: Replace payment button with split button + drop-up**

In POSCartPanel footer (lines 602-666), replace the "Thanh toán" button with:

```tsx
{/* Split checkout button */}
<div className="relative flex">
    <button
        type="button"
        disabled={submitting || !hasConfirmedOrders || isPaymentBlocked || isCheckoutLocked}
        onClick={onOpenPayment}
        className={`flex flex-1 items-center justify-center space-x-1.5 rounded-l-xl px-3 py-2.5 text-xs font-semibold transition-colors duration-150 ${
            isCheckoutLocked
                ? 'cursor-not-allowed border border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                : isPaymentBlocked
                  ? 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
        }`}
    >
        {isCheckoutLocked ? <Lock className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
        <span>{isCheckoutLocked ? `Đang TT: ${checkoutLockedBy}` : `Thanh toán · ${totalAmount.toLocaleString('vi-VN')}đ`}</span>
    </button>
    <button
        type="button"
        onClick={() => setIsCheckoutDropUpOpen(!isCheckoutDropUpOpen)}
        disabled={isCheckoutLocked}
        className="rounded-r-xl border-l border-emerald-500/30 bg-emerald-600 px-2 py-2.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
    >
        <ChevronUp className="h-3.5 w-3.5" />
    </button>

    {/* Drop-up menu */}
    {isCheckoutDropUpOpen && (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setIsCheckoutDropUpOpen(false)} />
            <div className="absolute bottom-full right-0 z-50 mb-1 w-48 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                <button
                    type="button"
                    onClick={() => { setIsCheckoutDropUpOpen(false); onOpenSinglePayment(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Thanh toán riêng đơn này</span>
                </button>
            </div>
        </>
    )}
</div>
```

Add state: `const [isCheckoutDropUpOpen, setIsCheckoutDropUpOpen] = useState(false);`
Add import: `ChevronUp` from lucide-react.

- [ ] **Step 3: Wire up props**

Add new props to POSCartPanel:
- `onOpenSinglePayment: () => void` — triggers individual checkout (existing behavior)
- `hasConfirmedOrders: boolean` — whether there are confirmed orders to bulk-pay

Update `onOpenPayment` to mean "bulk checkout all".

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/pos/hooks/usePOSCheckout.ts resources/js/pages/staff/pos/components/POSCartPanel.tsx
git commit -m "feat(pos): add bulk checkout hook + split button with drop-up"
```

---

### Task 6: Wire Bulk Checkout in POSManager

**Files:**
- Modify: `resources/js/pages/staff/pos/POSManager.tsx`

**Interfaces:**
- Consumes: `handleBulkCheckout` from usePOSCheckout, `tableCarts` from usePOSCart
- Produces: Working end-to-end bulk checkout flow

- [ ] **Step 1: Update POSManager to pass bulk checkout handlers**

In POSManager, update the payment drawer open handler to collect ALL confirmed order IDs from `selectedTable.active_orders`:

```typescript
const handleOpenBulkPayment = () => {
    if (!selectedTable) return;
    const orders = selectedTable.active_orders || [];
    if (orders.length === 0) return;
    // Open payment drawer in "bulk" mode
    setIsPaymentDrawerOpen(true);
};

const handleOpenSinglePayment = () => {
    // Existing behavior: checkout only active invoice tab's order
    setIsPaymentDrawerOpen(true);
    // Set a flag to indicate single mode
};
```

- [ ] **Step 2: Update payment confirmation to use bulk or single**

When payment drawer confirms, check if mode is bulk:
- Bulk: call `handleBulkCheckout(selectedTable, allOrders, ...)`
- Single: call existing `handleConfirmPayment(...)`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/POSManager.tsx
git commit -m "feat(pos): wire bulk checkout flow in POSManager"
```

---

### Task 7: OrderDetail Multi-Order Invoice Link

**Files:**
- Modify: `app/Http/Controllers/Manager/OrderListController.php`
- Modify: `resources/js/pages/manager/orders/OrderDetail.tsx`

**Interfaces:**
- Consumes: `Invoice::orders()` hasMany
- Produces: "Xem N đơn khác cùng hóa đơn" link on OrderDetail

- [ ] **Step 1: Add sibling order count to OrderDetail backend**

In `OrderListController::show()`, after loading the order with invoice, add:

```php
$invoiceSiblingCount = 0;
if ($order->invoice_id) {
    $invoiceSiblingCount = Order::where('invoice_id', $order->invoice_id)
        ->where('id', '!=', $order->id)
        ->count();
}
```

Pass `'invoice_sibling_count' => $invoiceSiblingCount` in the Inertia props.

- [ ] **Step 2: Display link in OrderDetail.tsx**

In the invoice section, after the invoice code display, add:

```tsx
{order.invoice_sibling_count > 0 && (
    <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
        Hóa đơn gộp · {order.invoice_sibling_count + 1} đơn cùng hóa đơn này
    </p>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Manager/OrderListController.php resources/js/pages/manager/orders/OrderDetail.tsx
git commit -m "feat(orders): show multi-order invoice indicator on OrderDetail"
```

---

### Task 8: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run Vite build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Verify routes**

Run: `php artisan route:list --path=pos`
Expected: Shows both `checkout` and `bulk-checkout` routes

- [ ] **Step 4: Run migration fresh (if safe)**

Run: `php artisan migrate:fresh --seed` (only in local dev)
Expected: All migrations run, seeders work

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: final adjustments for bulk checkout feature"
```
