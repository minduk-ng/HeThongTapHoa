<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Page;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\PromotionAction;
use App\Models\PromotionCondition;
use App\Models\Role;
use App\Models\Table;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
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
function posAdmin(): User
{
    $user = User::create([
        'name' => 'Admin POS',
        'email' => 'admin_'.uniqid().'@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);

    $role = Role::firstOrCreate(
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
function posStaff(array $permissions = ['pos.view', 'pos.create'], array $pagePaths = ['/staff/pos']): User
{
    $user = User::create([
        'name' => 'Staff POS',
        'email' => 'staff_'.uniqid().'@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);

    $role = Role::create([
        'name' => 'staff_'.uniqid(),
        'description' => 'Staff role',
        'is_system' => false,
    ]);
    $user->roles()->attach($role->id);

    foreach ($permissions as $permName) {
        $perm = Permission::firstOrCreate(['name' => $permName]);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
    }

    foreach ($pagePaths as $path) {
        $page = Page::firstOrCreate(
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
function posTable(array $attrs = []): Table
{
    return Table::create(array_merge([
        'table_number' => 'B'.substr(uniqid(), -6),
        'capacity' => 4,
        'area' => 'Tầng 1',
        'status' => 'available',
    ], $attrs));
}

/**
 * Tạo món trong menu (kèm danh mục dùng chung).
 */
function posMenuItem(array $attrs = []): MenuItem
{
    $category = MenuCategory::firstOrCreate(
        ['name' => 'Danh mục Test'],
        ['sort_order' => 1],
    );

    return MenuItem::create(array_merge([
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
function posOrder(?Table $table, array $itemsSpec = [], array $attrs = []): Order
{
    $subtotal = collect($itemsSpec)->sum(fn ($s) => ($s['qty'] ?? 1) * ($s['price'] ?? 20000));

    $order = Order::create(array_merge([
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
        OrderItem::create([
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

/**
 * Tạo promotion v2 (type/code/status/max_usage/exclusive/stackable).
 */
function promoV2(array $attrs = []): Promotion
{
    $type = $attrs['type'] ?? 'promotion';

    return Promotion::create(array_merge([
        'name' => 'Promo '.uniqid(),
        'type' => $type,
        'code' => $type === 'promotion' ? null : 'PR'.strtoupper(substr(uniqid(), -8)),
        'status' => true,
        'max_usage' => null,
        'used_count' => 0,
        'exclusive' => false,
        'stackable' => true,
    ], $attrs));
}

function addCond(Promotion $p, string $type, string $value): PromotionCondition
{
    return $p->conditions()->create(['cond_type' => $type, 'cond_value' => $value]);
}

function addAction(Promotion $p, string $type, float $value, ?float $max = null): PromotionAction
{
    return $p->actions()->create([
        'action_type' => $type, 'action_value' => $value, 'max_discount_amount' => $max,
    ]);
}

function linesV2(): Collection
{
    return collect([
        ['order_item_id' => 1, 'menu_item_id' => 10, 'quantity' => 2, 'subtotal' => 100000, 'category_id' => 3],
        ['order_item_id' => 2, 'menu_item_id' => 11, 'quantity' => 1, 'subtotal' => 50000, 'category_id' => 4],
    ]);
}
