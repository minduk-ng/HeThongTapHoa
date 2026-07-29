<?php

use App\Models\User;
use App\Models\Role;
use App\Models\Table;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('pos table list is cached and flushed on table updates', function () {
    $user = User::create([
        'name' => 'Admin User',
        'email' => 'admin@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);
    $role = Role::create(['name' => 'admin', 'is_system' => true]);
    $user->roles()->attach($role->id);

    $table = Table::create(['table_number' => 1, 'area' => 'A', 'seats' => 4, 'status' => 'empty']);

    $this->actingAs($user);

    $response = $this->get('/staff/pos');
    $response->assertStatus(200);

    // Kiểm tra tables prop trong Inertia là mảng có key tuần tự từ 0
    $pageData = $response->original->getData()['page'];
    $tablesProp = $pageData['props']['tables'];
    $array = $tablesProp instanceof \Illuminate\Support\Collection ? $tablesProp->all() : $tablesProp;
    $keys = array_keys($array);
    expect($keys)->toEqual(range(0, count($array) - 1));

    expect(Cache::tags(['pos_tables'])->has('pos_tables_list'))->toBeTrue();

    // Thay đổi trạng thái bàn để xóa cache và tải lại
    $table->update(['status' => 'occupied']);
    expect(Cache::tags(['pos_tables'])->has('pos_tables_list'))->toBeFalse();

    // Truy cập lại sau khi xóa cache và kiểm tra tiếp
    $newResponse = $this->get('/staff/pos');
    $newResponse->assertStatus(200);
    $newTablesProp = $newResponse->original->getData()['page']['props']['tables'];
    $newArray = $newTablesProp instanceof \Illuminate\Support\Collection ? $newTablesProp->all() : $newTablesProp;
    $newKeys = array_keys($newArray);
    expect($newKeys)->toEqual(range(0, count($newArray) - 1));
});

test('multi-invoice checkout releases table only when all orders are paid', function () {
    $user = User::create([
        'name' => 'Staff User',
        'email' => 'staff@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);

    $role = Role::firstOrCreate(['name' => 'admin', 'is_system' => true]);
    $user->roles()->attach($role->id);

    DB::table('employees')->insert([
        'id' => $user->id,
        'user_id' => $user->id,
        'employee_code' => 'EMP001',
        'full_name' => $user->name,
        'position' => 'Staff',
        'is_active' => true,
    ]);

    $table = Table::create([
        'table_number' => 'Bàn 01',
        'capacity' => 4,
        'area' => 'Tầng 1',
        'status' => 'occupied'
    ]);

    $order1 = App\Models\Order::create([
        'order_code' => 'BAN01-260725-01',
        'table_id' => $table->id,
        'employee_id' => $user->id,
        'status' => 'pending',
        'subtotal' => 100000,
        'vat_amount' => 10000,
        'total' => 110000,
    ]);

    $order2 = App\Models\Order::create([
        'order_code' => 'BAN01-260725-02',
        'table_id' => $table->id,
        'employee_id' => $user->id,
        'status' => 'pending',
        'subtotal' => 150000,
        'vat_amount' => 15000,
        'total' => 165000,
    ]);

    $this->actingAs($user);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $order1->id,
        'payment_method' => 'cash',
        'amount_received' => 110000,
        'change_amount' => 0,
        'idempotency_key' => 'idemp_key_1',
    ]);
    $response->assertSessionHasNoErrors();
    
    expect($order1->fresh()->status)->toEqual('paid');
    expect($table->fresh()->status)->toEqual('occupied');

    $response2 = $this->post('/staff/pos/checkout', [
        'order_id' => $order2->id,
        'payment_method' => 'cash',
        'amount_received' => 165000,
        'change_amount' => 0,
        'idempotency_key' => 'idemp_key_2',
    ]);
    $response2->assertSessionHasNoErrors();

    expect($order2->fresh()->status)->toEqual('paid');
    expect($table->fresh()->status)->toEqual('available');
});

