<?php

use App\Models\Permission;
use App\Models\Role;

test('non root cannot assign admin role to self', function () {
    $user = posStaff(['users.edit'], ['/admin/permissions']);
    Role::firstOrCreate(['name' => 'admin'], ['description' => 'Admin', 'is_system' => true]);

    $this->actingAs($user)->put("/admin/permissions/{$user->id}", [
        'roles' => ['admin'],
    ])->assertForbidden();

    expect($user->fresh()->isAdmin())->toBeFalse();
});

test('root admin flag is not mass assignable', function () {
    $admin = posAdmin();
    $admin->fill(['is_root_admin' => true])->save();
    expect((bool) $admin->fresh()->is_root_admin)->toBeFalse();
});

test('non root cannot assign role granting permissions outside grant scope', function () {
    $actor = posStaff(['users.edit'], ['/admin/permissions']);
    $target = posStaff([], []);

    $cashier = Role::firstOrCreate(['name' => 'cashier'], ['description' => 'Cashier', 'is_system' => false]);
    $perm = Permission::firstOrCreate(['name' => 'suppliers.pay']);
    $cashier->permissions()->syncWithoutDetaching([$perm->id]);

    $this->actingAs($actor)->put("/admin/permissions/{$target->id}", [
        'roles' => ['cashier'],
    ])->assertForbidden();

    expect($target->fresh()->hasRole('cashier'))->toBeFalse();
});
