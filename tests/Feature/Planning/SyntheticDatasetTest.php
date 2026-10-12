<?php

use App\Models\DailyProductDemand;
use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\ProductRecipe;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\SyntheticDataset;
use App\Models\User;
use App\Services\Manager\DashboardService;
use Carbon\Carbon;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

function userWithPermission(string ...$permissions): User
{
    $user = User::factory()->create();
    $role = Role::create(['name' => 'test-role-'.uniqid(), 'display_name' => 'Test Role']);
    foreach ($permissions as $permission) {
        DB::table('permissions')->updateOrInsert(['name' => $permission], ['created_at' => now(), 'updated_at' => now()]);
        $permId = DB::table('permissions')->where('name', $permission)->value('id');
        DB::table('role_permissions')->insert(['role_id' => $role->id, 'permission_id' => $permId]);
    }
    $page = Page::firstWhere('route_path', '/admin/synthetic-datasets');
    if ($page) {
        $role->pages()->attach($page);
    }
    $user->roles()->attach($role);

    return $user;
}

it('excludes synthetic invoices from operational dashboard totals', function () {
    $today = Carbon::today();
    $issuedAt = $today->copy()->setTime(12, 0);

    // Create a real invoice
    Invoice::create([
        'invoice_code' => 'INV-REAL-001',
        'table_name' => 'B01',
        'payment_method' => 'cash',
        'subtotal_amount' => 100000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 100000,
        'amount_received' => 100000,
        'change_amount' => 0,
        'issued_at' => $issuedAt,
        'synthetic_dataset_id' => null,
    ]);

    // Create a synthetic dataset and synthetic invoice
    $dataset = SyntheticDataset::create([
        'name' => 'test-dataset',
        'seed' => 42,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '{"days":30}'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'mock'),
    ]);

    Invoice::create([
        'invoice_code' => 'SYN-001-INV-001',
        'table_name' => 'Mang Đi',
        'payment_method' => 'cash',
        'subtotal_amount' => 100000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 100000,
        'amount_received' => 100000,
        'change_amount' => 0,
        'issued_at' => $issuedAt,
        'synthetic_dataset_id' => $dataset->id,
    ]);

    $service = app(DashboardService::class);
    $kpis = $service->kpis($today->copy()->startOfDay(), $today->copy()->endOfDay(), $today->copy()->subDay()->startOfDay(), $today->copy()->subDay()->endOfDay());

    expect((float) $kpis['revenue']['value'])->toBe(100000.0);
});

it('requires planning.experiments permission to delete dataset', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'dataset-to-delete',
        'seed' => 42,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '{"days":30}'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'mock'),
    ]);

    $userWithoutPerm = User::factory()->create();

    $this->actingAs($userWithoutPerm)
        ->deleteJson("/admin/synthetic-datasets/{$dataset->id}", ['confirmation' => 'dataset-to-delete'])
        ->assertForbidden();
});

it('rejects dataset deletion if confirmation name does not match', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'my-experiment',
        'seed' => 42,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '{"days":30}'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'mock'),
    ]);

    $user = userWithPermission('planning.experiments');

    $this->actingAs($user)
        ->deleteJson("/admin/synthetic-datasets/{$dataset->id}", ['confirmation' => 'wrong-name'])
        ->assertUnprocessable();
});

it('safely deletes synthetic dataset and only its linked invoices', function () {
    $dataset1 = SyntheticDataset::create([
        'name' => 'dataset-one',
        'seed' => 42,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '1'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', '1'),
    ]);

    $dataset2 = SyntheticDataset::create([
        'name' => 'dataset-two',
        'seed' => 43,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '2'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', '2'),
    ]);

    // Real invoice
    $realInvoice = Invoice::create([
        'invoice_code' => 'INV-REAL',
        'table_name' => 'B01',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => null,
    ]);

    // Dataset 1 invoice
    $syn1 = Invoice::create([
        'invoice_code' => 'SYN-1-001',
        'table_name' => 'Mang Đi',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => $dataset1->id,
    ]);

    // Dataset 2 invoice
    $syn2 = Invoice::create([
        'invoice_code' => 'SYN-2-001',
        'table_name' => 'Mang Đi',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => $dataset2->id,
    ]);

    $user = userWithPermission('planning.experiments');

    $this->actingAs($user)
        ->deleteJson("/admin/synthetic-datasets/{$dataset1->id}", ['confirmation' => 'dataset-one'])
        ->assertSuccessful();

    expect(SyntheticDataset::find($dataset1->id))->toBeNull()
        ->and(Invoice::find($syn1->id))->toBeNull()
        ->and(Invoice::find($realInvoice->id))->not->toBeNull()
        ->and(Invoice::find($syn2->id))->not->toBeNull()
        ->and(SyntheticDataset::find($dataset2->id))->not->toBeNull();
});

it('excludes synthetic invoices from sales invoice, profit, payments, invoice items, and consumption reports', function () {
    $today = Carbon::today()->toDateString();
    $issuedAt = Carbon::today()->setTime(12, 0);

    $admin = User::factory()->create();
    $adminRole = Role::where('name', 'admin')->first();
    $admin->roles()->attach($adminRole);

    $category = MenuCategory::create(['name' => 'Drinks', 'sort_order' => 1]);
    $menuItem = MenuItem::create([
        'category_id' => $category->id,
        'code' => 'M01',
        'name' => 'Coffee',
        'price' => 50000,
        'cost_price' => 20000,
        'unit' => 'cup',
        'is_available' => true,
    ]);

    $ingredient = Ingredient::create([
        'code' => 'ING01',
        'name' => 'Coffee Beans',
        'unit' => 'g',
        'cost_price' => 500,
        'stock_quantity' => 1000,
        'min_stock_alert' => 10,
    ]);

    ProductRecipe::create([
        'menu_item_id' => $menuItem->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 20,
        'unit' => 'g',
    ]);

    // Real invoice
    $realInvoice = Invoice::create([
        'invoice_code' => 'INV-REAL-REPORT',
        'table_name' => 'B01',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => $issuedAt,
        'created_at' => $issuedAt,
        'synthetic_dataset_id' => null,
    ]);
    InvoiceLine::create([
        'invoice_id' => $realInvoice->id,
        'menu_item_id' => $menuItem->id,
        'name_snapshot' => $menuItem->name,
        'quantity' => 1,
        'unit_price' => 50000,
        'subtotal' => 50000,
        'discount_amount' => 0,
        'vat_rate' => 0,
        'vat_amount' => 0,
        'created_at' => $issuedAt,
        'updated_at' => $issuedAt,
    ]);

    // Synthetic invoice
    $dataset = SyntheticDataset::create([
        'name' => 'report-isolation-dataset',
        'seed' => 42,
        'configuration' => ['days' => 10],
        'configuration_hash' => hash('sha256', '1'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', '1'),
    ]);
    $synInvoice = Invoice::create([
        'invoice_code' => 'SYN-REPORT-001',
        'table_name' => 'Synthetic',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => $issuedAt,
        'created_at' => $issuedAt,
        'synthetic_dataset_id' => $dataset->id,
    ]);
    InvoiceLine::create([
        'invoice_id' => $synInvoice->id,
        'menu_item_id' => $menuItem->id,
        'name_snapshot' => $menuItem->name,
        'quantity' => 1,
        'unit_price' => 50000,
        'subtotal' => 50000,
        'discount_amount' => 0,
        'vat_rate' => 0,
        'vat_amount' => 0,
        'created_at' => $issuedAt,
        'updated_at' => $issuedAt,
    ]);

    // 1. Sales Invoice Report
    $res = $this->actingAs($admin)->get("/reports/sales-invoices?start_date={$today}&end_date={$today}");
    $res->assertSuccessful();
    expect($res->original->getData()['page']['props']['metrics']['revenue'])->toBe(50000.0)
        ->and($res->original->getData()['page']['props']['metrics']['invoice_count'])->toBe(1);

    // 2. Profit Report
    $res = $this->actingAs($admin)->get("/reports/profit?start_date={$today}&end_date={$today}");
    $res->assertSuccessful();
    expect($res->original->getData()['page']['props']['metrics']['revenue'])->toBe(50000.0);

    // 3. Payments Report
    $res = $this->actingAs($admin)->get("/reports/payments?start_date={$today}&end_date={$today}");
    $res->assertSuccessful();
    expect($res->original->getData()['page']['props']['metrics']['revenue'])->toBe(50000.0)
        ->and($res->original->getData()['page']['props']['metrics']['invoice_count'])->toBe(1);

    // 4. Invoice Items Report
    $res = $this->actingAs($admin)->get("/reports/invoice-items?start_date={$today}&end_date={$today}");
    $res->assertSuccessful();
    expect($res->original->getData()['page']['props']['metrics']['total_amount'])->toBe(50000.0)
        ->and($res->original->getData()['page']['props']['metrics']['invoice_count'])->toBe(1);

    // 5. Consumption Report
    $res = $this->actingAs($admin)->get("/reports/consumption?start_date={$today}&end_date={$today}");
    $res->assertSuccessful();
    $rows = collect($res->original->getData()['page']['props']['rows']);
    $ingRow = $rows->firstWhere('id', $ingredient->id);
    expect($ingRow)->not->toBeNull()
        ->and($ingRow['quantity'])->toBe(20.0);
});

it('lists synthetic datasets via GET /admin/synthetic-datasets', function () {
    SyntheticDataset::create([
        'name' => 'list-demo-1',
        'seed' => 42,
        'configuration' => ['days' => 10],
        'configuration_hash' => hash('sha256', '1'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', '1'),
    ]);
    SyntheticDataset::create([
        'name' => 'list-demo-2',
        'seed' => 43,
        'configuration' => ['days' => 10],
        'configuration_hash' => hash('sha256', '2'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', '2'),
    ]);

    $user = userWithPermission('planning.experiments');

    $response = $this->actingAs($user)
        ->getJson('/admin/synthetic-datasets');

    $response->assertSuccessful()
        ->assertJsonStructure(['data' => [['id', 'name', 'seed']]]);

    expect(count($response->json('data')))->toBeGreaterThanOrEqual(2);
});

it('creates synthetic dataset via POST /admin/synthetic-datasets', function () {
    $user = userWithPermission('planning.experiments');
    $item = posMenuItem();

    $response = $this->actingAs($user)
        ->postJson('/admin/synthetic-datasets', [
            'name' => 'api-created-dataset',
            'description' => 'Test dataset via API',
            'seed' => 42,
            'configuration' => [
                'days' => 5,
                'orders_per_day' => 10,
                'menu_item_ids' => [$item->id],
            ],
        ]);

    $response->assertCreated()
        ->assertJsonPath('data.name', 'api-created-dataset')
        ->assertJsonPath('data.seed', 42);

    $dataset = SyntheticDataset::where('name', 'api-created-dataset')->first();
    expect($dataset)->not->toBeNull()
        ->and($dataset->dataset_hash)->not->toBeEmpty();
    expect(Invoice::where('synthetic_dataset_id', $dataset->id)->count())->toBeGreaterThan(0);
});

it('excludes synthetic invoices from promotion analytics revenue', function () {
    $admin = User::factory()->create();
    $adminRole = Role::where('name', 'admin')->first();
    $admin->roles()->attach($adminRole);

    $promotion = Promotion::create([
        'name' => 'Summer Promo',
        'slug' => 'summer-promo-test-'.uniqid(),
        'start_date' => now()->subDays(5)->toDateString(),
        'end_date' => now()->addDays(5)->toDateString(),
        'is_active' => true,
        'apply_type' => 'all',
    ]);

    $realInvoice = Invoice::create([
        'invoice_code' => 'INV-REAL-PROMO',
        'table_name' => 'B01',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 5000,
        'vat_amount' => 0,
        'total_amount' => 45000,
        'amount_received' => 45000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => null,
    ]);
    InvoicePromotion::create([
        'invoice_id' => $realInvoice->id,
        'promotion_id' => $promotion->id,
        'code' => 'PROMO-REAL',
        'name' => 'Real Promo',
        'discount_type' => 'fixed',
        'discount_value' => 5000,
        'amount' => 5000,
    ]);

    $dataset = SyntheticDataset::create([
        'name' => 'promo-syn-dataset',
        'seed' => 42,
        'configuration' => ['days' => 5],
        'configuration_hash' => hash('sha256', 'promo'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'promo'),
    ]);
    $synInvoice = Invoice::create([
        'invoice_code' => 'SYN-PROMO-001',
        'table_name' => 'Synthetic',
        'payment_method' => 'cash',
        'subtotal_amount' => 100000,
        'discount_amount' => 10000,
        'vat_amount' => 0,
        'total_amount' => 90000,
        'amount_received' => 90000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => $dataset->id,
    ]);
    InvoicePromotion::create([
        'invoice_id' => $synInvoice->id,
        'promotion_id' => $promotion->id,
        'code' => 'PROMO-SYN',
        'name' => 'Syn Promo',
        'discount_type' => 'fixed',
        'discount_value' => 10000,
        'amount' => 10000,
    ]);

    $res = $this->actingAs($admin)->get('/manager/promotions');
    $res->assertSuccessful();
    $promos = collect($res->original->getData()['page']['props']['promotions']);
    $promoRow = $promos->firstWhere('id', $promotion->id);
    expect($promoRow)->not->toBeNull()
        ->and((float) $promoRow['revenue'])->toBe(45000.0);
});

it('blocks store and destroy endpoints when synthetic forecasting is disabled by config', function () {
    config(['forecasting.synthetic_enabled' => false]);
    $user = userWithPermission('planning.experiments');

    $dataset = SyntheticDataset::create([
        'name' => 'disabled-dataset',
        'seed' => 42,
        'configuration' => ['days' => 10],
        'configuration_hash' => hash('sha256', '10'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'dis'),
    ]);

    $this->actingAs($user)
        ->postJson('/admin/synthetic-datasets', [
            'name' => 'should-fail-creation',
            'configuration' => ['days' => 5],
        ])
        ->assertForbidden();

    $this->actingAs($user)
        ->deleteJson("/admin/synthetic-datasets/{$dataset->id}", ['confirmation' => 'disabled-dataset'])
        ->assertForbidden();
});

it('removes linked DailyProductDemand and ForecastRun records on deletion and never converts them to real data', function () {
    $item = posMenuItem(['name' => 'Syn Menu Item']);

    $dataset = SyntheticDataset::create([
        'name' => 'dataset-to-cascade',
        'seed' => 999,
        'configuration' => ['days' => 20],
        'configuration_hash' => hash('sha256', '20'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'cascade'),
    ]);

    $synDemand = DailyProductDemand::create([
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'demand_date' => '2026-03-01',
        'quantity' => 15.0,
        'refunded_quantity' => 0.0,
        'order_count' => 5,
    ]);

    $synRun = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $realDemand = DailyProductDemand::create([
        'synthetic_dataset_id' => null,
        'menu_item_id' => $item->id,
        'demand_date' => '2026-03-01',
        'quantity' => 25.0,
        'refunded_quantity' => 0.0,
        'order_count' => 10,
    ]);

    $realRun = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => null,
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $user = userWithPermission('planning.experiments');

    $this->actingAs($user)
        ->deleteJson("/admin/synthetic-datasets/{$dataset->id}", ['confirmation' => 'dataset-to-cascade'])
        ->assertSuccessful();

    expect(SyntheticDataset::find($dataset->id))->toBeNull()
        ->and(DailyProductDemand::find($synDemand->id))->toBeNull()
        ->and(DailyProductDemand::where('synthetic_dataset_id', $dataset->id)->count())->toBe(0)
        ->and(DailyProductDemand::whereNull('synthetic_dataset_id')->count())->toBe(1)
        ->and(DailyProductDemand::whereNull('synthetic_dataset_id')->first()->id)->toBe($realDemand->id)
        ->and(ForecastRun::find($synRun->id))->toBeNull()
        ->and(ForecastRun::where('synthetic_dataset_id', $dataset->id)->count())->toBe(0)
        ->and(ForecastRun::whereNull('synthetic_dataset_id')->count())->toBe(1)
        ->and(ForecastRun::whereNull('synthetic_dataset_id')->first()->id)->toBe($realRun->id);
});
