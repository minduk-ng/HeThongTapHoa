<?php

use App\Models\MenuCategory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;

test('sendToKitchen tinh gia tu menu_items.price, bo qua unit_price client', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $item = posMenuItem(['price' => 25000]);  // giá DB
    $table = posTable();

    // Client cố tình gửi unit_price=1, subtotal=1, total=1
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 2, 'unit_price' => 1, 'note' => null]],
        'subtotal' => 1,
        'vat_amount' => 0,
        'total' => 1,
    ]);

    $orderItem = OrderItem::latest()->first();
    expect($orderItem->unit_price)->toBe(25000.0);
    expect($orderItem->subtotal)->toBe(50000.0);

    $order = $orderItem->order;
    expect((float) $order->subtotal)->toBe(50000.0);
    expect((float) $order->total)->toBe(50000.0);
});

test('sendToKitchen moi order moi duoc tao voi gia dung', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $item = posMenuItem(['price' => 30000]);
    $table = posTable();

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 3, 'unit_price' => 0, 'note' => null]],
        'subtotal' => 0,
        'vat_amount' => 0,
        'total' => 0,
    ]);

    $order = Order::latest()->first();
    expect((float) $order->subtotal)->toBe(90000.0);
    expect(OrderItem::where('order_id', $order->id)->first()->unit_price)->toBe(30000.0);
});

test('sendToKitchen tu choi menu_item_id da bi xoa mem', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $item = posMenuItem();
    $item->delete(); // soft delete

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => posTable()->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertSessionHasErrors('items.0.menu_item_id');

    expect(OrderItem::count())->toBe(0);
});

test('validatePromotion tinh subtotal tu gia menu, bo qua unit_price client', function () {
    $cat = MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = Promotion::create([
        'code' => 'X'.uniqid(),
        'name' => 'Promo',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'item',
        'target_value' => $itemA->id,
        'is_active' => true,
    ]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 1,   // client gửi sai
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 1],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 1],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000, 'total' => 390000]);
});
