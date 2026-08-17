<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;

test('nhan kho voi HSD luu quantity_remaining bang quantity', function () {
    $admin = posAdmin();
    $ing = Ingredient::create([
        'name' => 'Cà phê '.uniqid(), 'code' => 'cf'.uniqid(),
        'unit' => 'g', 'stock_quantity' => 0, 'min_stock_alert' => 50, 'cost_price' => 100,
    ]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [
            ['ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 50, 'expiry_date' => '2026-12-01'],
        ],
        'note' => 'nhap lo',
    ])->assertSessionHasNoErrors();

    $item = StockVoucherItem::where('ingredient_id', $ing->id)->first();
    expect($item->expiry_date?->toDateString())->toBe('2026-12-01');
    expect((float) $item->quantity_remaining)->toBe(100.0);
    expect((float) $ing->fresh()->stock_quantity)->toBe(100.0);
});

test('FIFO: ban dung 120g tru het lo cu truoc', function () {
    $admin = posAdmin();
    $ing = Ingredient::create([
        'name' => 'Sữa '.uniqid(), 'code' => 'su'.uniqid(),
        'unit' => 'ml', 'stock_quantity' => 100, 'min_stock_alert' => 50, 'cost_price' => 10,
    ]);

    // Tạo 2 phiếu nhập thật: lô cũ hạn 1/11 còn 100, lô mới hạn 1/12 còn 100
    $voucher1 = StockVoucher::create([
        'voucher_code' => 'PN-FIFO-'.uniqid(), 'type' => 'import', 'transacted_at' => now(),
    ]);
    $lot1 = $voucher1->items()->create([
        'ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 10,
        'expiry_date' => '2026-11-01', 'quantity_remaining' => 100,
    ]);

    $voucher2 = StockVoucher::create([
        'voucher_code' => 'PN-FIFO-'.uniqid(), 'type' => 'import', 'transacted_at' => now(),
    ]);
    $lot2 = $voucher2->items()->create([
        'ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 10,
        'expiry_date' => '2026-12-01', 'quantity_remaining' => 100,
    ]);

    // Món dùng 120g sữa → checkout trừ theo FIFO
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $item->recipes()->create(['ingredient_id' => $ing->id, 'amount' => 120, 'unit' => 'ml']);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    $this->actingAs($admin)->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    // Lô cũ (1/11) hết, lô mới (1/12) còn 80; stock giảm 120 (100 - 120 → -20)
    expect((float) $lot1->fresh()->quantity_remaining)->toBe(0.0);
    expect((float) $lot2->fresh()->quantity_remaining)->toBe(80.0);
    expect((float) $ing->fresh()->stock_quantity)->toBe(-20.0);
});

test('backfill: phieu nhap cu khong co quantity_remaining duoc gan bang quantity', function () {
    // Tạo phiếu nhập TRỰC TIẾP qua DB (giả lập dữ liệu cũ, quantity_remaining = null)
    $admin = posAdmin();
    $ing = Ingredient::create(['name' => 'Backfill '.uniqid(), 'code' => 'bf'.uniqid(), 'unit' => 'g', 'stock_quantity' => 100, 'min_stock_alert' => 50, 'cost_price' => 100]);
    $v = StockVoucher::create(['voucher_code' => 'PN-BF-001', 'type' => 'import', 'employee_id' => null, 'transacted_at' => now()->subDay(), 'created_by' => $admin->id]);
    $v->items()->create(['ingredient_id' => $ing->id, 'quantity' => 100, 'unit_price' => 50]);

    // RefreshDatabase re-runs migrations on an empty DB → backfill in up() has nothing to fill.
    // So invoke the same backfill query directly to verify it works.
    \Illuminate\Support\Facades\DB::table('stock_voucher_items')
        ->join('stock_vouchers', 'stock_vouchers.id', '=', 'stock_voucher_items.voucher_id')
        ->where('stock_vouchers.type', 'import')
        ->whereNull('stock_voucher_items.quantity_remaining')
        ->update(['stock_voucher_items.quantity_remaining' => \Illuminate\Support\Facades\DB::raw('stock_voucher_items.quantity')]);

    $item = StockVoucherItem::where('ingredient_id', $ing->id)->first();
    expect((float) $item->quantity_remaining)->toBe(100.0);
});
