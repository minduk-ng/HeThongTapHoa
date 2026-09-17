<?php

use App\Models\Deposit;
use App\Models\Ingredient;
use App\Models\InvoiceLine;
use App\Models\Shift;
use App\Models\StockVoucher;
use App\Models\Supplier;

test('pos.create alone cannot refund or reduce items', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);

    $this->actingAs($staff)->postJson('/staff/pos/refund', [])->assertForbidden();

    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [['order_item_id' => $order->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertForbidden();

    expect($order->items->first()->fresh()->quantity)->toBe(2);
});

test('shift viewer cannot record cash movement', function () {
    $viewer = posStaff(['shifts.view'], ['/staff/shifts']);
    $this->actingAs($viewer)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'khac', 'amount' => 10000,
    ])->assertForbidden();
});

test('pos.create alone cannot record deposit', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $order = posOrder(posTable(['status' => 'occupied']), [], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 50000, 'method' => 'cash',
    ])->assertForbidden();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(0);
});

test('pos.create alone cannot cancel reservation', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $order = posOrder(posTable(['status' => 'reserved']), [], ['status' => 'reserved']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
    ])->assertForbidden();

    expect($order->fresh()->status)->toBe('reserved');
});

test('reservation refund requires deposits.refund even with orders.cancel', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel'], ['/staff/pos']);
    $order = posOrder(posTable(['status' => 'reserved']), [], ['status' => 'reserved']);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id, 'deposit_resolution' => 'refund',
    ])->assertForbidden();

    expect($order->fresh()->status)->toBe('reserved');
    expect($deposit->fresh()->status)->toBe('held');
});

test('legacy pos.cancel_item alone cannot cancel full order', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'pos.cancel_item'], ['/staff/pos']);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 1, 'price' => 20000]], ['status' => 'pending']);

    $this->actingAs($staff)->post('/staff/pos/cancel-order', [
        'table_id' => $table->id, 'cancellation_reason' => 'Khach doi y',
    ])->assertForbidden();

    expect($order->fresh()->status)->toBe('pending');
});

test('supplier editor without suppliers.pay cannot record payment', function () {
    $staff = posStaff(['suppliers.view', 'suppliers.edit'], ['/manager/suppliers']);
    $supplier = Supplier::create(['name' => 'NCC '.uniqid()]);
    $ingredient = Ingredient::create(['name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $voucher = StockVoucher::create([
        'voucher_code' => 'PN-'.uniqid(), 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $voucher->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 2, 'unit_price' => 50000]);

    $this->actingAs($staff)->post("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 100000, 'voucher_ids' => [$voucher->id],
    ])->assertForbidden();

    expect($voucher->fresh()->is_paid)->toBeFalse();
});

test('cashier with granular permissions can deposit, reduce items and cancel', function () {
    $staff = posStaff(
        ['pos.view', 'pos.create', 'deposits.create', 'deposits.refund', 'orders.cancel'],
        ['/staff/pos']
    );

    // deposit
    $order = posOrder(posTable(['status' => 'occupied']), [], ['status' => 'pending']);
    $this->actingAs($staff)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 50000, 'method' => 'cash',
    ])->assertOk();

    // reduce items
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'pending']], ['status' => 'pending']);
    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [['order_item_id' => $order2->items->first()->id, 'reduce_quantity' => 1, 'cancellation_reason' => 'Khách đổi ý']],
    ])->assertStatus(302);
    expect($order2->items->first()->fresh()->quantity)->toBe(1);

    // cancel reservation with refund
    $reserved = posOrder(posTable(['status' => 'reserved']), [], ['status' => 'reserved']);
    Deposit::create(['order_id' => $reserved->id, 'amount' => 50000, 'method' => 'cash', 'status' => 'held']);
    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $reserved->id, 'deposit_resolution' => 'refund',
    ])->assertOk();

    // full order cancel
    $table3 = posTable(['status' => 'occupied']);
    $order3 = posOrder($table3, [['item' => posMenuItem(), 'qty' => 1, 'price' => 20000]], ['status' => 'pending']);
    $this->actingAs($staff)->post('/staff/pos/cancel-order', [
        'table_id' => $table3->id, 'cancellation_reason' => 'Khach ve',
    ])->assertSessionHasNoErrors();
    expect($order3->fresh()->status)->toBe('cancelled');
});

test('cashier with payments.refund can refund after checkout', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'payments.refund'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

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
});

test('cashier with shifts.movement and suppliers.pay can move cash and pay supplier', function () {
    $staff = posStaff(['shifts.view', 'shifts.movement', 'suppliers.view', 'suppliers.pay'], ['/staff/shifts', '/manager/suppliers']);
    Shift::create(['opened_at' => now(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => $staff->id]);

    $this->actingAs($staff)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'khac', 'amount' => 10000,
    ])->assertOk();

    $supplier = Supplier::create(['name' => 'NCC '.uniqid()]);
    $ingredient = Ingredient::create(['name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $voucher = StockVoucher::create([
        'voucher_code' => 'PN-'.uniqid(), 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $voucher->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 2, 'unit_price' => 50000]);

    $this->actingAs($staff)->post("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 100000, 'voucher_ids' => [$voucher->id],
    ])->assertStatus(302);

    expect($voucher->fresh()->is_paid)->toBeTrue();
});
