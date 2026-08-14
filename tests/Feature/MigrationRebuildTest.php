<?php

use Illuminate\Support\Facades\Schema;

test('migration rebuild tao cac bang chinh', function () {
    $tables = ['users', 'employees', 'customers', 'pages', 'roles', 'permissions',
        'role_permissions', 'user_roles', 'role_pages', 'menu_categories', 'menu_items',
        'tables', 'promotions', 'orders', 'order_items', 'invoices', 'payments',
        'invoice_lines', 'invoice_promotions', 'deposits', 'shifts', 'ingredients',
        'product_recipes', 'stock_vouchers', 'stock_voucher_items', 'otp_codes',
        'cache', 'jobs'];
    foreach ($tables as $table) {
        expect(Schema::hasTable($table))->toBeTrue();
    }
});

test('migration rebuild khong tao bang cu da bo', function () {
    expect(Schema::hasTable('inventory_transactions'))->toBeFalse();
    expect(Schema::hasTable('stock_checks'))->toBeFalse();
    expect(Schema::hasTable('stock_check_items'))->toBeFalse();
    expect(Schema::hasTable('reports'))->toBeFalse();
});

test('orders co invoice_id FK tro toi invoices', function () {
    expect(Schema::hasColumn('orders', 'invoice_id'))->toBeTrue();
    $indexes = collect(Schema::getIndexes('orders'))->pluck('name');
    expect($indexes->contains(fn ($i) => str_contains($i, 'invoice_id')))->toBeTrue();
});

test('stock_voucher_items co cac cot dung', function () {
    expect(Schema::hasColumns('stock_voucher_items', [
        'id', 'voucher_id', 'ingredient_id', 'quantity', 'unit_price', 'created_at', 'updated_at',
    ]))->toBeTrue();
});

test('promotion v2: 4 bang moi ton tai, legacy da xoa', function () {
    expect(Schema::hasTable('promotion_conditions'))->toBeTrue();
    expect(Schema::hasTable('promotion_actions'))->toBeTrue();
    expect(Schema::hasTable('order_promotions'))->toBeTrue();
    expect(Schema::hasTable('legacy_promotions'))->toBeFalse();
    expect(Schema::hasColumn('orders', 'promotion_id'))->toBeFalse();
});

test('promotion v2: schema cac bang dung', function () {
    expect(Schema::hasColumns('promotions', [
        'id', 'name', 'type', 'code', 'start_date', 'end_date', 'status',
        'max_usage', 'used_count', 'stackable',
    ]))->toBeTrue();
    expect(Schema::hasColumn('promotions', 'exclusive'))->toBeFalse();
    expect(Schema::hasColumns('promotion_conditions', ['id', 'promotion_id', 'cond_type', 'cond_value']))->toBeTrue();
    expect(Schema::hasColumns('promotion_actions', ['id', 'promotion_id', 'action_type', 'action_value', 'max_discount_amount']))->toBeTrue();
    expect(Schema::hasColumns('order_promotions', ['id', 'invoice_id', 'order_id', 'promotion_id', 'code_used', 'discount_applied']))->toBeTrue();
});

test('promotion v2: cot exclusive da bi xoa', function () {
    expect(Schema::hasColumn('promotions', 'exclusive'))->toBeFalse();
});
