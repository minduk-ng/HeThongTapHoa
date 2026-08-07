<?php

use Illuminate\Support\Facades\Schema;

test('migration them index cot date cho bang bao cao', function () {
    expect(Schema::hasIndex('invoices', 'invoices_issued_at_index'))->toBeTrue();
    expect(Schema::hasIndex('orders', 'orders_created_at_index'))->toBeTrue();
    expect(Schema::hasIndex('orders', 'orders_updated_at_index'))->toBeTrue();
    expect(Schema::hasIndex('order_items', 'order_items_cancelled_at_index'))->toBeTrue();
    expect(Schema::hasIndex('deposits', 'deposits_created_at_index'))->toBeTrue();
});

test('down() xoa cac index khi rollback', function () {
    $this->artisan('migrate:rollback', ['--step' => 1]);

    expect(Schema::hasIndex('invoices', 'invoices_issued_at_index'))->toBeFalse();
    expect(Schema::hasIndex('orders', 'orders_created_at_index'))->toBeFalse();
    expect(Schema::hasIndex('orders', 'orders_updated_at_index'))->toBeFalse();
    expect(Schema::hasIndex('order_items', 'order_items_cancelled_at_index'))->toBeFalse();
    expect(Schema::hasIndex('deposits', 'deposits_created_at_index'))->toBeFalse();
});
