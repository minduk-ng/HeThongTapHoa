<?php

use App\Events\CheckoutLockUpdated;
use App\Models\User;
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

test('owner acquire lai van 200 (idempotent)', function () {
    $staff = lockStaff('NhanVien A');
    $table = posTable(['status' => 'occupied']);

    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()
        ->assertJsonPath('lock.user_id', $staff->id);
});

test('owner release xong nguoi khac acquire duoc', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($first)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id])->assertOk();

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])
        ->assertOk()
        ->assertJsonPath('lock.user_id', $second->id);
});

test('nguoi khong phai owner release bi 403 va lock van giu', function () {
    $first = lockStaff('NhanVien A');
    $second = lockStaff('NhanVien B');
    $table = posTable(['status' => 'occupied']);

    actingAs($first)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($second)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id])->assertStatus(403);

    actingAs($second)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertStatus(409);
});

test('admin release lock cua nguoi khac duoc (privileged)', function () {
    $staff = lockStaff('NhanVien A');
    $admin = posAdmin();
    $table = posTable(['status' => 'occupied']);

    actingAs($staff)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($admin)->postJson('/staff/pos/checkout-lock/release', ['table_id' => $table->id])->assertOk();

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

    actingAs($owner)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();

    $this->travel(60)->seconds();
    actingAs($owner)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id])
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

    actingAs($other)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id])->assertStatus(404);

    actingAs($owner)->postJson('/staff/pos/checkout-lock/acquire', ['table_id' => $table->id])->assertOk();
    actingAs($other)->postJson('/staff/pos/checkout-lock/renew', ['table_id' => $table->id])->assertStatus(403);
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
    ])->assertStatus(409)
        ->assertJsonPath('lock.user_id', $owner->id);

    expect($order->fresh()->status)->not->toBe('paid');

    actingAs($owner)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
    ])->assertOk();

    expect($order->fresh()->status)->toBe('paid');
});
