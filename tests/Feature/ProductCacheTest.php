<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

test('pos products and categories are cached and flushed on changes', function () {
    $user = User::create([
        'name' => 'Admin User',
        'email' => 'admin@example.com',
        'password' => bcrypt('password123'),
        'email_verified_at' => now(),
    ]);
    $role = Role::create(['name' => 'admin', 'is_system' => true]);
    $user->roles()->attach($role->id);

    $category = MenuCategory::create(['name' => 'Drinks', 'sort_order' => 1]);
    $product = MenuItem::create([
        'menu_category_id' => $category->id,
        'name' => 'Espresso',
        'price' => 30000,
        'is_available' => true,
    ]);

    $this->actingAs($user);

    $response = $this->get('/staff/pos');
    $response->assertStatus(200);

    expect(Cache::tags(['pos_products_and_categories'])->has('pos_categories'))->toBeTrue();
    expect(Cache::tags(['pos_products_and_categories'])->has('pos_products'))->toBeTrue();

    // Sửa giá sản phẩm
    $product->update(['price' => 35000]);
    expect(Cache::tags(['pos_products_and_categories'])->has('pos_categories'))->toBeFalse();
    expect(Cache::tags(['pos_products_and_categories'])->has('pos_products'))->toBeFalse();
});
