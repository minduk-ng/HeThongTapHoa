<?php

use App\Events\ItemsReadyToServe;
use App\Events\ItemsServed;
use App\Events\OrderCompleted;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Events\TableTransferred;
use Illuminate\Support\Facades\Event;

function privateChannelNames(object $event): array
{
    return collect($event->broadcastOn())
        ->map(fn ($ch) => [$ch::class, $ch->name])
        ->all();
}

// PrivateChannel('pos-channel')->name = 'private-pos-channel' (wire name mà Echo.private('pos-channel') đăng ký)
function assertPrivateChannel($ch, string $wireName): bool
{
    return $ch instanceof \Illuminate\Broadcasting\PrivateChannel && $ch->name === $wireName;
}

test('event checkout dispatch den private channel de client nhan duoc', function () {
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed'],
    ], ['status' => 'completed']);
    // Đơn thứ 2 còn hoạt động → bàn không được nhả → TableStatusUpdated vẫn dispatch
    posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    Event::fake([TableStatusUpdated::class]);
    $this->actingAs(posAdmin())->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
    ])->assertOk();

    Event::assertDispatched(TableStatusUpdated::class, fn ($e) => collect($e->broadcastOn())->contains(
        fn ($ch) => assertPrivateChannel($ch, 'private-pos-channel')
    ));
});

test('moi event POS broadcast tren private channel dung ten', function () {
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $cases = [
        [new ItemsServed([1], [1], 'B1', 1), ['private-pos-channel']],
        [new ItemsReadyToServe($order, $order->items), ['private-pos-channel']],
        [new TableStatusUpdated($table, 'checkout'), ['private-pos-channel']],
        [new OrderCompleted($order), ['private-pos-channel', 'private-kitchen-channel']],
        [new TableTransferred($table, $table, 'transfer'), ['private-pos-channel', 'private-kitchen-channel']],
        [new OrderSentToKitchen($order), ['private-kitchen-channel', 'private-pos-channel']],
    ];

    foreach ($cases as [$event, $expect]) {
        $actual = privateChannelNames($event);

        foreach ($expect as $wireName) {
            expect($actual)->toContain(['Illuminate\Broadcasting\PrivateChannel', $wireName]);
        }
    }
});
