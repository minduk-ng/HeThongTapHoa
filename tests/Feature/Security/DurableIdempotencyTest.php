<?php

use App\Models\CashMovement;
use App\Models\Deposit;
use App\Models\IdempotencyRecord;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\MoneyLedgerEntry;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\StockVoucher;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use Illuminate\Support\Facades\Artisan;

test('financial mutation creates durable idempotency record with status succeeded', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'idem_checkout_'.uniqid();

    $res = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);

    $res->assertOk();

    $record = IdempotencyRecord::where('action', 'checkout')
        ->where('idempotency_key', $key)
        ->first();

    expect($record)->not->toBeNull()
        ->and($record->status)->toBe('succeeded')
        ->and($record->user_id)->toBe($admin->id)
        ->and($record->response_code)->toBe(200)
        ->and($record->response_body)->not->toBeNull();
});

test('replay: duplicate checkout with same idempotency_key returns replayed response without re-executing', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'idem_checkout_replay_'.uniqid();
    $payload = [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ];

    $res1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload);
    $res1->assertOk();
    $data1 = $res1->json();

    $paymentCount = Payment::count();
    $ledgerCount = MoneyLedgerEntry::where('type', 'sale')->count();
    expect($paymentCount)->toBe(1)
        ->and($ledgerCount)->toBe(1);

    // Replay request with same key
    $res2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload);
    $res2->assertOk();
    $data2 = $res2->json();

    expect($data2['success'])->toBe($data1['success'])
        ->and(Payment::count())->toBe(1)
        ->and(MoneyLedgerEntry::where('type', 'sale')->count())->toBe(1);
});

test('replay: duplicate deposit with same idempotency_key returns replayed response without duplicate deposit', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 100000]), 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
    ]);

    $key = 'idem_deposit_replay_'.uniqid();
    $payload = [
        'order_id' => $order->id,
        'amount' => 50000,
        'method' => 'cash',
        'idempotency_key' => $key,
    ];

    $res1 = $this->actingAs($admin)->postJson('/staff/pos/deposit', $payload);
    $res1->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1);

    $res2 = $this->actingAs($admin)->postJson('/staff/pos/deposit', $payload);
    $res2->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1);
});

test('concurrent or processing request with same key returns 409 conflict', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'idem_processing_'.uniqid();

    // Insert record with status 'processing'
    IdempotencyRecord::create([
        'action' => 'checkout',
        'idempotency_key' => $key,
        'user_id' => $admin->id,
        'status' => 'processing',
    ]);

    $res = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);

    $res->assertStatus(409)
        ->assertJsonFragment(['message' => 'Thao tác đang được xử lý, vui lòng chờ.']);
});

test('failed transaction marks record failed and allows retry with same key', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'idem_failed_retry_'.uniqid();

    // First attempt fails because order is already paid or invalid state
    // Let's mark order paid to force checkout failure
    $order->update(['status' => 'paid']);

    $res1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);

    $res1->assertStatus(422);

    $record = IdempotencyRecord::where('action', 'checkout')
        ->where('idempotency_key', $key)
        ->first();

    expect($record)->not->toBeNull()
        ->and($record->status)->toBe('failed');

    // Fix the order back to pending to allow retry
    $order->update(['status' => 'pending']);

    // Second attempt with SAME key must now be allowed to proceed and succeed
    $res2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);

    $res2->assertOk();

    $record->refresh();
    expect($record->status)->toBe('succeeded');
});

test('idempotency:prune command deletes records older than 30 days', function () {
    // Record older than 30 days
    $oldRecord = (new IdempotencyRecord)->forceFill([
        'action' => 'checkout',
        'idempotency_key' => 'old_key_'.uniqid(),
        'status' => 'succeeded',
        'created_at' => now()->subDays(31),
        'updated_at' => now()->subDays(31),
    ]);
    $oldRecord->save();

    // Record within 30 days
    $newRecord = (new IdempotencyRecord)->forceFill([
        'action' => 'checkout',
        'idempotency_key' => 'new_key_'.uniqid(),
        'status' => 'succeeded',
        'created_at' => now()->subDays(10),
        'updated_at' => now()->subDays(10),
    ]);
    $newRecord->save();

    Artisan::call('idempotency:prune');

    expect(IdempotencyRecord::find($oldRecord->id))->toBeNull()
        ->and(IdempotencyRecord::find($newRecord->id))->not->toBeNull();
});

test('refund mutation is durable and idempotent', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    // Checkout first
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => 'refund-setup-'.uniqid(),
    ])->assertOk();

    $invoice = Invoice::with('lines')->latest('id')->firstOrFail();
    $line = $invoice->lines->first();

    $key = 'idem_refund_'.uniqid();
    $payload = [
        'invoice_id' => $invoice->id,
        'items' => [
            ['invoice_line_id' => $line->id, 'qty' => 1],
        ],
        'reason' => 'Khách trả hàng',
        'idempotency_key' => $key,
    ];

    $res1 = $this->actingAs($admin)->postJson('/staff/pos/refund', $payload);
    $res1->assertOk();

    $refundPaymentsCount = Payment::where('invoice_id', $invoice->id)->where('amount', '<', 0)->count();
    expect($refundPaymentsCount)->toBe(1);

    // Replay with same key
    $res2 = $this->actingAs($admin)->postJson('/staff/pos/refund', $payload);
    $res2->assertOk();

    expect(Payment::where('invoice_id', $invoice->id)->where('amount', '<', 0)->count())->toBe(1);
});

test('cash movement mutation is durable and idempotent', function () {
    $admin = posAdmin();
    Shift::create([
        'opened_at' => now(),
        'opening_cash' => 100000,
        'status' => 'open',
        'opened_by' => $admin->id,
    ]);

    $key = 'idem_movement_'.uniqid();
    $payload = [
        'type' => 'income',
        'category' => 'Bán ve chai',
        'amount' => 50000,
        'note' => 'Thu tiền ve chai',
        'idempotency_key' => $key,
    ];

    $res1 = $this->actingAs($admin)->postJson('/staff/shifts/movements', $payload);
    $res1->assertOk();

    expect(CashMovement::count())->toBe(1);

    // Replay
    $res2 = $this->actingAs($admin)->postJson('/staff/shifts/movements', $payload);
    $res2->assertOk();

    expect(CashMovement::count())->toBe(1);
});

test('supplier payment mutation is durable and idempotent', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC Test']);
    $ingredient = Ingredient::create(['name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-IDEM-'.uniqid(), 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 5, 'unit_price' => 20000]);

    $key = 'idem_suppay_'.uniqid();
    $payload = [
        'amount' => 100000,
        'voucher_ids' => [$v->id],
        'idempotency_key' => $key,
    ];

    $res1 = $this->actingAs($admin)->post("/manager/suppliers/{$supplier->id}/payments", $payload);
    $res1->assertStatus(302);

    expect(SupplierPayment::count())->toBe(1);

    // Replay
    $res2 = $this->actingAs($admin)->post("/manager/suppliers/{$supplier->id}/payments", $payload);
    $res2->assertStatus(302);
    $res2->assertSessionHasNoErrors();
    $res2->assertSessionHas('success');
    $res2->assertHeader('X-Idempotent-Replay', 'true');

    expect(SupplierPayment::count())->toBe(1);
});

test('cross-user scope: idempotency key from user A cannot be accessed or replayed by user B', function () {
    $userA = posAdmin();
    $userB = posAdmin();

    $orderA = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);
    $orderB = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'shared_key_'.uniqid();

    // User A executes checkout with key
    $resA = $this->actingAs($userA)->postJson('/staff/pos/checkout', [
        'order_id' => $orderA->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);
    $resA->assertOk();

    // User B attempts to use the same idempotency key
    $resB = $this->actingAs($userB)->postJson('/staff/pos/checkout', [
        'order_id' => $orderB->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);

    $resB->assertStatus(403)
        ->assertJsonFragment(['error' => 'Idempotency key belongs to another user.']);
});

test('reuse same idempotency key with different payload returns 422 error', function () {
    $admin = posAdmin();
    $order1 = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);
    $order2 = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 100000]), 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
    ]);

    $key = 'reused_key_diff_payload_'.uniqid();

    // First request
    $res1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order1->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ]);
    $res1->assertOk();

    // Second request with same key but DIFFERENT payload (order2, 100000)
    $res2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order2->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
        'idempotency_key' => $key,
    ]);

    $res2->assertStatus(422)
        ->assertJsonFragment(['error' => 'Khóa trùng lặp đã được sử dụng cho một yêu cầu khác.']);
});

test('processing record older than 5 minutes allows retry instead of permanent 409', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ]);

    $key = 'abandoned_process_'.uniqid();
    $payload = [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => $key,
    ];

    $fp = ['amount_received' => 50000, 'order_id' => $order->id, 'payment_method' => 'cash'];
    $fpHash = hash('sha256', json_encode($fp) ?: '');

    $record = IdempotencyRecord::create([
        'action' => 'checkout',
        'idempotency_key' => $key,
        'user_id' => $admin->id,
        'resource_fingerprint' => $fpHash,
        'status' => 'processing',
    ]);
    $record->timestamps = false;
    $record->created_at = now()->subMinutes(6);
    $record->updated_at = now()->subMinutes(6);
    $record->save();

    $res = $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload);
    $res->assertOk();

    $record->refresh();
    expect($record->status)->toBe('succeeded');
});

test('stale processing record linked to committed deposit replays without duplicate mutation', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [['item' => posMenuItem(['price' => 50000]), 'qty' => 1, 'price' => 50000, 'status' => 'completed']]);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 20000, 'method' => 'cash', 'status' => 'held']);
    $key = 'crash-after-commit-'.uniqid();
    $fingerprint = ['amount' => 20000, 'method' => 'cash', 'order_id' => $order->id];
    $record = IdempotencyRecord::create([
        'action' => 'deposit', 'idempotency_key' => $key, 'user_id' => $admin->id,
        'resource_fingerprint' => hash('sha256', json_encode($fingerprint) ?: ''),
        'resource_type' => Deposit::class, 'resource_id' => $deposit->id,
        'status' => 'processing', 'response_code' => 200, 'response_body' => json_encode(['success' => true]),
    ]);
    $record->timestamps = false;
    $record->updated_at = now()->subMinutes(6);
    $record->save();

    $this->actingAs($admin)->postJson('/staff/pos/deposit', $fingerprint + ['idempotency_key' => $key])
        ->assertOk()->assertHeader('X-Idempotent-Replay', 'true');

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1)
        ->and($record->fresh()->status)->toBe('succeeded');
});

test('all financial endpoint families require an idempotency key', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), [['item' => posMenuItem(['price' => 10000]), 'qty' => 1, 'price' => 10000, 'status' => 'completed']]);
    $supplier = Supplier::create(['name' => 'Required key supplier']);
    Shift::create(['opened_at' => now(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => $admin->id]);

    $responses = [];
    $responses['checkout'] = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 10000, 'idempotency_key' => null,
    ]);
    $responses['bulk_checkout'] = $this->actingAs($admin)->postJson('/staff/pos/bulk-checkout', [
        'order_ids' => [$order->id], 'payment_method' => 'cash', 'amount_received' => 10000, 'idempotency_key' => null,
    ]);
    $responses['deposit'] = $this->actingAs($admin)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 1000, 'method' => 'cash', 'idempotency_key' => null,
    ]);
    $responses['refund'] = $this->actingAs($admin)->postJson('/staff/pos/refund', [
        'invoice_id' => 1, 'items' => [['invoice_line_id' => 1, 'qty' => 1]], 'reason' => 'test', 'idempotency_key' => null,
    ]);
    $responses['supplier_payment'] = $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 1000, 'voucher_ids' => [1], 'idempotency_key' => null,
    ]);
    $responses['cash_movement'] = $this->actingAs($admin)->postJson('/staff/shifts/movements', [
        'type' => 'income', 'category' => 'test', 'amount' => 1000, 'idempotency_key' => null,
    ]);

    foreach ($responses as $family => $response) {
        expect($response->status())->toBe(422, $family)
            ->and($response->json('errors.idempotency_key'))->not->toBeNull($family);
    }
});
