<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;

test('reseed keeps existing root and strips admin from non roots', function () {
    config()->set('services.admin.email', 'first-root@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
    $root = User::where('email', 'first-root@example.com')->firstOrFail();
    $other = User::factory()->create(['email' => 'new-env@example.com']);
    $other->roles()->attach(Role::where('name', 'admin')->firstOrFail());

    config()->set('services.admin.email', 'new-env@example.com');
    $this->seed(AuthorizationSeeder::class);

    expect($root->fresh()->is_root_admin)->toBeTrue()
        ->and($root->fresh()->hasRole('admin'))->toBeTrue()
        ->and($other->fresh()->is_root_admin)->toBeFalse()
        ->and($other->fresh()->hasRole('admin'))->toBeFalse();
});

test('multiple roots abort seeding', function () {
    config()->set('services.admin.email', 'configured@example.com');
    config()->set('services.admin.default_password', 'password123');
    User::factory()->count(2)->create(['is_root_admin' => true]);

    expect(fn () => $this->seed(AuthorizationSeeder::class))->toThrow(RuntimeException::class, 'expected exactly one root');
});

test('cashier reseed removes stale dangerous permission and is idempotent', function () {
    config()->set('services.admin.email', 'root@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
    $cashier = Role::where('name', 'cashier')->firstOrFail();
    $dangerous = Permission::where('name', 'roles.delete')->firstOrFail();
    $cashier->permissions()->attach($dangerous);

    $this->seed(AuthorizationSeeder::class);
    $this->seed(AuthorizationSeeder::class);

    expect($cashier->fresh()->permissions()->where('name', 'roles.delete')->exists())->toBeFalse();
});

test('guest role has dashboard.view permission and can access homepage', function () {
    config()->set('services.admin.email', 'root@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);

    $guestRole = Role::where('name', 'guest')->firstOrFail();
    expect($guestRole->permissions()->where('name', 'dashboard.view')->exists())->toBeTrue();

    $user = User::factory()->create(['email' => 'guest@example.com']);
    $user->roles()->attach($guestRole);

    $this->actingAs($user)
        ->get('/')
        ->assertOk();
});
