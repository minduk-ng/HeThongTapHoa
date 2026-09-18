<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Page;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Security\PrivilegeGuard;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(): Response
    {
        $systemPermissions = [
            'pages.view', 'pages.create', 'pages.edit', 'pages.delete',
            'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
            'users.view', 'users.edit',
            'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import', 'products.export',
            'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
            'promotions.view', 'promotions.create', 'promotions.edit', 'promotions.delete',
            'ingredients.view', 'ingredients.create', 'ingredients.edit', 'ingredients.delete', 'ingredients.import',
            'inventory.vouchers.view', 'inventory.vouchers.create',
            'inventory.stocktake.view', 'inventory.stocktake.create',
            'inventory.history.view',
            'recipes.view', 'recipes.edit',
            'tables.view', 'tables.create', 'tables.edit', 'tables.delete',
            'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
            'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
            'pos.view', 'pos.create', 'pos.cancel_item',
            'kitchen.view', 'kitchen.update', 'kitchen.cancel_item',
            'serving.view', 'serving.update',
            'shifts.open', 'shifts.view', 'shifts.close',
            'orders.view',
            'dashboard.view',
            'reports.view',
        ];

        foreach ($systemPermissions as $permName) {
            Permission::firstOrCreate(['name' => $permName]);
        }

        $roles = Role::with(['permissions', 'pages'])->get();
        $permissions = Permission::all();
        $pages = Page::orderBy('sort_order')->get();

        return Inertia::render('admin/RolesManager', [
            'roles' => $roles,
            'permissions' => $permissions,
            'pages' => $pages,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:roles,name'],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['array'],
            'permissions.*' => ['exists:permissions,name'],
            'pages' => ['array'],
            'pages.*' => ['exists:pages,id'],
        ]);

        PrivilegeGuard::assertRoleNameAllowed($validated['name']);
        PrivilegeGuard::assertCanGrant($actor, array_values($validated['permissions'] ?? []), array_map('intval', $validated['pages'] ?? []));

        $role = Role::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? '',
            'is_system' => false,
        ]);

        if (! empty($validated['permissions'])) {
            $permissionIds = Permission::whereIn('name', $validated['permissions'])->pluck('id');
            $role->permissions()->attach($permissionIds);
        }

        if (! empty($validated['pages'])) {
            $role->pages()->sync($validated['pages']);
        }

        Cache::forget('system_page_roles');
        try {
            Cache::tags(['user_inertia'])->flush();
        } catch (\Exception $e) {
        }

        SecurityAuditLog::record($actor, 'role.created', $role, null, [
            'name' => $role->name,
            'permissions' => array_values($validated['permissions'] ?? []),
            'pages' => array_map('intval', $validated['pages'] ?? []),
        ], $request->ip(), $request->userAgent());

        return redirect()->back()->with('success', 'Tạo nhóm quyền thành công.');
    }

    public function update(Request $request, Role $role): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:roles,name,'.$role->id],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['array'],
            'permissions.*' => ['exists:permissions,name'],
            'pages' => ['array'],
            'pages.*' => ['exists:pages,id'],
        ]);

        if ($role->name !== $validated['name']) {
            PrivilegeGuard::assertRoleNameAllowed($validated['name']);
        }
        PrivilegeGuard::assertCanModifyRole($actor, $role, array_values($validated['permissions'] ?? []), array_map('intval', $validated['pages'] ?? []));

        $before = [
            'name' => $role->name,
            'permissions' => $role->permissions()->pluck('permissions.name')->all(),
            'pages' => $role->pages()->pluck('pages.id')->map(fn ($id): int => (int) $id)->all(),
        ];

        $role->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? '',
        ]);

        if (isset($validated['permissions'])) {
            $permissionIds = Permission::whereIn('name', $validated['permissions'])->pluck('id');
            $role->permissions()->sync($permissionIds);
        } else {
            $role->permissions()->detach();
        }

        if (isset($validated['pages'])) {
            $role->pages()->sync($validated['pages']);
        } else {
            $role->pages()->detach();
        }

        Cache::forget('system_page_roles');
        try {
            Cache::tags(['user_inertia'])->flush();
        } catch (\Exception $e) {
        }

        $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');
        foreach ($userIds as $id) {
            Cache::forget("user_permissions:{$id}");
        }

        SecurityAuditLog::record($actor, 'role.updated', $role, $before, [
            'name' => $role->fresh()->name,
            'permissions' => array_values($validated['permissions'] ?? []),
            'pages' => array_map('intval', $validated['pages'] ?? []),
        ], $request->ip(), $request->userAgent());

        return redirect()->back()->with('success', 'Cập nhật nhóm quyền thành công.');
    }

    public function destroy(Request $request, Role $role): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);

        if ($role->is_system) {
            return redirect()->back()->with('error', 'Không thể xóa nhóm quyền hệ thống.');
        }

        PrivilegeGuard::assertCanGrant($actor, $role->permissions()->pluck('permissions.name')->all(), $role->pages()->pluck('pages.id')->map(fn ($id): int => (int) $id)->all());

        $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! \Hash::check($request->input('password'), $request->user()->password)) {
            return redirect()->back()->with('error', 'Mật khẩu xác nhận không chính xác.');
        }

        $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');
        $before = ['name' => $role->name];

        $role->delete();

        Cache::forget('system_page_roles');
        foreach ($userIds as $id) {
            Cache::forget("user_permissions:{$id}");
        }

        SecurityAuditLog::record($actor, 'role.deleted', $role, $before, null, $request->ip(), $request->userAgent());

        return redirect()->back()->with('success', 'Xóa nhóm quyền thành công.');
    }
}
