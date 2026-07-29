<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Tạo user Admin (bypass mọi middleware phân quyền & page access).
 */
function posAdmin(): \App\Models\User
{
    $user = \App\Models\User::create([
        'name' => 'Admin POS',
        'email' => 'admin_'.uniqid().'@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);

    $role = \App\Models\Role::firstOrCreate(
        ['name' => 'admin'],
        ['description' => 'Admin role', 'is_system' => true],
    );
    $user->roles()->attach($role->id);

    return $user->fresh();
}

/**
 * Tạo user Nhân viên (non-admin) với danh sách permission và page access cụ thể.
 * Dùng để kiểm thử các ràng buộc phân quyền (ví dụ thiếu pos.bypass_kitchen_lock).
 */
function posStaff(array $permissions = ['pos.view', 'pos.create'], array $pagePaths = ['/staff/pos']): \App\Models\User
{
    $user = \App\Models\User::create([
        'name' => 'Staff POS',
        'email' => 'staff_'.uniqid().'@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);

    $role = \App\Models\Role::create([
        'name' => 'staff_'.uniqid(),
        'description' => 'Staff role',
        'is_system' => false,
    ]);
    $user->roles()->attach($role->id);

    foreach ($permissions as $permName) {
        $perm = \App\Models\Permission::firstOrCreate(['name' => $permName]);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
    }

    foreach ($pagePaths as $path) {
        $page = \App\Models\Page::firstOrCreate(
            ['route_path' => $path],
            ['name' => 'Page '.$path, 'group_name' => 'Test', 'sort_order' => 0],
        );
        $page->roles()->syncWithoutDetaching([$role->id]);
    }

    return $user->fresh();
}

/**
 * Tạo bàn với số bàn duy nhất (giới hạn 10 ký tự).
 */
function posTable(array $attrs = []): \App\Models\Table
{
    return \App\Models\Table::create(array_merge([
        'table_number' => 'B'.substr(uniqid(), -6),
        'capacity' => 4,
        'area' => 'Tầng 1',
        'status' => 'available',
    ], $attrs));
}

/**
 * Tạo món trong menu (kèm danh mục dùng chung).
 */
function posMenuItem(array $attrs = []): \App\Models\MenuItem
{
    $category = \App\Models\MenuCategory::firstOrCreate(
        ['name' => 'Danh mục Test'],
        ['sort_order' => 1],
    );

    return \App\Models\MenuItem::create(array_merge([
        'category_id' => $category->id,
        'name' => 'Món '.uniqid(),
        'price' => 20000,
        'vat_rate' => 0,
        'is_available' => true,
    ], $attrs));
}

/**
 * Tạo đơn hàng kèm danh sách món.
 * $itemsSpec: mảng các phần tử ['item' => MenuItem, 'qty' => int, 'price' => float, 'status' => string].
 */
function posOrder(?\App\Models\Table $table, array $itemsSpec = [], array $attrs = []): \App\Models\Order
{
    $subtotal = collect($itemsSpec)->sum(fn ($s) => ($s['qty'] ?? 1) * ($s['price'] ?? 20000));

    $order = \App\Models\Order::create(array_merge([
        'order_code' => 'ORD-'.strtoupper(substr(uniqid(), -8)),
        'table_id' => $table?->id,
        'subtotal' => $subtotal,
        'vat_amount' => 0,
        'total' => $subtotal,
        'status' => 'pending',
    ], $attrs));

    foreach ($itemsSpec as $spec) {
        $qty = $spec['qty'] ?? 1;
        $price = $spec['price'] ?? 20000;
        \App\Models\OrderItem::create([
            'order_id' => $order->id,
            'menu_item_id' => $spec['item']->id,
            'quantity' => $qty,
            'unit_price' => $price,
            'subtotal' => $qty * $price,
            'status' => $spec['status'] ?? 'pending',
        ]);
    }

    return $order->fresh();
}
