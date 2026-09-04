<?php

use App\Models\CashMovement;
use App\Models\InvoiceLine;
use App\Models\Shift;
use App\Services\Manager\ShiftService;

test('refund cua ca truoc khong lam lech expectedCash ca hien tai', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();

    // Ca A: bán + hoàn → payment âm tạo trong ca A
    Shift::create(['opened_at' => now()->subMinutes(20), 'opening_cash' => 50000, 'status' => 'open', 'opened_by' => auth()->id()]);
    $orderA = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', ['order_id' => $orderA->id, 'payment_method' => 'cash', 'amount_received' => 50000])->assertOk();
    $invoiceA = $orderA->fresh()->invoice;
    $lineA = InvoiceLine::where('invoice_id', $invoiceA->id)->first();
    $this->postJson('/staff/pos/refund', [
        'invoice_id' => $invoiceA->id,
        'items' => [['invoice_line_id' => $lineA->id, 'qty' => 1]],
        'reason' => 'Hàng lỗi',
    ])->assertOk();

    // Đóng ca A: có trừ payment âm trong ca (50000 + 50000 - 50000)
    $closeA = $this->postJson('/staff/shifts/close', ['actual_cash' => 50000])->assertOk();
    expect((float) $closeA->json('expected_cash'))->toBe(50000.0);

    // Ca B: đóng — expectedCash không bao gồm payment âm của A
    Shift::create(['opened_at' => now()->subSeconds(30), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);
    $closeB = $this->postJson('/staff/shifts/close', ['actual_cash' => 100000])->assertOk();
    expect((float) $closeB->json('expected_cash'))->toBe(100000.0);

    // Ca C: refund thực hiện ngay trong ca → trừ đúng
    Shift::create(['opened_at' => now()->subSeconds(10), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);
    $orderC = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', ['order_id' => $orderC->id, 'payment_method' => 'cash', 'amount_received' => 50000])->assertOk();
    $invoiceC = $orderC->fresh()->invoice;
    $lineC = InvoiceLine::where('invoice_id', $invoiceC->id)->first();
    $this->postJson('/staff/pos/refund', [
        'invoice_id' => $invoiceC->id,
        'items' => [['invoice_line_id' => $lineC->id, 'qty' => 1]],
        'reason' => 'Khách hủy',
    ])->assertOk();
    $closeC = $this->postJson('/staff/shifts/close', ['actual_cash' => 0])->assertOk();
    expect((float) $closeC->json('expected_cash'))->toBe(0.0); // 0 + 50000 - 50000
});

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

    $expected = (new ShiftService)->expectedCash($shift, now());
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

    $expected = (new ShiftService)->expectedCash($shift, now());
    expect($expected)->toBe(130000.0);
});

test('từ chối ghi khi không có ca đang mở', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'mua_nguyen_lieu', 'amount' => 50000,
    ])->assertStatus(422)->assertJson(['error' => 'Không có ca nào đang mở.']);
});
