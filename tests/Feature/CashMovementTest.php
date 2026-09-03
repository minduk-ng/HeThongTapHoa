<?php

use App\Models\CashMovement;
use App\Models\Shift;

test('ghi chi trong ca va expectedCash tru di', function () {
    $admin = posAdmin();
    $shift = Shift::create([
        'opened_at' => now(), 'opening_cash' => 100000, 'status' => 'open',
        'status_token' => 'OPEN', 'opened_by' => $admin->id,
    ]);

    $this->actingAs($admin)->postJson('/staff/shifts/movements', [
        'type' => 'expense',
        'category' => 'mua_nguyen_lieu',
        'amount' => 50000,
        'note' => 'mua nước',
    ])->assertOk();

    expect(CashMovement::where('shift_id', $shift->id)->exists())->toBeTrue();

    $expected = (new \App\Services\Manager\ShiftService)->expectedCash($shift, now());
    expect($expected)->toBe(50000.0); // 100000 opening - 50000 expense
});

test('ghi thu ngoai tuong duong cong', function () {
    $admin = posAdmin();
    $shift = Shift::create([
        'opened_at' => now(), 'opening_cash' => 100000, 'status' => 'open',
        'status_token' => 'OPEN', 'opened_by' => $admin->id,
    ]);

    $this->actingAs($admin)->postJson('/staff/shifts/movements', [
        'type' => 'income', 'category' => 'thu_ngoai', 'amount' => 30000, 'note' => 'thu cò nợ',
    ])->assertOk();

    $expected = (new \App\Services\Manager\ShiftService)->expectedCash($shift, now());
    expect($expected)->toBe(130000.0);
});

test('từ chối ghi khi không có ca đang mở', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'mua_nguyen_lieu', 'amount' => 50000,
    ])->assertStatus(422)->assertJson(['error' => 'Không có ca nào đang mở.']);
});
