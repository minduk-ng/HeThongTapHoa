<?php

use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\MenuCategory;
use App\Models\OrderItem;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

it('creates kitchen dispatch tables with general station seed', function () {
    expect(Schema::hasTable('kitchen_stations'))->toBeTrue();
    expect(Schema::hasTable('kitchen_send_batches'))->toBeTrue();
    expect(Schema::hasTable('kitchen_work_groups'))->toBeTrue();
    expect(Schema::hasTable('kitchen_dispatch_settings'))->toBeTrue();
    expect(Schema::hasColumn('order_items', 'kitchen_work_group_id'))->toBeTrue();
    expect(Schema::hasColumn('menu_categories', 'kitchen_station_id'))->toBeTrue();
    expect(KitchenStation::where('code', 'general')->exists())->toBeTrue();
});

it('backfills unlinked pending and processing items to legacy batches and groups', function () {
    $table = posTable();
    $item1 = posMenuItem(['name' => 'Mon 1']);
    $item2 = posMenuItem(['name' => 'Mon 2']);

    $order = posOrder($table, [
        ['item' => $item1, 'qty' => 1, 'status' => 'pending'],
        ['item' => $item2, 'qty' => 2, 'status' => 'processing'],
    ], ['status' => 'pending']);

    $completedItem = OrderItem::create([
        'order_id' => $order->id,
        'menu_item_id' => $item1->id,
        'quantity' => 1,
        'unit_price' => 20000,
        'subtotal' => 20000,
        'status' => 'completed',
    ]);

    $paidOrder = posOrder($table, [
        ['item' => $item1, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'paid']);

    $draftOrder = posOrder($table, [
        ['item' => $item1, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'draft']);

    $reservedOrder = posOrder($table, [
        ['item' => $item1, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'reserved']);

    $cancelledOrder = posOrder($table, [
        ['item' => $item1, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'cancelled']);

    $exitCode = Artisan::call('kitchen:backfill-dispatch');
    expect($exitCode)->toBe(0);

    $order->refresh();
    $activeItems = $order->items->whereIn('status', ['pending', 'processing']);
    expect($activeItems)->toHaveCount(2);

    $generalStation = KitchenStation::where('code', 'general')->firstOrFail();

    foreach ($activeItems as $orderItem) {
        expect($orderItem->kitchen_work_group_id)->not->toBeNull();
        $group = $orderItem->workGroup;
        expect($group)->not->toBeNull();
        expect($group->station_id)->toBe($generalStation->id);
        expect($group->station_name)->toBe($generalStation->name);

        $batch = $group->batch;
        expect($batch)->not->toBeNull();
        expect($batch->order_id)->toBe($order->id);
        expect($batch->origin)->toBe('legacy_item');
    }

    expect($completedItem->fresh()->kitchen_work_group_id)->toBeNull();

    $paidItem = $paidOrder->items->first();
    expect($paidItem->fresh()->kitchen_work_group_id)->not->toBeNull();

    expect($draftOrder->items->first()->fresh()->kitchen_work_group_id)->toBeNull();
    expect($reservedOrder->items->first()->fresh()->kitchen_work_group_id)->toBeNull();
    expect($cancelledOrder->items->first()->fresh()->kitchen_work_group_id)->toBeNull();
});

it('is restartable and idempotent without creating duplicate batches or groups', function () {
    $table = posTable();
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'pending']);

    Artisan::call('kitchen:backfill-dispatch');
    $initialBatchCount = KitchenSendBatch::count();
    $initialGroupCount = KitchenWorkGroup::count();

    Artisan::call('kitchen:backfill-dispatch');
    expect(KitchenSendBatch::count())->toBe($initialBatchCount);
    expect(KitchenWorkGroup::count())->toBe($initialGroupCount);
});

it('loads eloquent relations correctly', function () {
    $station = KitchenStation::where('code', 'general')->firstOrFail();
    $order = posOrder(posTable(), [
        ['item' => posMenuItem(), 'qty' => 1, 'status' => 'pending'],
    ]);

    $batch = KitchenSendBatch::create([
        'order_id' => $order->id,
        'sent_at' => now(),
        'target_minutes' => 15,
        'long_wait_minutes' => 20,
        'origin' => 'send',
    ]);

    $group = KitchenWorkGroup::create([
        'batch_id' => $batch->id,
        'station_id' => $station->id,
        'station_name' => $station->name,
        'deadline_at' => now()->addMinutes(15),
        'version' => 1,
    ]);

    $orderItem = $order->items->first();
    $orderItem->update(['kitchen_work_group_id' => $group->id]);

    expect($batch->groups)->toHaveCount(1);
    expect($batch->groups->first()->id)->toBe($group->id);
    expect($group->batch->id)->toBe($batch->id);
    expect($group->station->id)->toBe($station->id);
    expect($group->items)->toHaveCount(1);
    expect($group->items->first()->id)->toBe($orderItem->id);
    expect($orderItem->workGroup->id)->toBe($group->id);

    $category = MenuCategory::create(['name' => 'Test Cat '.uniqid(), 'kitchen_station_id' => $station->id]);
    expect($category->kitchenStation->id)->toBe($station->id);
});
