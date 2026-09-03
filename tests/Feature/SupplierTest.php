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
