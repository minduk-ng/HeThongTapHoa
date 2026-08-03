<?php

use App\Models\Invoice;
use App\Models\Shift;

test('expectedCash tinh ca hoa don o cac thoi diem can cua ca', function () {
    $this->actingAs(posAdmin());
    $openedAt = now()->subMinutes(30);
    $closedAt = now();

    $shift = Shift::create(['opened_at' => $openedAt, 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    // Hóa đơn xuất khi mở (issued_at bằng opened_at)
    Invoice::create(['invoice_code' => 'INV-EDGE1', 'table_name' => 'B1', 'total_amount' => 40000, 'payment_method' => 'cash', 'amount_received' => 40000, 'change_amount' => 0, 'issued_at' => $openedAt]);
    // Hóa đơn ngay trước khi đóng
    Invoice::create(['invoice_code' => 'INV-EDGE2', 'table_name' => 'B2', 'total_amount' => 60000, 'payment_method' => 'cash', 'amount_received' => 60000, 'change_amount' => 0, 'issued_at' => $closedAt->format('Y-m-d H:i:s').'']);

    $response = $this->postJson('/staff/shifts/close', ['actual_cash' => 100000])->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(100000.0);
});

test('ca dong tai cho khong tin them hoa don truoc khi mo', function () {
    $this->actingAs(posAdmin());
    $openedAt = now();
    $shift = Shift::create(['opened_at' => $openedAt, 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);
    // Hóa đơn phát sinh Trước opened_at (trong mốc cũ) → không tính vào ca này
    Invoice::create(['invoice_code' => 'PREV', 'table_name' => 'B0', 'total_amount' => 50000, 'payment_method' => 'cash', 'amount_received' => 50000, 'change_amount' => 0, 'issued_at' => $openedAt->copy()->subSecond()]);

    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(0.0);
});
