<?php

use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\MenuCategory;
use App\Models\Order;
use App\Models\OrderActivity;
use App\Models\OrderItem;
use App\Services\KitchenDispatchService;
use Inertia\Testing\AssertableInertia as Assert;

it('creates one batch per send and partitions new items by station', function () {
    $stationBar = KitchenStation::create([
        'code' => 'bar',
        'name' => 'Bar Pha Chế',
        'is_active' => true,
    ]);

    $categoryBar = MenuCategory::create([
        'name' => 'Đồ uống',
        'kitchen_station_id' => $stationBar->id,
    ]);

    $categoryGeneral = MenuCategory::create([
        'name' => 'Món ăn',
        'kitchen_station_id' => null,
    ]);

    $drink = posMenuItem(['name' => 'Trà đào', 'category_id' => $categoryBar->id]);
    $food = posMenuItem(['name' => 'Bánh mì', 'category_id' => $categoryGeneral->id]);
    $table = posTable();

    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [
                ['menu_item_id' => $drink->id, 'quantity' => 2, 'note' => 'Ít đường'],
                ['menu_item_id' => $food->id, 'quantity' => 1],
            ],
        ])
        ->assertRedirect();

    expect(KitchenSendBatch::count())->toBe(1);
    expect(KitchenWorkGroup::count())->toBe(2);

    $batch = KitchenSendBatch::firstOrFail();
    expect($batch->origin)->toBe('send');
    expect($batch->target_minutes)->toBe(15);
    expect($batch->long_wait_minutes)->toBe(20);

    $barGroup = KitchenWorkGroup::where('batch_id', $batch->id)
        ->where('station_id', $stationBar->id)
        ->firstOrFail();
    expect($barGroup->station_name)->toBe('Bar Pha Chế');
    expect($barGroup->version)->toBe(1);

    $generalStation = KitchenStation::where('code', 'general')->firstOrFail();
    $generalGroup = KitchenWorkGroup::where('batch_id', $batch->id)
        ->where('station_id', $generalStation->id)
        ->firstOrFail();

    $drinkItem = OrderItem::where('menu_item_id', $drink->id)->firstOrFail();
    $foodItem = OrderItem::where('menu_item_id', $food->id)->firstOrFail();

    expect($drinkItem->kitchen_work_group_id)->toBe($barGroup->id);
    expect($foodItem->kitchen_work_group_id)->toBe($generalGroup->id);
});

it('creates a new batch for subsequent addition on existing order', function () {
    $table = posTable();
    $item = posMenuItem();
    $staff = posStaff(['pos.create'], ['/staff/pos']);

    $this->actingAs($staff)
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ])
        ->assertRedirect();

    $order = Order::latest()->firstOrFail();
    expect(KitchenSendBatch::count())->toBe(1);

    $this->actingAs($staff)
        ->post('/staff/pos/send-to-kitchen', [
            'order_id' => $order->id,
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 2]],
        ])
        ->assertRedirect();

    expect(KitchenSendBatch::count())->toBe(2);
    expect(KitchenSendBatch::where('order_id', $order->id)->count())->toBe(2);
});

it('does not create a batch on reduction-only request', function () {
    $table = posTable();
    $item = posMenuItem();
    $staff = posStaff(['pos.create', 'orders.cancel'], ['/staff/pos']);

    $order = posOrder($table, [
        ['item' => $item, 'qty' => 3, 'status' => 'pending'],
    ], ['status' => 'pending']);
    $orderItem = $order->items->first();

    $batchCountBefore = KitchenSendBatch::count();

    $this->actingAs($staff)
        ->post('/staff/pos/send-to-kitchen', [
            'order_id' => $order->id,
            'table_id' => $table->id,
            'reduced_items' => [
                [
                    'order_item_id' => $orderItem->id,
                    'reduce_quantity' => 1,
                    'cancellation_reason' => 'Khách đổi ý',
                ],
            ],
        ])
        ->assertRedirect();

    expect(KitchenSendBatch::count())->toBe($batchCountBefore);
});

it('rejects deadline edit without permission', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();

    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => now()->addMinutes(5)->toIso8601String(),
            'reason' => 'VIP',
            'expected_version' => 1,
        ])
        ->assertForbidden();
});

it('allows deadline edit with kitchen.dispatch.manage permission, writes audit and bumps version', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();
    $newDeadline = now()->addMinutes(25)->toIso8601String();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $response = $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => $newDeadline,
            'reason' => 'Khách VIP ưu tiên',
            'expected_version' => 1,
        ])
        ->assertOk();

    $group->refresh();
    expect($group->version)->toBe(2);
    expect($group->deadline_at->toIso8601String())->toBe(Carbon\Carbon::parse($newDeadline)->toIso8601String());

    $audit = OrderActivity::where('action', 'kitchen_deadline_changed')->firstOrFail();
    expect($audit->user_id)->toBe($manager->id);
    expect($audit->meta['reason'])->toBe('Khách VIP ưu tiên');
    expect($audit->meta['group_id'])->toBe($group->id);

    // Verify response shape
    $response->assertJsonPath('version', 2);
});

it('rejects stale version edit with 409 conflict', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => now()->addMinutes(10)->toIso8601String(),
            'reason' => 'Stale test',
            'expected_version' => 999,
        ])
        ->assertStatus(409);
});

it('rejects terminal group edit with 409 conflict', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();
    $order = $group->batch->order;
    $order->update(['status' => 'cancelled']);

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => now()->addMinutes(10)->toIso8601String(),
            'reason' => 'Terminal test',
            'expected_version' => 1,
        ])
        ->assertStatus(409);
});

it('rejects invalid deadline timestamp without timezone with 422', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => '2026-10-16 12:00:00', // Missing timezone
            'reason' => 'No timezone',
            'expected_version' => 1,
        ])
        ->assertStatus(422);
});

it('no-op deadline submission returns unchanged state without audit', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();
    $existingDeadline = $group->deadline_at->toIso8601String();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => $existingDeadline,
            'reason' => 'No op change',
            'expected_version' => 1,
        ])
        ->assertOk();

    $group->refresh();
    expect($group->version)->toBe(1);
    expect(OrderActivity::where('action', 'kitchen_deadline_changed')->count())->toBe(0);
});

it('projects pending queue groups matching QueueGroup shape', function () {
    $table = posTable();
    $item1 = posMenuItem(['name' => 'Mon 1']);
    $item2 = posMenuItem(['name' => 'Mon 2']);

    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [
                ['menu_item_id' => $item1->id, 'quantity' => 2, 'note' => 'Ghi chu 1'],
                ['menu_item_id' => $item2->id, 'quantity' => 1],
            ],
        ]);

    $service = app(KitchenDispatchService::class);
    $groups = $service->projectPending();

    expect($groups)->toBeArray();
    expect(count($groups))->toBe(1);

    $group = $groups[0];
    expect($group)->toHaveKeys([
        'id', 'batchId', 'orderId', 'stationId', 'stationName',
        'sentAt', 'deadlineAt', 'targetMinutes', 'longWaitMinutes',
        'version', 'origin', 'items',
    ]);
    expect($group['origin'])->toBe('send');
    expect($group['targetMinutes'])->toBe(15);
    expect($group['longWaitMinutes'])->toBe(20);
    expect(count($group['items']))->toBe(2);
    expect($group['items'][0])->toHaveKeys(['id', 'name', 'quantity', 'status', 'note']);

    // Complete item1 and cancel item2 -> group disappears
    $items = OrderItem::where('kitchen_work_group_id', $group['id'])->get();
    $items[0]->update(['status' => 'completed']);
    $items[1]->update(['status' => 'cancelled']);

    $remainingGroups = $service->projectPending();
    expect($remainingGroups)->toBeEmpty();
});

it('includes workGroups and serverNow in kitchen display index', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);

    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->get('/staff/kitchen')
        ->assertInertia(fn (Assert $page) => $page
            ->component('staff/kitchen/KitchenDisplay')
            ->has('orders')
            ->has('stats')
            ->has('workGroups')
            ->has('serverNow')
        );
});

it('allows setting past deadline for urgency', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();
    $pastDeadline = now()->subMinutes(10)->toIso8601String();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => $pastDeadline,
            'reason' => 'Khách đã đợi quá lâu, cần làm gấp',
            'expected_version' => 1,
        ])
        ->assertOk();

    $group->refresh();
    expect($group->version)->toBe(2);
});

it('rejects whitespace or empty reason with 422', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        ]);
    $group = KitchenWorkGroup::firstOrFail();

    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", [
            'deadline_at' => now()->addMinutes(10)->toIso8601String(),
            'reason' => '   ',
            'expected_version' => 1,
        ])
        ->assertStatus(422);
});

it('returns 404 for absent work group', function () {
    $manager = posStaff(['kitchen.dispatch.manage'], ['/staff/kitchen']);
    $this->actingAs($manager)
        ->patchJson('/staff/kitchen/work-groups/99999/deadline', [
            'deadline_at' => now()->addMinutes(10)->toIso8601String(),
            'reason' => 'Absent test',
            'expected_version' => 1,
        ])
        ->assertNotFound();
});

it('suppresses duplicate batch and groups on idempotent replay', function () {
    $table = posTable();
    $item = posMenuItem();
    $staff = posStaff(['pos.create'], ['/staff/pos']);
    $idempotencyKey = 'idem-send-test-123';

    $payload = [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 2]],
        'idempotency_key' => $idempotencyKey,
    ];

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', $payload)->assertRedirect();
    expect(KitchenSendBatch::count())->toBe(1);
    expect(KitchenWorkGroup::count())->toBe(1);

    // Replay with identical idempotency key
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', $payload)->assertRedirect();
    expect(KitchenSendBatch::count())->toBe(1);
    expect(KitchenWorkGroup::count())->toBe(1);
});

it('filters projectPending by stationId and includes paid orders with pending items', function () {
    $stationBar = KitchenStation::create(['code' => 'bar2', 'name' => 'Bar 2', 'is_active' => true]);
    $categoryBar = MenuCategory::create(['name' => 'Cocktails', 'kitchen_station_id' => $stationBar->id]);
    $categoryFood = MenuCategory::create(['name' => 'Món nóng', 'kitchen_station_id' => null]);

    $drink = posMenuItem(['name' => 'Mojito', 'category_id' => $categoryBar->id]);
    $food = posMenuItem(['name' => 'Phở', 'category_id' => $categoryFood->id]);
    $table = posTable();

    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', [
            'table_id' => $table->id,
            'items' => [
                ['menu_item_id' => $drink->id, 'quantity' => 1],
                ['menu_item_id' => $food->id, 'quantity' => 1],
            ],
        ]);

    $service = app(KitchenDispatchService::class);
    $allGroups = $service->projectPending();
    expect(count($allGroups))->toBe(2);

    $barGroups = $service->projectPending($stationBar->id);
    expect(count($barGroups))->toBe(1);
    expect($barGroups[0]['stationId'])->toBe($stationBar->id);

    // Mark order as paid - work group should STILL appear because items are pending!
    $order = Order::latest()->firstOrFail();
    $order->update(['status' => 'paid']);

    $paidPendingGroups = $service->projectPending();
    expect(count($paidPendingGroups))->toBe(2);

    // Partial item update preserves group identity and deadline
    $initialDeadline = $barGroups[0]['deadlineAt'];
    $drinkItem = OrderItem::where('menu_item_id', $drink->id)->firstOrFail();
    $drinkItem->update(['quantity' => 3]);

    $refreshedBar = $service->projectPending($stationBar->id);
    expect(count($refreshedBar))->toBe(1);
    expect($refreshedBar[0]['id'])->toBe($barGroups[0]['id']);
    expect($refreshedBar[0]['deadlineAt'])->toBe($initialDeadline);
    expect($refreshedBar[0]['items'][0]['quantity'])->toBe(3);
});
