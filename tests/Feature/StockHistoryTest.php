<?php

test('lich su: dung so du chay sau moi giao dich', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Hs '.uniqid(), 'code' => 'hs'.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'min_stock_alert' => 5, 'cost_price' => 100]);
    // tạo phiếu import +10, export -4
    $v1 = \App\Models\StockVoucher::create(['voucher_code' => 'PN-TEST-001', 'type' => 'import', 'transacted_at' => now()->subHour(), 'created_by' => $admin->id]);
    $v1->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 50, 'quantity_remaining' => 10]);
    $v2 = \App\Models\StockVoucher::create(['voucher_code' => 'PX-TEST-001', 'type' => 'export', 'transacted_at' => now(), 'created_by' => $admin->id]);
    $v2->items()->create(['ingredient_id' => $ing->id, 'quantity' => -4, 'unit_price' => null, 'quantity_remaining' => null]);

    $res = $this->actingAs($admin)->get('/inventory/history?ingredient_id='.$ing->id);
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows', fn ($rows) => count($rows) === 2 && (float) $rows[0]['balance'] === 10.0 && (float) $rows[1]['balance'] === 6.0));
});
