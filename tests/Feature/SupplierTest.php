<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\Supplier;
use App\Models\SupplierPayment;

test('tao supplier va tinh cong no tu phieu nhap', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->post('/manager/suppliers', [
        'name' => 'NCC Vinagro',
        'phone' => '0240000000',
        'address' => 'Ha Noi',
    ])->assertSessionHasNoErrors();

    $supplier = Supplier::where('name', 'NCC Vinagro')->first();
    expect($supplier)->not->toBeNull();

    $ingredient = Ingredient::create(['name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);

    // Hoa don nhập
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-001',
        'type' => 'import',
        'supplier_id' => $supplier->id,
        'is_paid' => false,
        'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 50000]);

    // debt = sum chưa trả
    $debt = $supplier->debt();
    expect($debt)->toBe(500000.0);
});

test('thanh toan cong no mark paid', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC 2']);
    $ingredient = Ingredient::create(['name' => 'NL2 '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-002', 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 5, 'unit_price' => 20000]);

    $this->actingAs($admin)->post("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 100000,
        'note' => 'tra hang',
        'voucher_ids' => [$v->id],
    ])->assertSessionHasNoErrors()->assertStatus(302);

    expect(SupplierPayment::count())->toBe(1);

    expect((bool) $v->fresh()->is_paid)->toBeTrue();
    expect($supplier->debt())->toBe(0.0);
});

test('partial supplier payments cannot exceed outstanding', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC partial']);
    $ingredient = Ingredient::create(['name' => 'NL partial '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-PART', 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 10000]);

    $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 40000,
        'allocations' => [['voucher_id' => $v->id, 'amount' => 40000]],
    ])->assertStatus(302);

    expect((bool) $v->fresh()->is_paid)->toBeFalse();
    expect($v->fresh()->outstandingAmount())->toBe(60000.0);
    expect($supplier->debt())->toBe(60000.0);

    // vuot qua du no con lai => 422
    $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 70000,
        'allocations' => [['voucher_id' => $v->id, 'amount' => 70000]],
    ])->assertStatus(422);

    expect($v->fresh()->outstandingAmount())->toBe(60000.0);
    expect(SupplierPayment::count())->toBe(1);
});

test('multi-payment closes voucher when fully allocated', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC multi']);
    $ingredient = Ingredient::create(['name' => 'NL multi '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-MULTI', 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 10000]);

    $pay = fn (float $amount) => $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => $amount,
        'allocations' => [['voucher_id' => $v->id, 'amount' => $amount]],
    ])->assertStatus(302);

    $pay(40000);
    $pay(60000);

    expect((bool) $v->fresh()->is_paid)->toBeTrue();
    expect($v->fresh()->outstandingAmount())->toBe(0.0);
    expect($supplier->debt())->toBe(0.0);
    expect(SupplierPayment::count())->toBe(2);
});

test('supplier payment amount must equal allocation sum', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC mismatch']);
    $ingredient = Ingredient::create(['name' => 'NL mismatch '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-MISMATCH', 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 10000]);

    $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 50000,
        'allocations' => [['voucher_id' => $v->id, 'amount' => 40000]],
    ])->assertStatus(422);

    expect(SupplierPayment::count())->toBe(0);
});

test('foreign-supplier voucher rejected', function () {
    $admin = posAdmin();
    $supplier = Supplier::create(['name' => 'NCC A']);
    $other = Supplier::create(['name' => 'NCC B']);
    $ingredient = Ingredient::create(['name' => 'NL foreign '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $v = StockVoucher::create([
        'voucher_code' => 'PN-SUP-FOREIGN', 'type' => 'import',
        'supplier_id' => $other->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $v->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 10000]);

    $this->actingAs($admin)->postJson("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 40000,
        'allocations' => [['voucher_id' => $v->id, 'amount' => 40000]],
    ])->assertStatus(422);

    expect(SupplierPayment::count())->toBe(0);
    expect((bool) $v->fresh()->is_paid)->toBeFalse();
});
