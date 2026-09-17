<?php

use App\Models\MoneyLedgerEntry;
use App\Models\Payment;
use App\Models\Shift;
use App\Services\Checkout\CheckoutService;
use App\Services\Manager\ShiftService;

test('overpayment: payable 50k cash 100k -> invoice total 50k received 100k change 50k, payment 50k, ledger 50k, shift expectedCash +50k', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'shifts.view'], ['/staff/pos']);
    $shift = Shift::create([
        'opened_at' => now()->subHour(),
        'opening_cash' => 100000,
        'status' => 'open',
        'opened_by' => $staff->id,
    ]);

    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
    ])->assertOk();

    $order->refresh();
    $invoice = $order->invoice;

    expect((float) $invoice->total_amount)->toBe(50000.0)
        ->and((float) $invoice->amount_received)->toBe(100000.0)
        ->and((float) $invoice->change_amount)->toBe(50000.0);

    $payment = Payment::where('invoice_id', $invoice->id)->where('method', 'cash')->first();
    expect($payment)->not->toBeNull()
        ->and((float) $payment->amount)->toBe(50000.0);

    $saleLedger = MoneyLedgerEntry::where('invoice_id', $invoice->id)->where('type', 'sale')->first();
    expect($saleLedger)->not->toBeNull()
        ->and((float) $saleLedger->amount)->toBe(50000.0);

    $expectedCash = (new ShiftService)->expectedCash($shift, now());
    expect($expectedCash)->toBe(150000.0);
});

test('non-cash payment exceeding payable throws 422', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    expect(fn () => CheckoutService::run(
        $order,
        [['method' => 'bank_transfer', 'amount' => 60000]],
        [],
        $staff->id
    ))->toThrow(Exception::class, 'Số tiền thanh toán không dùng tiền mặt không được vượt quá số tiền cần thanh toán.');

    // Endpoint cũng trả về 422
    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'bank_transfer',
        'amount_received' => 60000,
    ])->assertStatus(422);
});

test('mixed payment: 30k bank + 50k cash for 50k payable -> 30k bank payment, 20k cash payment', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $invoice = CheckoutService::run(
        $order,
        [
            ['method' => 'bank_transfer', 'amount' => 30000],
            ['method' => 'cash', 'amount' => 50000],
        ],
        [],
        $staff->id
    );

    expect((float) $invoice->total_amount)->toBe(50000.0)
        ->and((float) $invoice->amount_received)->toBe(80000.0)
        ->and((float) $invoice->change_amount)->toBe(30000.0);

    $bankPayment = Payment::where('invoice_id', $invoice->id)->where('method', 'bank_transfer')->first();
    expect($bankPayment)->not->toBeNull()
        ->and((float) $bankPayment->amount)->toBe(30000.0);

    $cashPayment = Payment::where('invoice_id', $invoice->id)->where('method', 'cash')->first();
    expect($cashPayment)->not->toBeNull()
        ->and((float) $cashPayment->amount)->toBe(20000.0);

    $bankLedger = MoneyLedgerEntry::where('invoice_id', $invoice->id)->where('type', 'sale')->where('method', 'bank_transfer')->first();
    expect($bankLedger)->not->toBeNull()
        ->and((float) $bankLedger->amount)->toBe(30000.0);

    $cashLedger = MoneyLedgerEntry::where('invoice_id', $invoice->id)->where('type', 'sale')->where('method', 'cash')->first();
    expect($cashLedger)->not->toBeNull()
        ->and((float) $cashLedger->amount)->toBe(20000.0);
});
