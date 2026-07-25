<?php

use App\Models\User;
use App\Models\Role;
use App\Models\Table;
use Illuminate\Support\Facades\Cache;
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

