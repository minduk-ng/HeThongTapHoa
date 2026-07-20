<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class AuthorizationSeeder extends Seeder
{
    public function run(): void
    {
        $now = Carbon::now();

        // 1. Seed Pages
        $pages = [
            [
                'name' => 'Trang chủ',
                'route_path' => '/',
                'group_name' => 'Tổng quan',
                'sort_order' => 1,
            ],
            [
                'name' => 'Tool (Pages)',
                'route_path' => '/admin/pages',
                'group_name' => 'Phân quyền',
                'sort_order' => 10,
            ],
            [
                'name' => 'Nhóm quyền',
                'route_path' => '/admin/roles',
                'group_name' => 'Phân quyền',
                'sort_order' => 11,
            ],
            [
                'name' => 'Phân quyền Users',
                'route_path' => '/admin/permissions',
                'group_name' => 'Phân quyền',
                'sort_order' => 12,
            ],
            [
                'name' => 'Danh mục & Sản phẩm',
                'route_path' => '/manager/products',
                'group_name' => 'Quản lý',
                'sort_order' => 20,
            ],
        ];

        foreach ($pages as $page) {
            DB::table('pages')->updateOrInsert(
                ['route_path' => $page['route_path']],
                array_merge($page, ['created_at' => $now, 'updated_at' => $now])
            );
        }

        // 2. Seed Roles
        $roles = [
            ['name' => 'admin', 'description' => 'Quản trị viên toàn quyền', 'is_system' => true],
            ['name' => 'guest', 'description' => 'Khách (chỉ xem trang chủ)', 'is_system' => true],
        ];

        foreach ($roles as $role) {
            DB::table('roles')->updateOrInsert(
                ['name' => $role['name']],
                array_merge($role, ['created_at' => $now, 'updated_at' => $now])
            );
        }

        $adminRoleId = DB::table('roles')->where('name', 'admin')->value('id');

        // 3. Seed Permissions
        $permissions = [
            'pages.view', 'pages.create', 'pages.edit', 'pages.delete',
            'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
            'users.view', 'users.edit',
            'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import', 'products.export',
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission],
                ['created_at' => $now, 'updated_at' => $now]
            );
        }

        // 4. Assign all permissions to 'admin' role
        $allPermissionIds = DB::table('permissions')->pluck('id')->toArray();
        $rolePermissions = [];
        foreach ($allPermissionIds as $permissionId) {
            $rolePermissions[] = [
                'role_id' => $adminRoleId,
                'permission_id' => $permissionId,
            ];
        }
        
        // Clear old permissions for admin to avoid duplicates, then insert
        DB::table('role_permissions')->where('role_id', $adminRoleId)->delete();
        DB::table('role_permissions')->insert($rolePermissions);

        // 5. Create or find admin user
        $adminEmail = env('ADMIN_EMAIL', 'admin@admin.com');
        $adminPassword = env('ADMIN_DEFAULT_PASSWORD', '244466666');
        $adminUser = DB::table('users')->where('email', $adminEmail)->first();
        
        if (!$adminUser) {
            $adminUserId = DB::table('users')->insertGetId([
                'name' => 'Admin',
                'email' => $adminEmail,
                'password' => bcrypt($adminPassword), // Configured password in .env
                'email_verified_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            $adminUserId = $adminUser->id;
        }

        // Assign admin role to admin user
        DB::table('user_roles')->updateOrInsert([
            'user_id' => $adminUserId,
            'role_id' => $adminRoleId,
        ]);
        
        // Assign guest role to all other users
        $guestRoleId = DB::table('roles')->where('name', 'guest')->value('id');
        $otherUsers = DB::table('users')->where('email', '!=', $adminEmail)->pluck('id');
        
        foreach ($otherUsers as $userId) {
            DB::table('user_roles')->updateOrInsert([
                'user_id' => $userId,
                'role_id' => $guestRoleId,
            ]);
        }

        // 6. Seed role_pages (Page Access)
        $allPageIds = DB::table('pages')->pluck('id')->toArray();
        $adminRolePages = [];
        foreach ($allPageIds as $pageId) {
            $adminRolePages[] = [
                'role_id' => $adminRoleId,
                'page_id' => $pageId,
            ];
        }
        DB::table('role_pages')->where('role_id', $adminRoleId)->delete();
        DB::table('role_pages')->insert($adminRolePages);

        $homepageId = DB::table('pages')->where('route_path', '/')->value('id');
        if ($homepageId) {
            DB::table('role_pages')->updateOrInsert([
                'role_id' => $guestRoleId,
                'page_id' => $homepageId,
            ]);
        }
    }
}
