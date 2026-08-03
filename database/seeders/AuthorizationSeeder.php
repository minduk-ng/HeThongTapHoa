<?php

namespace Database\Seeders;

use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

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
                'name' => 'Tổng quan',
                'route_path' => '/manager/dashboard',
                'group_name' => 'Quản lý',
                'sort_order' => 18,
            ],
            [
                'name' => 'Danh mục',
                'route_path' => '/manager/categories',
                'group_name' => 'Quản lý',
                'sort_order' => 19,
            ],
            [
                'name' => 'Sản phẩm',
                'route_path' => '/manager/products',
                'group_name' => 'Quản lý',
                'sort_order' => 20,
            ],
            [
                'name' => 'Bàn & Sơ đồ',
                'route_path' => '/manager/tables',
                'group_name' => 'Quản lý',
                'sort_order' => 21,
            ],
            [
                'name' => 'Khuyến mãi',
                'route_path' => '/manager/promotions',
                'group_name' => 'Quản lý',
                'sort_order' => 22,
            ],
            [
                'name' => 'Nguyên liệu',
                'route_path' => '/manager/inventory/ingredients',
                'group_name' => 'Quản lý',
                'sort_order' => 25,
            ],
            [
                'name' => 'Định lượng món',
                'route_path' => '/manager/inventory/recipes',
                'group_name' => 'Quản lý',
                'sort_order' => 26,
            ],
            [
                'name' => 'Danh sách Order',
                'route_path' => '/manager/orders',
                'group_name' => 'Quản lý',
                'sort_order' => 27,
            ],
            [
                'name' => 'Báo cáo hoá đơn bán hàng',
                'route_path' => '/reports/sales-invoices',
                'group_name' => 'Báo cáo',
                'sort_order' => 28,
            ],
            [
                'name' => 'Báo cáo chi tiết hoá đơn',
                'route_path' => '/reports/invoice-items',
                'group_name' => 'Báo cáo',
                'sort_order' => 29,
            ],
            [
                'name' => 'Báo cáo chi tiết sản phẩm hàng hoá',
                'route_path' => '/reports/product-details',
                'group_name' => 'Báo cáo',
                'sort_order' => 30,
            ],
            [
                'name' => 'Báo cáo hoá đơn huỷ',
                'route_path' => '/reports/cancelled',
                'group_name' => 'Báo cáo',
                'sort_order' => 31,
            ],
            [
                'name' => 'Báo cáo lợi nhuận',
                'route_path' => '/reports/profit',
                'group_name' => 'Báo cáo',
                'sort_order' => 32,
            ],
            [
                'name' => 'Báo cáo đặt bàn',
                'route_path' => '/reports/reservations',
                'group_name' => 'Báo cáo',
                'sort_order' => 33,
            ],
            [
                'name' => 'Báo cáo thanh toán',
                'route_path' => '/reports/payments',
                'group_name' => 'Báo cáo',
                'sort_order' => 34,
            ],
            [
                'name' => 'Báo cáo ca làm việc',
                'route_path' => '/reports/shifts',
                'group_name' => 'Báo cáo',
                'sort_order' => 35,
            ],
            [
                'name' => 'Đặt hàng POS',
                'route_path' => '/staff/pos',
                'group_name' => 'Nhân viên',
                'sort_order' => 30,
            ],
            [
                'name' => 'Màn hình Bếp',
                'route_path' => '/staff/kitchen',
                'group_name' => 'Nhân viên',
                'sort_order' => 31,
            ],
            [
                'name' => 'Phục vụ',
                'route_path' => '/staff/serving',
                'group_name' => 'Nhân viên',
                'sort_order' => 32,
            ],
            [
                'name' => 'Ca làm việc',
                'route_path' => '/staff/shifts',
                'group_name' => 'Nhân viên',
                'sort_order' => 33,
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
            'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
            'promotions.view', 'promotions.create', 'promotions.edit', 'promotions.delete',
            'ingredients.view', 'ingredients.create', 'ingredients.edit', 'ingredients.delete', 'ingredients.import',
            'recipes.view', 'recipes.edit',
            'tables.view', 'tables.create', 'tables.edit', 'tables.delete',
            'pos.view', 'pos.create', 'pos.bypass_kitchen_lock', 'pos.cancel_item',
            'kitchen.view', 'kitchen.update', 'kitchen.cancel_item',
            'serving.view', 'serving.update',
            'shifts.open', 'shifts.view', 'shifts.close',
            'orders.view',
            'dashboard.view',
            'reports.view',
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

        if (! $adminUser) {
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
