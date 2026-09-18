<?php

use App\Events\CheckoutLockUpdated;
use App\Models\User;
use App\Services\POS\CheckoutLockService;
use Illuminate\Cache\RedisStore;
use Illuminate\Redis\Connections\PredisConnection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;

use function Pest\Laravel\actingAs;

function lockStaff(string $name, array $permissions = ['pos.view', 'pos.create']): User
{
    $user = posStaff($permissions, ['/staff/pos']);
    $user->update(['name' => $name]);

    return $user->fresh();
}

test('nguoi co pos.create acquire lock thanh cong 200 kem owner payload', function () {
    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);

    $response = actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id]);

    $response->assertOk()
        ->assertJsonPath('lock.user_id', $staff->id)
        ->assertJsonPath('lock.user_name', 'NhanVien A')
        ->assertJsonPath('lock.table_id', $table->id)
        ->assertJsonStructure(['lock' => ['user_id', 'user_name', 'acquired_at', 'table_id']]);
});

test('nguoi thu hai acquire cung ban bi 409 kem owner hien tai', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertStatus(409)
        ->assertJsonPath('lock.user_id', $first->id)
        ->assertJsonPath('lock.user_name', 'NhanVien A');
});

test('owner acquire lai without token cannot replace live lock', function () {
    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);

    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertStatus(409)
        ->assertJsonPath('lock.user_id', $staff->id);
});

test('stale owner token cannot release or renew a reacquired lock', function () {
    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);
    $firstToken = actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()->json('lock.owner_token');
    $this->travel(91)->seconds();
    $secondToken = actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()->json('lock.owner_token');

    expect($firstToken)->not->toBe($secondToken);
    actingAs($staff)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id, 'owner_token' => $firstToken])->assertForbidden();
    actingAs($staff)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id, 'owner_token' => $firstToken])->assertForbidden();
    actingAs($staff)->getJson("/staff/pos/checkout-lock/status?table_ids[]={$table->id}")
        ->assertJsonPath("locks.{$table->id}.owner_token", $secondToken);
});

test('owner release xong nguoi khac acquire duoc', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    $token = actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk()->json('lock.owner_token');
    actingAs($first)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id, 'owner_token' => $token])->assertOk();

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()
        ->assertJsonPath('lock.user_id', $second->id);
});

test('nguoi khong phai owner release bi 403 va lock van giu', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($second)->postJson('/staff/pos/checkout-lock/release', [
        'table_id' => $table->id, 'owner_token' => (string) Str::uuid(),
    ])->assertStatus(403);

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertStatus(409);
});

test('admin release lock cua nguoi khac duoc (privileged)', function () {
    $staff = lockStaff('NhanVien A');
    $admin = posAdmin();
    $table = posTable(['status' => 'occupied']);

    $token = actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk()->json('lock.owner_token');
    actingAs($admin)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id, 'owner_token' => $token])->assertOk();

    actingAs($admin)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
});

test('lock het TTL thi nguoi khac acquire duoc', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    $this->travel(91)->seconds();

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()
        ->assertJsonPath('lock.user_id', $second->id);
});

test('owner renew (heartbeat) gia han lock qua TTL goc', function () {
    $owner = lockStaff('NhanVien A');
    $other = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    $token = actingAs($owner)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk()->json('lock.owner_token');

    $this->travel(60)->seconds();
    actingAs($owner)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id, 'owner_token' => $token])
        ->assertOk()
        ->assertJsonPath('lock.user_id', $owner->id);

    $this->travel(60)->seconds();

    // Qua TTL goc (120s > 90s) nhung heartbeat da gia han -> owner khac van bi chan
    actingAs($other)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertStatus(409);
});

test('nguoi khac renew bi 403, renew lock khong ton tai bi 404', function () {
    $owner = lockStaff('NhanVien A');
    $other = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($other)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id, 'owner_token' => (string) Str::uuid()])->assertStatus(404);

    actingAs($owner)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($other)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id, 'owner_token' => (string) Str::uuid()])->assertStatus(403);
});

test('status tra ve lock hoac null', function () {
    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);
    $freeTable = posTable(['status' => 'available']);

    actingAs($staff)->getJson("/staff/pos/checkout-lock/status?table_ids[]={$freeTable->id}")
        ->assertOk()
        ->assertJsonPath("locks.{$freeTable->id}", null);

    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    actingAs($staff)->getJson("/staff/pos/checkout-lock/status?table_ids[]={$table->id}&table_ids[]={$freeTable->id}")
        ->assertOk()
        ->assertJsonPath("locks.{$table->id}.user_id", $staff->id)
        ->assertJsonPath("locks.{$freeTable->id}", null);
});

test('nguoi khong co pos.create bi chan acquire 403', function () {
    $table = posTable(['status' => 'occupied']);

    actingAs(posStaff([], []))
        ->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertStatus(403);
});

test('acquire broadcast su kien lock', function () {
    Event::fake([CheckoutLockUpdated::class]);

    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);

    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    Event::assertDispatched(CheckoutLockUpdated::class, fn ($event) => $event->tableId === $table->id && $event->action === 'acquired');
});

test('checkout bi 409 khi ban dang lock boi nguoi khac, owner van checkout duoc', function () {
    $owner = lockStaff('NhanVien A');
    $other = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => posMenuItem(['price' => 20000]), 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);

    actingAs($owner)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    actingAs($other)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'idempotency_key' => 'lock-checkout-other',
    ])->assertStatus(409)
        ->assertJsonPath('lock.user_id', $owner->id);

    expect($order->fresh()->status)->not->toBe('paid');

    actingAs($owner)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'idempotency_key' => 'lock-checkout-owner',
    ])->assertOk();

    expect($order->fresh()->status)->toBe('paid');
});

test('redis path goi lua eval dung dang: 2 keys roi argv (phpredis)', function () {
    Event::fake([CheckoutLockUpdated::class]);

    $prefix = 'laravel_database_';
    $key = $prefix.CheckoutLockService::key(7);
    $ownerKey = $key.':owner';
    $payload = [
        'table_id' => 7, 'user_id' => 1, 'user_name' => 'Tester',
        'acquired_at' => now()->toIso8601String(), 'owner_token' => 'tok-1',
    ];

    // phpredis branch: command('eval', [$script, $argsArray, 2]) — argsArray = [key, ownerKey, ...argv].
    $connection = Mockery::mock();
    // acquire: key, ownerKey, ttl (int), json payload, owner_token
    $connection->shouldReceive('command')->once()
        ->withArgs(fn ($method, $params) => $method === 'eval' && $params[2] === 2
            && $params[1][0] === $key && $params[1][1] === $ownerKey
            && count($params[1]) === 5 && is_int($params[1][2]))
        ->andReturn(1);
    // renew: key, ownerKey, owner_token, ttl (int), json payload
    $connection->shouldReceive('command')->once()
        ->withArgs(fn ($method, $params) => $method === 'eval' && $params[2] === 2
            && $params[1][0] === $key && $params[1][1] === $ownerKey
            && $params[1][2] === 'tok-1' && count($params[1]) === 5 && is_int($params[1][3]))
        ->andReturn(1);
    // release: key, ownerKey, owner_token
    $connection->shouldReceive('command')->once()
        ->withArgs(fn ($method, $params) => $method === 'eval' && $params[2] === 2
            && $params[1] === [$key, $ownerKey, 'tok-1'])
        ->andReturn(1);
    $connection->shouldReceive('get')->andReturn(json_encode($payload));

    $store = Mockery::mock(RedisStore::class);
    $store->shouldReceive('getPrefix')->andReturn($prefix);
    $store->shouldReceive('connection')->andReturn($connection);
    Cache::setStore($store);

    $service = new CheckoutLockService;
    expect($service->acquire(7, 1, 'Tester')['acquired'])->toBeTrue();
    expect($service->renew(7, 1, 'tok-1')['renewed'])->toBeTrue();
    expect($service->release(7, 1, 'tok-1', false)['released'])->toBeTrue();
});

test('redis path goi lua eval dung dang flat (predis)', function () {
    Event::fake([CheckoutLockUpdated::class]);

    $prefix = 'laravel_database_';
    $key = $prefix.CheckoutLockService::key(7);
    $ownerKey = $key.':owner';

    // predis branch: command('eval', [$script, 2, $key, $ownerKey, ...argv]) — flat.
    $connection = Mockery::mock(PredisConnection::class);
    $connection->shouldReceive('command')->once()
        ->withArgs(fn ($method, $params) => $method === 'eval' && $params[1] === 2
            && $params[2] === $key && $params[3] === $ownerKey
            && count($params) === 7 && is_int($params[4]))
        ->andReturn(1);

    $store = Mockery::mock(RedisStore::class);
    $store->shouldReceive('getPrefix')->andReturn($prefix);
    $store->shouldReceive('connection')->andReturn($connection);
    Cache::setStore($store);

    expect((new CheckoutLockService)->acquire(7, 1, 'Tester')['acquired'])->toBeTrue();
});
