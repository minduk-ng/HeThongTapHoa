<?php

use App\Models\Ingredient;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\StockVoucher;
use App\Models\SyntheticDataset;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
});

it('rejects synthetic procurement references without changing operational stock', function (string $reference) {
    $admin = posAdmin();
    $dataset = SyntheticDataset::create([
        'name' => 'Isolation', 'seed' => 42, 'configuration' => [],
        'configuration_hash' => 'config', 'generator_version' => '2.0.0', 'dataset_hash' => 'data',
    ]);
    $run = planningForecastRun(['synthetic_dataset_id' => $dataset->id]);
    $ingredient = Ingredient::create([
        'code' => 'ISOLATED', 'name' => 'Flour', 'unit' => 'g', 'stock_quantity' => 100,
    ]);
    $rec = planningRecommendation($ingredient, 10, ['forecast_run_id' => $run->id]);
    // Legacy plan has no dataset column populated; linked run still identifies source.
    $plan = ProcurementPlan::create([
        'plan_code' => 'SYN-ISOLATION', 'forecast_run_id' => $run->id, 'status' => 'approved',
    ]);
    $item = ProcurementPlanItem::create([
        'procurement_plan_id' => $plan->id, 'inventory_recommendation_id' => $rec->id,
        'ingredient_id' => $ingredient->id, 'suggested_quantity' => 10, 'final_quantity' => 10,
        'unit' => 'g', 'unit_price' => 2, 'total_price' => 20, 'status' => 'approved',
    ]);
    $payload = ['items' => [['ingredient_id' => $ingredient->id, 'quantity' => 10, 'unit_price' => 2]]];
    if ($reference !== 'item') {
        $payload['procurement_plan_id'] = $plan->id;
    }
    if ($reference !== 'plan') {
        $payload['items'][0]['procurement_plan_item_id'] = $item->id;
    }

    $this->actingAs($admin)->postJson('/manager/inventory/vouchers', $payload)->assertUnprocessable();
    expect($ingredient->fresh()->stock_quantity)->toEqual(100)
        ->and(StockVoucher::count())->toBe(0)
        ->and($plan->fresh()->status)->toBe('approved')
        ->and($item->fresh()->stock_voucher_item_id)->toBeNull();
    $this->get("/manager/inventory/vouchers?procurement_plan_id={$plan->id}")->assertUnprocessable();
})->with(['plan', 'item', 'both']);
