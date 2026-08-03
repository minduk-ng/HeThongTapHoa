<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\Promotion;

test('bulk-checkout loi thi toan bo rollback: khong hoa don, khong order paid, used_count khong tang', function () {
    $this->actingAs(posAdmin());
    $promo = Promotion::create(['code' => 'BR'.uniqid(), 'name' => 'BR', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true, 'max_uses' => 100, 'used_count' => 0]);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    // mot order da paid -> hop le khong du huan
    $o1 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'paid']);
    $o2 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$o1->id, $o2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasErrors(['error']);

    expect(Invoice::count())->toBe(0);
    expect($o2->fresh()->status)->toBe('completed');
    expect($promo->fresh()->used_count)->toBe(0);
});

test('bulk-checkout loi thi deposit held khong bi doi thanh applied', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $o1 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'paid']);
    $o2 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);
    $deposit = Deposit::create(['order_id' => $o2->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$o1->id, $o2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasErrors(['error']);

    expect($deposit->fresh()->status)->toBe('held');
    expect(Deposit::where('status', 'applied')->count())->toBe(0);
});