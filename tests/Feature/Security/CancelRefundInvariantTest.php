<?php

use App\Models\InvoiceLine;
use App\Models\MoneyLedgerEntry;
use App\Models\OrderActivity;

/*
|--------------------------------------------------------------------------
| Task 5 — Refund/cancel/send-to-kitchen authorization invariants
|--------------------------------------------------------------------------
| - Thieu orders.cancel khong duoc reduce (403).
| - Mon cua don khac bi tu choi (422), khong tac dong don nao.
| - Don paid/cancelled bi tu choi (422), mon completed bi tu choi (422).
| - Giam vuot qua so luong hien co bi tu choi (422).
| - Refund: doi payments.refund (403), bat buoc reason (422),
|   ghi ledger order_refund + audit log.
*/

test('thieu orders.cancel khong duoc reduce mon (403)', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertForbidden();

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce mon cua don khac bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $orderA = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000]], ['status' => 'pending']);
    $orderB = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000]], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $orderA->id,
        'reduced_items' => [['order_item_id' => $orderB->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($orderA->items->first()->fresh()->quantity)->toBe(2);
    expect($orderB->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce don da paid bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 4, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($order->items->first()->fresh()->quantity)->toBe(4);
    expect($order->fresh()->status)->toBe('paid');
});

test('reduce don da cancelled bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000, 'status' => 'pending']], ['status' => 'cancelled']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce vuot qua so luong hien co bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 5, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
    expect($order->items->first()->fresh()->status)->not->toBe('cancelled');
});

test('reduce mon da completed bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce don completed (van active) van giam binh thuong', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 3, 'price' => 20000, 'status' => 'pending']], ['status' => 'completed']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(302);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce thieu order_id bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(422);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('web hien ly do cu the khi reduce vi pham guard', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $orderA = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000]], ['status' => 'pending']);
    $orderB = posOrder($table, [['item' => posMenuItem(), 'qty' => 2, 'price' => 20000]], ['status' => 'pending']);

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $orderA->id,
        'reduced_items' => [['order_item_id' => $orderB->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertSessionHasErrors(['error']);

    expect($orderB->items->first()->fresh()->quantity)->toBe(2);
});

test('reduce dung order_id van giam binh thuong', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 3, 'price' => 20000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(302);

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('refund thieu payments.refund bi chan 403', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 50000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $this->actingAs($staff)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
        'reason' => 'Hàng lỗi',
    ])->assertForbidden();
});

test('refund thieu reason bi tu choi 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'payments.refund'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 50000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $this->actingAs($staff)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
    ])->assertStatus(422);
});

test('refund ghi ledger order_refund va audit log', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'payments.refund'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 50000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $this->actingAs($staff)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
        'reason' => 'Hàng lỗi',
    ])->assertOk();

    expect(MoneyLedgerEntry::where('type', 'order_refund')->where('direction', 'out')->count())->toBe(1);
    expect(OrderActivity::where('order_id', $order->id)->where('action', 'refund')->exists())->toBeTrue();
});
