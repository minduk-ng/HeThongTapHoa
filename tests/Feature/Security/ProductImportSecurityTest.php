<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthorizationSeeder::class);
});

function productImportAdmin(): User
{
    $admin = User::factory()->create();
    $adminRole = Role::where('name', 'admin')->first();
    $admin->roles()->attach($adminRole);

    return $admin;
}

test('file larger than 2MB is rejected with 422', function () {
    $admin = productImportAdmin();
    $file = UploadedFile::fake()->create('products.csv', 2049, 'text/csv');

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['file']);
});

test('file with more than 5000 data rows is rejected with 422', function () {
    $admin = productImportAdmin();

    $header = "ID,Tên sản phẩm,Danh mục,Giá bán,Thuế VAT,Trạng thái,Ghi chú\n";
    $data = str_repeat("1,Bánh mì,Thức ăn,15000,10,Còn,Ngon\n", 5001);
    $file = UploadedFile::fake()->createWithContent('products_5001.csv', $header.$data);

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'Số lượng dòng trong file vượt quá giới hạn 5.000 dòng.',
        ]);
});

test('file with xlsx extension is rejected with 422', function () {
    $admin = productImportAdmin();
    $file = UploadedFile::fake()->create('products.xlsx', 50, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['file']);
});

test('file with binary or invalid extension is rejected with 422', function () {
    $admin = productImportAdmin();
    $file = UploadedFile::fake()->create('products.bin', 10, 'application/octet-stream');

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['file']);
});

test('valid CSV with semicolon delimiter parses correctly and detects duplicates', function () {
    $admin = productImportAdmin();

    $category = MenuCategory::create(['name' => 'Nước ép', 'sort_order' => 1]);
    $existing = MenuItem::create([
        'name' => 'Nước ép cam',
        'category_id' => $category->id,
        'price' => 30000,
        'vat_rate' => 10,
        'is_available' => true,
    ]);

    $csvContent = "ID;Tên sản phẩm;Danh mục;Giá bán;Thuế VAT;Trạng thái;Ghi chú\n".
        "{$existing->id};Nước ép cam;Nước ép;32000;10;Còn hàng;Cập nhật giá\n".
        ";Nước ép ổi;Nước ép;28000;10;Còn hàng;Mới\n";
    $file = UploadedFile::fake()->createWithContent('semicolon.csv', $csvContent);

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertOk()
        ->assertJson([
            'total_count' => 2,
            'duplicates_count' => 1,
            'new_count' => 1,
        ]);
});

test('valid CSV with <= 5000 rows parses correctly and returns preview data', function () {
    $admin = productImportAdmin();

    $csvContent = "\xEF\xBB\xBFID,Tên sản phẩm,Danh mục,Giá bán,Thuế VAT,Trạng thái,Ghi chú\n".
        "99991,Cà phê muối,Đồ uống,35000,10,Còn hàng,Ngon đậm đà\n".
        "99992,Trà đào cam sả,Đồ uống,40000,10,Còn hàng,Thơm mát\n";
    $file = UploadedFile::fake()->createWithContent('products_valid.csv', $csvContent);

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertOk()
        ->assertJsonStructure([
            'temp_id',
            'total_count',
            'duplicates_count',
            'new_count',
            'duplicates',
        ])
        ->assertJson([
            'total_count' => 2,
            'duplicates_count' => 0,
            'new_count' => 2,
        ]);

    $tempId = $response->json('temp_id');
    expect(Cache::has($tempId))->toBeTrue();
    $cached = Cache::get($tempId);
    expect($cached['rows'])->toHaveCount(2);
    expect(session($tempId))->not->toBeNull();
});

test('confirmImport processes cached data and clears cache and session', function () {
    $admin = productImportAdmin();

    $tempId = 'import_test_12345';
    $rows = [
        [
            'id' => null,
            'raw_id' => '',
            'name' => 'Trà vải dưa hấu',
            'category' => 'Trà trái cây',
            'price' => 38000,
            'vat_rate' => 10,
            'description' => 'Món mới',
        ],
    ];

    Cache::put($tempId, [
        'rows' => $rows,
        'duplicates' => [],
        'new_items' => $rows,
    ], now()->addMinutes(30));

    session([$tempId => [
        'rows' => $rows,
        'duplicates' => [],
        'new_items' => $rows,
    ]]);

    $response = $this->actingAs($admin)
        ->post('/manager/products/confirm-import', [
            'temp_id' => $tempId,
            'action' => 'add_only_new',
        ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('menu_items', ['name' => 'Trà vải dưa hấu']);

    expect(Cache::has($tempId))->toBeFalse();
    expect(session($tempId))->toBeNull();
});

test('confirmImport with replace_all updates existing items and clears cache and session', function () {
    $admin = productImportAdmin();

    $category = MenuCategory::create(['name' => 'Trà', 'sort_order' => 1]);
    $item = MenuItem::create([
        'name' => 'Trà lài',
        'category_id' => $category->id,
        'price' => 20000,
        'vat_rate' => 10,
        'is_available' => true,
    ]);

    $tempId = 'import_test_replace';
    $rows = [
        [
            'id' => $item->id,
            'raw_id' => (string) $item->id,
            'name' => 'Trà lài đặc biệt',
            'category' => 'Trà',
            'price' => 25000,
            'vat_rate' => 8,
            'description' => 'Công thức mới',
        ],
    ];

    Cache::put($tempId, [
        'rows' => $rows,
        'duplicates' => $rows,
        'new_items' => [],
    ], now()->addMinutes(30));

    session([$tempId => [
        'rows' => $rows,
        'duplicates' => $rows,
        'new_items' => [],
    ]]);

    $response = $this->actingAs($admin)
        ->post('/manager/products/confirm-import', [
            'temp_id' => $tempId,
            'action' => 'replace_all',
        ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('menu_items', [
        'id' => $item->id,
        'name' => 'Trà lài đặc biệt',
        'price' => 25000,
        'vat_rate' => 8,
    ]);

    expect(Cache::has($tempId))->toBeFalse();
    expect(session($tempId))->toBeNull();
});

test('internal or unhandled parser errors do not leak internal exception messages to client', function () {
    $admin = productImportAdmin();

    Log::spy();

    $file = UploadedFile::fake()->createWithContent('valid.csv', "ID,Tên\n1,Test");

    Cache::shouldReceive('put')
        ->andThrow(new RuntimeException('Redis connection failure: credentials leaked db_pass_secret'));

    $response = $this->actingAs($admin)
        ->postJson('/manager/products/check-import', ['file' => $file]);

    $response->assertStatus(422)
        ->assertJson([
            'message' => 'Có lỗi xảy ra khi xử lý file import. Vui lòng kiểm tra định dạng file.',
        ]);

    // Ensure raw exception message is NOT leaked in response
    $response->assertJsonMissing([
        'message' => 'Lỗi đọc file: Redis connection failure: credentials leaked db_pass_secret',
    ]);
    expect($response->getContent())->not->toContain('db_pass_secret');

    Log::shouldHaveReceived('error')
        ->withArgs(function ($message, $context = []) {
            return str_contains($message, 'Lỗi import sản phẩm') && isset($context['trace']);
        });
});
