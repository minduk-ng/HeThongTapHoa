<?php

use App\Models\Ingredient;
use App\Models\InvoiceLine;
use App\Models\Payment;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;

test('refund mot phan dong tao payment am va tra kho', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $coffee = Ingredient::create(['code' => 'cf', 'name' => 'Cafe', 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 10000]);
    $v = StockVoucher::create(['voucher_code' => 'PN-RF-1', 'type' => 'import', 'transacted_at' => now()]);
    $v->items()->create(['ingredient_id' => $coffee->id, 'quantity' => 100, 'unit_price' => 10000, 'quantity_remaining' => 100]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $coffee->id, 'amount' => 25, 'unit' => 'g']);

    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 100000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $this->actingAs($admin)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
        'reason' => 'Hàng lỗi',
    ])->assertOk();

    expect(InvoiceLine::find($line->id)->refunded_qty)->toBe(1);
    $payment = Payment::where('invoice_id', $invoice->id)->where('amount', '<', 0)->first();
    expect($payment)->not->toBeNull();
    expect($payment->amount)->toBe(-50000.0);

    // kho: 25g hoàn về (đã trừ 50g lúc checkout từ stock_quantity=0)
    expect((float) $coffee->fresh()->stock_quantity)->toBe(-25.0);
});

test('khong hoan qua so luong da mua', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 10000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 10000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 10000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $this->actingAs($admin)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 2]],
        'reason' => 'Khách hủy',
    ])->assertStatus(422);
});
