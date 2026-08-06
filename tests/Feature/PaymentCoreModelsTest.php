<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\Payment;

test('invoice co quan he payments lines promotions', function () {
    $this->actingAs(posAdmin());
    $invoice = Invoice::create([
        'invoice_code' => 'INVTEST1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 100000, 'change_amount' => 0, 'total_amount' => 90000,
    ]);
    Payment::create(['invoice_id' => $invoice->id, 'method' => 'cash', 'amount' => 90000]);
    InvoiceLine::create(['invoice_id' => $invoice->id, 'name_snapshot' => 'Cf', 'quantity' => 2, 'unit_price' => 45000, 'subtotal' => 90000, 'vat_rate' => 10, 'vat_amount' => 8182, 'discount_amount' => 0]);
    InvoicePromotion::create(['invoice_id' => $invoice->id, 'code' => 'CK', 'name' => 'KM', 'discount_type' => 'percentage', 'discount_value' => 10, 'stack_order' => 0, 'amount' => 9000]);

    $invoice->refresh();
    expect($invoice->payments)->toHaveCount(1);
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->promotions)->toHaveCount(1);
    expect($invoice->payments->first()->amount)->toBe(90000.0);
});

test('deposit link toi payment khi applied', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 1, 'price' => 50000]]);
    $invoice = Invoice::create([
        'invoice_code' => 'INVTEST2', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 0, 'change_amount' => 0, 'total_amount' => 50000,
    ]);
    $payment = Payment::create(['invoice_id' => $invoice->id, 'method' => 'cash', 'amount' => 50000]);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 20000, 'method' => 'cash', 'status' => 'applied', 'payment_id' => $payment->id]);

    expect($deposit->payment->id)->toBe($payment->id);
});
