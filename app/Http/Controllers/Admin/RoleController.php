<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Page;
use App\Models\Permission;
use App\Models\Role;
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
            'ingredients.view', 'ingredients.create', 'ingredients.edit', 'ingredients.delete', 'ingredients.import',
            'recipes.view', 'recipes.edit',
            'tables.view', 'tables.create', 'tables.edit', 'tables.delete',
            'pos.view', 'pos.create', 'pos.bypass_kitchen_lock', 'pos.cancel_item',
            'kitchen.view', 'kitchen.update', 'kitchen.cancel_item',
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
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:roles,name'],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['array'],
            'permissions.*' => ['exists:permissions,name'],
            'pages' => ['array'],
            'pages.*' => ['exists:pages,id'],
        ]);

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
            \Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();
        } catch (\Exception $e) {}

        return redirect()->back()->with('success', 'Tạo nhóm quyền thành công.');
    }

    public function update(Request $request, Role $role): RedirectResponse
    {
        if ($role->name === 'admin') {
            return redirect()->back()->with('error', 'Không thể chỉnh sửa nhóm quyền admin.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:roles,name,'.$role->id],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['array'],
            'permissions.*' => ['exists:permissions,name'],
            'pages' => ['array'],
            'pages.*' => ['exists:pages,id'],
        ]);

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
            \Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();
        } catch (\Exception $e) {}

        $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');
        foreach ($userIds as $id) {
            Cache::forget("user_permissions:{$id}");
        }

        return redirect()->back()->with('success', 'Cập nhật nhóm quyền thành công.');
    }

    public function destroy(Request $request, Role $role): RedirectResponse
    {
        if ($role->is_system) {
            return redirect()->back()->with('error', 'Không thể xóa nhóm quyền hệ thống.');
        }

        $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! \Hash::check($request->input('password'), $request->user()->password)) {
            return redirect()->back()->with('error', 'Mật khẩu xác nhận không chính xác.');
        }

        $userIds = \DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');

        $role->delete();

        Cache::forget('system_page_roles');
        foreach ($userIds as $id) {
            Cache::forget("user_permissions:{$id}");
        }

        return redirect()->back()->with('success', 'Xóa nhóm quyền thành công.');
    }
}
