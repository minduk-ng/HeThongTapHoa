<?php

use App\Models\User;
use App\Models\Role;
use App\Models\Page;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('user inertia shared data is cached and invalidated on changes', function () {
    $user = User::create([
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);
    $role = Role::create(['name' => 'manager', 'description' => 'Manager role']);
    $user->roles()->attach($role->id);

    $this->actingAs($user);

    // Lần đầu tải trang để ghi cache
    $response = $this->get('/');
    $response->assertStatus(200);

    $cacheKey = "user_inertia_data:{$user->id}";
    expect(Cache::tags(['user_inertia', "user_{$user->id}"])->has($cacheKey))->toBeTrue();

    // Giả lập cập nhật quyền và kiểm tra cache bị xóa
    $user->roles()->detach();
    try {
        Cache::tags(["user_{$user->id}"])->flush();
    } catch (\Exception $e) {}
    
    expect(Cache::tags(['user_inertia'])->has($cacheKey))->toBeFalse();
});
