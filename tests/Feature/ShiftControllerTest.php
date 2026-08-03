<?php

use App\Models\Shift;

test('mở ca thành công và chặn ca mở thứ hai', function () {
    $this->actingAs(posStaff(['shifts.open', 'shifts.view', 'shifts.close'], ['/staff/shifts']))
        ->postJson('/staff/shifts/open', ['opening_cash' => 200000])
        ->assertOk();
    expect(Shift::open()->count())->toBe(1);

    $this->postJson('/staff/shifts/open', ['opening_cash' => 300000])->assertStatus(409);
    expect(Shift::open()->count())->toBe(1);
});

test('current tính expected_cash theo amount_received của hóa đơn cash trong ca', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);
    App\Models\Invoice::create([
        'invoice_code' => 'INV-CASH', 'table_name' => 'B1', 'total_amount' => 45000, 'payment_method' => 'cash',
        'amount_received' => 50000, 'change_amount' => 5000, 'issued_at' => now(),
    ]);
    App\Models\Invoice::create([
        'invoice_code' => 'INV-BANK', 'table_name' => 'B1', 'total_amount' => 70000, 'payment_method' => 'bank_transfer',
        'amount_received' => 70000, 'change_amount' => 0, 'issued_at' => now(),
    ]);

    $response = $this->getJson('/staff/shifts/current')->assertOk()->assertJsonPath('shift.status', 'open');
    expect((float) $response->json('expected_cash'))->toBe(150000.0);
});

test('đóng ca lưu đối soát và trả chênh lệch', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);
    App\Models\Invoice::create([
        'invoice_code' => 'INV-CLOSE', 'table_name' => 'B1', 'total_amount' => 30000, 'payment_method' => 'cash',
        'amount_received' => 30000, 'change_amount' => 0, 'issued_at' => now(),
    ]);

    $response = $this->postJson('/staff/shifts/close', ['actual_cash' => 135000])->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(130000.0);
    expect((float) $response->json('difference'))->toBe(5000.0);
    $fresh = $shift->fresh();
    expect($fresh->status)->toBe('closed');
    expect((float) $fresh->closing_cash)->toBe(130000.0);
    expect((float) $fresh->actual_cash)->toBe(135000.0);
    expect($fresh->closed_at)->not->toBeNull();
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
