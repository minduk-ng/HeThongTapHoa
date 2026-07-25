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

    expect(Cache::tags(['pos_tables'])->has('pos_tables_list'))->toBeTrue();

    // Thay đổi trạng thái bàn
    $table->update(['status' => 'occupied']);
    expect(Cache::tags(['pos_tables'])->has('pos_tables_list'))->toBeFalse();
});
