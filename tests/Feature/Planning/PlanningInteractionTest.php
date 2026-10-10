<?php

use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
});

it('exposes snapshot, cutoff, method, and rounding stages in procurement recommendations props', function () {
    $supplier = Supplier::create([
        'name' => 'Nhà cung cấp Test',
        'phone' => '0912345678',
    ]);

    $ingredient = Ingredient::create([
        'code' => 'ING-TEST-STAGE',
        'name' => 'Bột pha chế',
        'unit' => 'kg',
        'stock_quantity' => 50,
        'min_stock_alert' => 20,
        'cost_price' => 45000,
        'purchase_unit' => 'bao',
        'unit_conversion' => 25,
    ]);

    IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'is_primary' => true,
        'lead_days' => 3,
        'moq' => 10,
        'order_multiple' => 5,
        'pack_size' => 1,
        'ordering_cost' => 50000,
        'annual_holding_cost' => 5000,
    ]);

    $cutoff = now()->startOfDay();
    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => $cutoff,
        'status' => 'completed',
        'is_active' => true,
    ]);

    $snapshotTime = now()->subMinutes(10);
    $recommendation = InventoryRecommendation::create([
        'forecast_run_id' => $run->id,
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'demand_quantity' => 38.5,
        'stock_quantity' => 50.0,
        'reserved_quantity' => 0.0,
        'safety_stock' => 15.0,
        'reorder_point' => 40.0,
        'raw_quantity' => 12.3,
        'after_moq_quantity' => 20.0,
        'final_quantity' => 25.0,
        'suggested_quantity' => 25.0,
        'method' => 'eoq',
        'unit' => 'kg',
        'purchase_unit' => 'bao',
        'bom_hash' => hash('sha256', 'bom-test'),
        'policy_hash' => hash('sha256', 'policy-test'),
        'stock_snapshot_at' => $snapshotTime,
        'stock_snapshot_quantity' => 50.0,
        'status' => 'pending',
    ]);

    $response = $this->actingAs(posAdmin())->get('/planning/procurement');

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('planning/ProcurementRecommendations')
            ->has('activeRun')
            ->has('recommendations', 1)
            ->where('activeRun.data_cutoff', fn ($val) => ! empty($val))
            ->where('recommendations.0.method', 'eoq')
            ->where('recommendations.0.stock_snapshot_at', fn ($val) => ! empty($val))
            ->where('recommendations.0.stock_snapshot_quantity', 50)
            ->where('recommendations.0.raw_quantity', 12.3)
            ->where('recommendations.0.after_moq_quantity', 20)
            ->where('recommendations.0.final_quantity', 25)
            ->where('recommendations.0.suggested_quantity', 25)
        );
});

it('exposes seed, config, dataset hash, and source label in synthetic datasets props', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'Tập dữ liệu thử nghiệm Alpha',
        'description' => 'Bộ dữ liệu mô phỏng quán trà sữa',
        'seed' => 1337,
        'configuration' => [
            'days' => 90,
            'orders_per_day' => 25,
            'trend' => 0.05,
            'weekly' => true,
        ],
        'configuration_hash' => hash('sha256', 'config-hash'),
        'generator_version' => '1.0.0',
        'dataset_hash' => 'hash-alpha-777',
    ]);

    $response = $this->actingAs(posAdmin())->get('/admin/synthetic-datasets');

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/planning/SyntheticDatasets')
            ->has('datasets', 1)
            ->where('datasets.0.seed', 1337)
            ->where('datasets.0.config.days', 90)
            ->where('datasets.0.dataset_hash', 'hash-alpha-777')
            ->where('datasets.0.source_label', 'Tập dữ liệu thử nghiệm Alpha')
        );
});

it('returns 422 when submitting stale recommendations during review', function () {
    $ingredient = Ingredient::create([
        'code' => 'ING-STALE-CHECK',
        'name' => 'Sữa chua dẻo',
        'unit' => 'hộp',
        'stock_quantity' => 100,
        'min_stock_alert' => 20,
        'cost_price' => 12000,
    ]);

    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 15);

    // Stock changed after recommendation snapshot was created
    $ingredient->update(['stock_quantity' => 80]);

    $response = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 15,
            'adjustment_reason' => null,
        ]],
    ]);

    $response->assertStatus(422);
});
