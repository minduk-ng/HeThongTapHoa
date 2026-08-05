<?php

use App\Models\Invoice;

test('backfill dien payments va invoice_lines tu hoa don cu', function () {
    $this->actingAs(posAdmin());
    // Tạo invoice + order theo flow ngày xưa (không có lines)
    $table = posTable();
    $item = posMenuItem(['name' => 'Cf', 'price' => 30000]);
    $invoice = Invoice::create([
        'invoice_code' => 'OLD1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 26000, 'change_amount' => 0, 'total_amount' => 26000,
    ]);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'paid', 'invoice_id' => $invoice->id, 'discount_amount' => 4000]);
    $orderItem = $order->items->first();
    $orderItem->update(['discount_amount' => 4000]);

    // RefreshDatabase đã migrate schema từ trước (migrate = no-op), nên backfill phải chạy SAU khi seed data cũ.
    $backfill = require database_path('migrations/2026_08_05_000002_backfill_payment_core_tables.php');
    $backfill->up();

    $invoice->refresh();
    expect($invoice->payments)->toHaveCount(1);
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->lines->first()->name_snapshot)->toBe('Cf');
    expect((float) $invoice->lines->first()->discount_amount)->toBe(4000.0);
});
