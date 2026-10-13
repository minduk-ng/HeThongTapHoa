<?php

use App\Models\Ingredient;
use App\Models\InventoryRecommendation;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\ForecastRunFactory;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    config(['forecasting.synthetic_enabled' => true]);
    $this->seed(AuthorizationSeeder::class);
});

it('preserves dataset isolation and unit conversions in approved procurement plans', function () {
    $admin = posAdmin();

    $dataset = SyntheticDataset::create([
        'name' => 'Procurement Units Dataset',
        'seed' => 77,
        'configuration' => ['days' => 14],
        'configuration_hash' => 'h',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'dh',
        'status' => 'completed',
    ]);

    $ingredient = Ingredient::create([
        'code' => 'ING-COFFEE-BEANS',
        'name' => 'Cà phê hạt Robusta',
        'unit' => 'g',
        'stock_quantity' => 500.0,
        'cost_price' => 2.0, // 2 VND per gram
        'purchase_unit' => 'kg',
        'unit_conversion' => 1000.0,
    ]);

    $supplier = Supplier::create([
        'name' => 'Đại lý Cà phê',
        'phone' => '0933333333',
        'is_active' => true,
    ]);

    $run = app(ForecastRunFactory::class)->create('forecast', $dataset->id, 7);
    $run->update(['status' => 'completed', 'is_active' => true]);
    $run->refresh();
    $snapshotHash = $run->configuration['snapshot']['content_hash'] ?? null;
    expect($snapshotHash)->not->toBeNull();

    $rec = InventoryRecommendation::create([
        'forecast_run_id' => $run->id,
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'demand_quantity' => 2500.0,
        'stock_quantity' => 500.0,
        'reserved_quantity' => 0.0,
        'safety_stock' => 100.0,
        'reorder_point' => 600.0,
        'raw_quantity' => 2500.0,
        'after_moq_quantity' => 2500.0,
        'final_quantity' => 2500.0,
        'suggested_quantity' => 2500.0,
        'method' => 'reorder_gap',
        'unit' => 'g',
        'purchase_unit' => 'kg',
        'bom_hash' => $snapshotHash,
        'stock_snapshot_at' => now(),
        'stock_snapshot_quantity' => 500.0,
        'status' => 'pending',
        'explanation' => [
            'pack_size' => 1000.0,
            'base_unit' => 'g',
            'purchase_unit' => 'kg',
        ],
    ]);

    $response = $this->actingAs($admin)->post('/planning/procurement/plans', [
        'items' => [
            [
                'recommendation_id' => $rec->id,
                'final_quantity' => 2500.0,
            ],
        ],
        'notes' => 'Duyệt kế hoạch mô phỏng',
    ]);

    $response->assertRedirect();

    $plan = ProcurementPlan::where('forecast_run_id', $run->id)->first();
    expect($plan)->not->toBeNull()
        ->and($plan->synthetic_dataset_id)->toBe($dataset->id)
        ->and($plan->status)->toBe('approved');

    $item = ProcurementPlanItem::where('procurement_plan_id', $plan->id)->first();
    expect($item)->not->toBeNull()
        ->and((float) $item->final_quantity)->toBe(2500.0)
        ->and($item->unit)->toBe('g')
        ->and((float) $item->purchase_quantity)->toBe(2.5)
        ->and($item->purchase_unit)->toBe('kg')
        ->and((float) $item->unit_price)->toBe(2.0)
        ->and((float) $item->total_price)->toBe(5000.0);
});
