# Bulk Checkout & POS Cart Grouping Design

## Summary

Implement "Thanh toán gộp" (bulk checkout) that creates a single invoice for all active orders on a table (or merged table group), refactor the invoice data model from 1:1 to 1:many, and improve POSCartPanel with order-based item grouping and compact layout.

## Data Model Changes

### Migration: `refactor_invoices_to_support_bulk_checkout`

**invoices table:**
- DROP column: `order_id` (and its unique index)
- KEEP: `invoice_code`, `table_name`, `payment_method`, `amount_received`, `change_amount`, `total_amount`, `issued_at`

**orders table:**
- ADD: `invoice_id` (nullable unsignedBigInteger FK → invoices.id, onDelete SET NULL)
- ADD INDEX: `orders_invoice_id_index`

**Data migration (within same migration):**
1. Add `invoice_id` column to orders
2. For each existing invoice with `order_id`, set `orders.invoice_id = invoices.id` where `orders.id = invoices.order_id`
3. Drop `order_id` column and unique index from invoices

### Model Relations

```php
// Invoice.php
public function orders(): HasMany
{
    return $this->hasMany(Order::class, 'invoice_id');
}

// Order.php
public function invoice(): BelongsTo
{
    return $this->belongsTo(Invoice::class, 'invoice_id');
}
```

### Invoice Model Updates
- Remove `order_id` from `$fillable`
- Add `orders()` hasMany relation
- Remove `order()` belongsTo relation

### Order Model Updates
- Add `invoice_id` to `$fillable`
- Change `invoice()` from hasOne to belongsTo

## Backend: Bulk Checkout Endpoint

### Route
```php
Route::post('/pos/bulk-checkout', [POSController::class, 'bulkCheckout'])
    ->middleware('permission:pos.create');
```

### Validation
```php
'order_ids' => 'required|array|min:1',
'order_ids.*' => 'exists:orders,id',
'table_id' => 'nullable|exists:tables,id',
'payment_method' => 'required|in:cash,transfer',
'amount_received' => 'required|numeric|min:0',
'change_amount' => 'required|numeric|min:0',
'idempotency_key' => 'nullable|string|max:100',
```

### Flow (inside DB::transaction)
1. Lock all orders: `Order::whereIn('id', $orderIds)->lockForUpdate()`
2. Validate: no order is already `paid` or `cancelled`
3. Kitchen lock check: if any item is `pending`/`processing`, require `pos.bypass_kitchen_lock` permission
4. Compute `total_amount` = sum of all items across all orders
5. Determine table name string (handle merged groups: "Bàn X (Gộp Y, Z)" or "Mang đi")
6. Create single Invoice record (invoice_code, table_name, totals, payment info)
7. Update all orders: `status = 'paid'`, `invoice_id = $invoice->id`
8. Audit log: record `checkout` activity for EACH order (meta includes shared invoice_code + per-order total)
9. Release tables: if no active orders remain in the group, set all group tables to `available` + clear `merged_into_table_id`
10. Dispatch events: `TableStatusUpdated`, `IngredientStockUpdated`

### Existing Single Checkout
- `POST /staff/pos/checkout` remains unchanged for individual order payment
- Creates 1 invoice for 1 order (same as before, but uses new `invoice_id` FK)

## Frontend: POSCartPanel Item Grouping

### Grouping Logic
- Group confirmed items by `order_code` (from parent order)
- Each group rendered inside a bordered container with a top-left label
- Draft items (not yet sent to kitchen) render separately without a frame

### Group Container Design
```
┌─ MD-260729-02 ─────────────────────────┐
│  Cà phê sữa    x2    50,000đ   100,000đ │
│  Trà đào       x1    35,000đ    35,000đ │
└─────────────────────────────────────────┘
```

- Label: `order_code` text, small badge for context ("gọi thêm", "gộp từ Bàn X")
- Border: `border border-zinc-200 dark:border-zinc-700 rounded-lg`
- Label position: top-left, `text-[10px] font-semibold text-zinc-400`

### Compact Layout Changes
- Container padding: `p-4` → `p-3`, `space-y-3` → `space-y-2`
- Item row padding: `px-3 py-2.5` → `px-2.5 py-2`
- Item gap: `gap-3` → `gap-2`
- Font sizes remain `text-sm` for item names and prices

### Data Requirements
- Backend already sends `active_orders` with nested `items` and `order_code`
- Frontend groups items by `order_code` before rendering
- No additional backend changes needed for grouping

## Frontend: Checkout Button (Split Button + Drop-up)

### Layout
```
┌─────────────────────────────────┬───┐
│   Thanh toán · 285,000đ        │ ▲ │
└─────────────────────────────────┴───┘
```

- Main button (left): "Thanh toán" + total amount → triggers bulk-checkout for ALL confirmed orders
- Secondary button (right): `ChevronUp` icon → opens drop-up menu above

### Drop-up Menu Options
- "Thanh toán riêng" → checkout only the currently active invoice tab's order
- Future: "Đặt cọc", "Giảm giá", etc.

### Checkout Modal (Bulk)
- Summary line: "N đơn · M món · TOTALđ"
- Payment method selector (cash/transfer)
- Amount received input
- Change amount display
- Confirm button

### After Successful Payment
- Inertia reload → table returns to "Trống" if no active orders remain
- If individual checkout: table stays "occupied" if other orders exist

## OrderDetail & OrderList Impact

### OrderDetail
- `order.invoice` (belongsTo) still works — no display logic change
- Addition: if invoice has multiple orders, show "Xem N đơn khác cùng hóa đơn" link

### OrderList
- "Mã HĐ" column still shows `invoice_code` via order's invoice relation
- No filter/search logic changes

### Audit Log
- Each order records its own `checkout` activity (meta includes shared `invoice_code`)
- Timeline on OrderDetail unchanged

## Transfer / Merge / Unmerge Review

### Transfer — CORRECT, no changes needed
- Only allows transfer to empty tables
- Handles 3 cases: independent, primary of group, sub-table
- Orders move with table

### Merge — CORRECT, no changes needed
- Moves all source group orders to target primary
- Marks source tables with `merged_into_table_id`
- Bulk checkout naturally handles merged groups (queries all orders in group)

### Unmerge — CORRECT, no changes needed
- Splits group, keeps orders on chosen table
- Other tables return to available

## Files to Modify

| File | Change |
|------|--------|
| `database/migrations/xxxx_refactor_invoices...` | New migration |
| `app/Models/Invoice.php` | Remove order_id, add orders() |
| `app/Models/Order.php` | Add invoice_id, change invoice() |
| `app/Http/Controllers/Staff/POSController.php` | Add bulkCheckout(), update checkout() |
| `routes/web.php` | Add bulk-checkout route |
| `resources/js/pages/staff/pos/components/POSCartPanel.tsx` | Item grouping, compact layout, split button |
| `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts` | Add bulk checkout logic |
| `resources/js/pages/manager/orders/OrderDetail.tsx` | Multi-order invoice link |
