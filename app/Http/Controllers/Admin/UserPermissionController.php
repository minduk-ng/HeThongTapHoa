<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Support\Facades\Cache;

class UserPermissionController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->query('search');
        $roleName = $request->query('role');

        $users = User::with('roles')
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when($roleName, function ($query, $roleName) {
                $query->whereHas('roles', function ($q) use ($roleName) {
                    $q->where('name', $roleName);
                });
            })
            ->paginate(15)
            ->withQueryString();

        $roles = Role::all();
        
        return Inertia::render('admin/UsersPermission', [
            'users' => $users,
            'roles' => $roles,
            'filters' => [
                'search' => $search,
                'role' => $roleName,
            ]
        ]);
    }

    public function update(Request $request, User $user): \Illuminate\Http\RedirectResponse
    {
        if ($user->isAdmin()) {
            return redirect()->back()->with('error', 'Không thể thay đổi quyền của Admin gốc.');
        }

        $validated = $request->validate([
            'roles' => ['array'],
            'roles.*' => ['exists:roles,name'],
        ]);

        if (isset($validated['roles'])) {
            $roleIds = Role::whereIn('name', $validated['roles'])->pluck('id');
            $user->roles()->sync($roleIds);
        } else {
            $user->roles()->detach();
        }

        Cache::forget("user_permissions:{$user->id}");

        return redirect()->back()->with('success', 'Cập nhật quyền người dùng thành công.');
    }

    public function bulkAction(Request $request): \Illuminate\Http\RedirectResponse
    {
        $validated = $request->validate([
            'user_ids' => ['required', 'array'],
            'user_ids.*' => ['exists:users,id'],
            'action' => ['required', 'string', 'in:assign_role,clear_roles,delete_users'],
            'role_names' => ['nullable', 'array'],
            'role_names.*' => ['exists:roles,name'],
        ]);

        // Tránh tác động đến tài khoản super admin
        $userIds = collect($validated['user_ids'])->filter(function ($id) {
            $user = User::find($id);
            return $user && !$user->isAdmin();
        })->toArray();

        if (empty($userIds)) {
            return redirect()->back()->with('error', 'Không có người dùng hợp lệ để thực hiện thao tác.');
        }

        if ($validated['action'] === 'delete_users') {
            $request->validate([
                'password' => ['required', 'string'],
            ]);

            if (!\Hash::check($request->input('password'), $request->user()->password)) {
                return redirect()->back()->withErrors([
                    'password' => 'Mật khẩu xác nhận không chính xác.'
                ]);
            }

            User::whereIn('id', $userIds)->delete();
        } else if ($validated['action'] === 'assign_role') {
            $roleIds = Role::whereIn('name', $validated['role_names'] ?? [])->pluck('id')->toArray();
            foreach ($userIds as $id) {
                User::find($id)->roles()->syncWithoutDetaching($roleIds);
            }
        } else if ($validated['action'] === 'clear_roles') {
            $guestRoleId = Role::where('name', 'guest')->value('id');
            foreach ($userIds as $id) {
                $user = User::find($id);
                $user->roles()->sync([$guestRoleId]);
            }
        }

        foreach ($userIds as $id) {
            Cache::forget("user_permissions:{$id}");
        }

        return redirect()->back()->with('success', 'Thao tác hàng loạt hoàn tất.');
    }
}
