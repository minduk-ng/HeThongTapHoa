<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Shift;

test('mở ca thành công và chặn ca mở thứ hai', function () {
    $this->actingAs(posStaff(['shifts.open', 'shifts.view', 'shifts.close'], ['/staff/shifts']))
        ->postJson('/staff/shifts/open', ['opening_cash' => 200000])
        ->assertOk();
    expect(Shift::open()->count())->toBe(1);

    $this->postJson('/staff/shifts/open', ['opening_cash' => 300000])->assertStatus(409);
    expect(Shift::open()->count())->toBe(1);
});

test('current tính expected_cash theo payments cash trong ca (bỏ qua bank)', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);

    $invCash = Invoice::create([
        'invoice_code' => 'INV-CASH', 'table_name' => 'B1', 'total_amount' => 45000, 'payment_method' => 'cash',
        'amount_received' => 50000, 'change_amount' => 5000, 'issued_at' => now(),
    ]);
    Payment::create(['invoice_id' => $invCash->id, 'method' => 'cash', 'amount' => 50000]);

    $invBank = Invoice::create([
        'invoice_code' => 'INV-BANK', 'table_name' => 'B1', 'total_amount' => 70000, 'payment_method' => 'bank_transfer',
        'amount_received' => 70000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
    Payment::create(['invoice_id' => $invBank->id, 'method' => 'bank_transfer', 'amount' => 70000]);

    $response = $this->getJson('/staff/shifts/current')->assertOk()->assertJsonPath('shift.status', 'open');
    expect((float) $response->json('expected_cash'))->toBe(150000.0);
});

test('đóng ca lưu đối soát và trả chênh lệch', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);
    Invoice::create([
        'invoice_code' => 'INV-CLOSE', 'table_name' => 'B1', 'total_amount' => 30000, 'payment_method' => 'cash',
        'amount_received' => 30000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
    $invClose = Invoice::where('invoice_code', 'INV-CLOSE')->first();
    Payment::create(['invoice_id' => $invClose->id, 'method' => 'cash', 'amount' => 30000]);

    $response = $this->postJson('/staff/shifts/close', ['actual_cash' => 135000])->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(130000.0);
    expect((float) $response->json('difference'))->toBe(5000.0);
    $fresh = $shift->fresh();
    expect($fresh->status)->toBe('closed');
    expect((float) $fresh->closing_cash)->toBe(130000.0);
    expect((float) $fresh->actual_cash)->toBe(135000.0);
    expect($fresh->closed_at)->not->toBeNull();
});

test('expected_cash gom coc cash nhan trong ca, khong dem lai coc da applied', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    // Cọc cash held nhận trong ca → phải đếm
    $item = posMenuItem(['price' => 100000]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(30000.0);
});

test('expected_cash tru coc cash da hoan trong ca (refunded)', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    $item = posMenuItem(['price' => 100000]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);

    // Cọc cash nhận trong ca
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    // Khách hủy đặt bàn → hoàn cọc (status refunded, resolved_at = now)
    $deposit->update(['status' => 'refunded', 'resolved_at' => now()]);

    $response = $this->getJson('/staff/shifts/current')->assertOk();
    // 0 mở + 0 checkout + 30000 cọc nhận − 30000 hoàn = 0
    expect((float) $response->json('expected_cash'))->toBe(0.0);
});

test('expected_cash khong dem lai coc da applied (payment row Tiền cọc)', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    $item = posMenuItem(['price' => 100000]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    // Cọc applied qua checkout: payment row 'Tiền cọc đơn X' + deposit trả lại đếm lúc nhận
    $inv = Invoice::create([
        'invoice_code' => 'INV-APP', 'table_name' => 'B1', 'total_amount' => 70000, 'payment_method' => 'mixed',
        'amount_received' => 40000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
    Payment::create(['invoice_id' => $inv->id, 'method' => 'cash', 'amount' => 40000]); // trả thêm
    Payment::create(['invoice_id' => $inv->id, 'method' => 'cash', 'amount' => 30000, 'note' => 'Tiền cọc đơn '.$order->id]);

    // expected = cọc 30000 (nhận) + trả thêm 40000 = 70000 (không đếm lại 30000 applied)
    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(70000.0);
});

test('current trả null và close trả 409 khi không có ca mở', function () {
    $this->actingAs(posAdmin())->getJson('/staff/shifts/current')->assertOk()->assertJson(['shift' => null, 'expected_cash' => 0]);
    $this->postJson('/staff/shifts/close', ['actual_cash' => 0])->assertStatus(409);
});

test('validation chặn tiền mở và đóng ca âm hoặc thiếu', function () {
    $this->actingAs(posAdmin())->postJson('/staff/shifts/open', [])->assertStatus(422);
    $this->postJson('/staff/shifts/open', ['opening_cash' => -5])->assertStatus(422);
    Shift::create(['opened_at' => now(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);
    $this->postJson('/staff/shifts/close', [])->assertStatus(422);
    $this->postJson('/staff/shifts/close', ['actual_cash' => -1])->assertStatus(422);
});
