<?php

use App\Models\OrderItem;

test('dashboard kds dem processing la dang che bien va completed la xong', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'processing'],
        ['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed'],
    ], ['status' => 'processing']);

    $service = new App\Services\Manager\DashboardService;
    $today = \Carbon\Carbon::today();
    $ops = $service->liveOperations('today');

    expect($ops['kds']['pending_count'])->toBe(1);
    expect($ops['kds']['completed_count'])->toBe(1);
});
