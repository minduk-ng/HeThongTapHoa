<?php

use App\Events\OrderSentToKitchen;
use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\MenuCategory;
use App\Models\OrderItem;
use App\Services\KitchenDispatchService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

it('keeps frozen station on existing groups after category remap; new batches use new mapping', function () {
    $stationBar = KitchenStation::create(['code' => 'bar-remap', 'name' => 'Bar Remap', 'is_active' => true]);
    $stationCold = KitchenStation::create(['code' => 'cold-remap', 'name' => 'Cold Remap', 'is_active' => true]);
    $category = MenuCategory::create(['name' => 'Drinks Remap '.uniqid(), 'kitchen_station_id' => $stationBar->id]);
    $drink = posMenuItem(['name' => 'Drink Remap', 'category_id' => $category->id]);
    $table = posTable();
    $staff = posStaff(['pos.create'], ['/staff/pos']);

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $drink->id, 'quantity' => 1]],
    ])->assertRedirect();

    $batch = KitchenSendBatch::firstOrFail();
    $frozenGroup = KitchenWorkGroup::where('batch_id', $batch->id)->firstOrFail();
    expect($frozenGroup->station_id)->toBe($stationBar->id);
    expect($frozenGroup->station_name)->toBe('Bar Remap');

    // Remap category via permission-checked endpoint (future batches only)
    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)->patchJson("/staff/kitchen/categories/{$category->id}/station", [
        'kitchen_station_id' => $stationCold->id,
    ])->assertOk()->assertJsonPath('category.kitchen_station_id', $stationCold->id);

    // Existing group keeps frozen station identity
    $frozenGroup->refresh();
    expect($frozenGroup->station_id)->toBe($stationBar->id);
    expect($frozenGroup->station_name)->toBe('Bar Remap');

    // New send on same order uses the new mapping in a new batch
    $order = $batch->order;
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'order_id' => $order->id,
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $drink->id, 'quantity' => 1]],
    ])->assertRedirect();

    expect(KitchenSendBatch::count())->toBe(2);
    $newGroup = KitchenWorkGroup::where('batch_id', '!=', $batch->id)->firstOrFail();
    expect($newGroup->station_id)->toBe($stationCold->id);
    expect($newGroup->station_name)->toBe('Cold Remap');

    // Unauthorized mapping is rejected
    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->patchJson("/staff/kitchen/categories/{$category->id}/station", [
            'kitchen_station_id' => $stationBar->id,
        ])->assertForbidden();
});

it('rejects mapping to disabled or unknown stations', function () {
    $disabled = KitchenStation::create(['code' => 'off-st', 'name' => 'Off', 'is_active' => false]);
    $category = MenuCategory::create(['name' => 'Cat Off '.uniqid()]);
    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);

    $this->actingAs($manager)->patchJson("/staff/kitchen/categories/{$category->id}/station", [
        'kitchen_station_id' => $disabled->id,
    ])->assertStatus(422);

    $this->actingAs($manager)->patchJson("/staff/kitchen/categories/{$category->id}/station", [
        'kitchen_station_id' => 999999,
    ])->assertStatus(422);

    $this->actingAs($manager)->patchJson('/staff/kitchen/categories/999999/station', [
        'kitchen_station_id' => null,
    ])->assertNotFound();
});

it('applies settings changes to new batches only, keeps defaults 15/20 and versioning', function () {
    $service = app(KitchenDispatchService::class);
    $initial = $service->getSettings();
    expect($initial['target_minutes'])->toBe(15);
    expect($initial['long_wait_minutes'])->toBe(20);

    $table = posTable();
    $item = posMenuItem();
    $staff = posStaff(['pos.create'], ['/staff/pos']);
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertRedirect();

    $oldBatch = KitchenSendBatch::firstOrFail();
    expect($oldBatch->target_minutes)->toBe(15);
    expect($oldBatch->long_wait_minutes)->toBe(20);

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);

    // Unauthorized settings write is rejected
    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->patchJson('/staff/kitchen/settings', [
            'target_minutes' => 10,
            'long_wait_minutes' => 30,
            'expected_version' => $initial['version'],
        ])->assertForbidden();

    // Invalid values rejected
    $this->actingAs($manager)->patchJson('/staff/kitchen/settings', [
        'target_minutes' => 0,
        'long_wait_minutes' => 30,
        'expected_version' => $initial['version'],
    ])->assertStatus(422);

    // Stale version rejected
    $this->actingAs($manager)->patchJson('/staff/kitchen/settings', [
        'target_minutes' => 10,
        'long_wait_minutes' => 30,
        'expected_version' => $initial['version'] + 99,
    ])->assertStatus(409);

    // Valid change bumps version
    $this->actingAs($manager)->patchJson('/staff/kitchen/settings', [
        'target_minutes' => 10,
        'long_wait_minutes' => 30,
        'expected_version' => $initial['version'],
    ])->assertOk()->assertJsonPath('settings.target_minutes', 10)
        ->assertJsonPath('settings.long_wait_minutes', 30)
        ->assertJsonPath('settings.version', $initial['version'] + 1);

    // Old batch snapshot untouched; new batch uses new snapshot
    expect($oldBatch->fresh()->target_minutes)->toBe(15);
    expect($oldBatch->fresh()->long_wait_minutes)->toBe(20);
    expect($oldBatch->fresh()->groups->first()->deadline_at->equalTo(
        $oldBatch->sent_at->copy()->addMinutes(15)
    ))->toBeTrue();

    // Distinct quantity avoids the 5s send fingerprint dedupe (no idempotency key)
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 2]],
    ])->assertRedirect();

    expect(KitchenSendBatch::count())->toBe(2);
    $newBatch = KitchenSendBatch::orderBy('id', 'desc')->firstOrFail();
    expect($newBatch->target_minutes)->toBe(10);
    expect($newBatch->long_wait_minutes)->toBe(30);
});

it('exposes readiness gate: unlinked pending blocks ready, backfill restores it', function () {
    $service = app(KitchenDispatchService::class);
    $table = posTable();
    $item = posMenuItem();

    // Direct legacy-style rows without dispatch linkage
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'pending'],
    ], ['status' => 'pending']);

    $readiness = $service->queueReadiness();
    expect($readiness['ready'])->toBeFalse();
    expect($readiness['unlinkedCount'])->toBeGreaterThanOrEqual(1);

    // Projection must not silently include unlinked work
    expect($service->projectPending())->toBeEmpty();

    // Index exposes the gate state instead of omitting silently
    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->get('/staff/kitchen')
        ->assertInertia(fn ($page) => $page
            ->component('staff/kitchen/KitchenDisplay')
            ->has('kitchenReadiness')
            ->where('kitchenReadiness.ready', false)
            ->has('stations')
            ->has('dispatchSettings')
            ->has('categoryStations')
        );

    expect(Artisan::call('kitchen:backfill-dispatch'))->toBe(0);

    $after = $service->queueReadiness();
    expect($after)->toMatchArray(['ready' => true, 'unlinkedCount' => 0]);
    expect($order->items->first()->fresh()->kitchen_work_group_id)->not->toBeNull();
    expect($service->projectPending())->not->toBeEmpty();
});

it('broadcasts deadline updates only after commit, never on rollback', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();
    $service = app(KitchenDispatchService::class);
    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);

    // Successful commit dispatches exactly the deadline_updated broadcast
    Event::fake([OrderSentToKitchen::class]);
    $service->updateDeadline(
        $group->id,
        now()->addMinutes(25)->toIso8601String(),
        'after-commit ok',
        $group->version,
        $manager->id
    );
    Event::assertDispatched(OrderSentToKitchen::class, fn ($e) => $e->actionType === 'deadline_updated');

    // Outer rollback must suppress the broadcast (fails on pre-fix in-transaction dispatch)
    Event::fake([OrderSentToKitchen::class]);
    $group->refresh();

    DB::beginTransaction();
    try {
        $service->updateDeadline(
            $group->id,
            now()->addMinutes(35)->toIso8601String(),
            'rolled back',
            $group->version,
            $manager->id
        );
        throw new RuntimeException('outer rollback probe');
        DB::commit();
    } catch (RuntimeException) {
        DB::rollBack();
    }

    Event::assertNotDispatched(OrderSentToKitchen::class, fn ($e) => $e->actionType === 'deadline_updated');

    // Paid orders still complete via item-level action contract
    $order = $group->batch->order;
    $order->update(['status' => 'paid']);
    $pendingItem = OrderItem::where('kitchen_work_group_id', $group->id)->firstOrFail();

    $kitchenStaff = posStaff(['kitchen.update'], ['/staff/kitchen']);
    $this->actingAs($kitchenStaff)->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$pendingItem->id],
    ])->assertOk();
    expect($pendingItem->fresh()->status)->toBe('completed');
});
