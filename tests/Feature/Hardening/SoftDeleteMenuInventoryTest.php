<?php

use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\MenuItem;
use App\Models\OrderItem;

test('xoá món qua ProductController la soft delete, lich su order con nguyen', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    posOrder(posTable(), [['item' => $item, 'qty' => 2, 'price' => $item->price]]);

    $this->actingAs($admin)->delete('/manager/products/'.$item->id, ['password' => 'password123']);

    expect(MenuItem::withTrashed()->find($item->id))->not->toBeNull();
    expect(MenuItem::find($item->id))->toBeNull();
    expect(OrderItem::where('menu_item_id', $item->id)->count())->toBe(1);
});

test('xoá nguyên liệu qua IngredientController la soft delete, inventory_transactions con nguyen', function () {
    $admin = posAdmin();
    $ing = Ingredient::create([
        'code' => 'test-'.uniqid(), 'name' => 'NL '.uniqid(),
        'stock_quantity' => 100, 'unit' => 'g', 'min_stock_alert' => 10, 'cost_price' => 1000,
    ]);
    InventoryTransaction::create([
        'ingredient_id' => $ing->id, 'type' => 'import', 'quantity' => 100, 'reason' => 'test',
    ]);

    $this->actingAs($admin)->delete('/manager/inventory/ingredients/'.$ing->id, ['password' => 'password123']);

    expect(Ingredient::withTrashed()->find($ing->id))->not->toBeNull();
    expect(Ingredient::find($ing->id))->toBeNull();
    expect(InventoryTransaction::where('ingredient_id', $ing->id)->count())->toBe(1);
});

test('POS index van hoat dong khi recipe tro toi ingredient da xoa mem', function () {
    $ing = Ingredient::create([
        'code' => 'test-'.uniqid(), 'name' => 'NL '.uniqid(),
        'stock_quantity' => 100, 'unit' => 'g', 'min_stock_alert' => 10, 'cost_price' => 1000,
    ]);
    $item = posMenuItem();
    $item->recipes()->create(['ingredient_id' => $ing->id, 'amount' => 1, 'unit' => 'g']);
    $ing->delete(); // soft delete → recipe now points to trashed ingredient

    $this->actingAs(posStaff(['pos.view']))
        ->get('/staff/pos')
        ->assertOk();
});

test('seed sau khi soft-delete khong vi pham unique name', function () {
    $item = posMenuItem(['name' => 'Cà phê đen']);
    $item->delete(); // soft delete

    $this->artisan('db:seed');

    expect(MenuItem::withTrashed()->where('name', 'Cà phê đen')->count())->toBe(1);
});
