<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;

test('store tao phieu nhap nhieu nguyen lieu va cap nhat stock + WAC', function () {
    $admin = posAdmin();
    $ing1 = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 100, 'cost_price' => 10000]);
    $ing2 = Ingredient::create(['code' => 'duong', 'name' => 'Đường '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [
            ['ingredient_id' => $ing1->id, 'quantity' => 100, 'unit_price' => 20000],
            ['ingredient_id' => $ing2->id, 'quantity' => 50, 'unit_price' => 15000],
        ],
        'note' => 'Nhập đại lý',
    ])->assertRedirect();

    $voucher = StockVoucher::where('type', 'import')->first();
    expect($voucher)->not->toBeNull();
    expect($voucher->note)->toBe('Nhập đại lý');
    expect(str_starts_with($voucher->voucher_code, 'PN-'))->toBeTrue();
    expect($voucher->items()->count())->toBe(2);

    // WAC ing1: (100*10000 + 100*20000)/200 = 15000
    expect((float) $ing1->fresh()->stock_quantity)->toBe(200.0);
    expect((float) $ing1->fresh()->cost_price)->toBe(15000.0);
    // ing2: WAC = (0*0 + 50*15000)/50 = 15000
    expect((float) $ing2->fresh()->stock_quantity)->toBe(50.0);
    expect((float) $ing2->fresh()->cost_price)->toBe(15000.0);

    $item1 = StockVoucherItem::where('voucher_id', $voucher->id)->where('ingredient_id', $ing1->id)->first();
    expect((float) $item1->quantity)->toBe(100.0);
    expect((float) $item1->unit_price)->toBe(20000.0);
});

test('store tu choi khi items rong hoac quantity <= 0', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'x', 'name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [['ingredient_id' => $ing->id, 'quantity' => 0, 'unit_price' => 1000]],
    ])->assertSessionHasErrors('items.0.quantity');

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [],
    ])->assertSessionHasErrors('items');

    expect(StockVoucher::count())->toBe(0);
});

test('index tra ve danh sach phieu', function () {
    $admin = posAdmin();
    Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [['ingredient_id' => Ingredient::first()->id, 'quantity' => 10, 'unit_price' => 5000]],
    ]);

    $this->actingAs($admin)->get('/manager/inventory/vouchers')->assertOk();
});

test('show van hoat dong khi ingredient cua phieu da bi xoa mem', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 5000]],
    ]);

    $voucher = StockVoucher::where('type', 'import')->first();
    $ing->delete(); // soft delete ingredient

    $this->actingAs($admin)->get('/manager/inventory/vouchers/'.$voucher->id)->assertOk();
});
