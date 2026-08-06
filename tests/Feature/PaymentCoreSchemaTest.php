<?php

use Illuminate\Support\Facades\Schema;

test('payment core tables ton tai voi cac cot chinh', function () {
    expect(Schema::hasTable('payments'))->toBeTrue();
    expect(Schema::hasColumns('payments', ['id', 'invoice_id', 'method', 'amount', 'reference', 'received_by', 'note', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasTable('invoice_lines'))->toBeTrue();
    expect(Schema::hasColumns('invoice_lines', ['id', 'invoice_id', 'order_item_id', 'menu_item_id', 'name_snapshot', 'quantity', 'unit_price', 'subtotal', 'vat_rate', 'vat_amount', 'discount_amount', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasTable('invoice_promotions'))->toBeTrue();
    expect(Schema::hasColumns('invoice_promotions', ['id', 'invoice_id', 'promotion_id', 'code', 'name', 'discount_type', 'discount_value', 'stack_order', 'amount', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasColumns('invoices', ['subtotal_amount', 'vat_amount', 'discount_amount', 'external_no', 'external_ref']))->toBeTrue();
    expect(Schema::hasColumn('deposits', 'payment_id'))->toBeTrue();
});
