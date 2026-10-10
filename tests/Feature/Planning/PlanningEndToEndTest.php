<?php

use App\Models\DailyProductDemand;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProcurementPlan;
use App\Models\ProductForecast;
use App\Models\ProductRecipe;
use App\Models\SecurityAuditLog;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\DemandSeriesBuilder;
use App\Services\Forecasting\ForecastOrchestrator;
use App\Services\Forecasting\IngredientDemandCalculator;
use App\Services\Forecasting\InventoryInput;
use App\Services\Forecasting\InventoryOptimizer;
use App\Services\Forecasting\SyntheticDemandGenerator;
use App\Services\Manager\DashboardService;
use Carbon\Carbon;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthorizationSeeder::class);
});

it('executes the full demand forecasting and inventory optimization lifecycle end-to-end', function () {
    $admin = posAdmin();

    // Setup master data: category, menu item, ingredient, recipe BOM, and supplier policy
    $category = MenuCategory::create([
        'name' => 'Cà phê đặc sản',
        'sort_order' => 1,
    ]);

    $menuItem = MenuItem::create([
        'category_id' => $category->id,
        'name' => 'Cà phê Robusta Pha Máy',
        'price' => 35000,
        'vat_rate' => 0,
        'is_available' => true,
    ]);

    $ingredient = Ingredient::create([
        'code' => 'ING-ROBUSTA',
        'name' => 'Hạt Robusta Honey',
        'unit' => 'g',
        'stock_quantity' => 100.0,
        'min_stock_alert' => 200.0,
        'cost_price' => 25.0,
        'purchase_unit' => 'g',
        'unit_conversion' => 1.0,
    ]);

    $recipe = ProductRecipe::create([
        'menu_item_id' => $menuItem->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 20.0,
        'unit' => 'g',
    ]);

    $supplier = Supplier::create([
        'name' => 'Nông Trại Cà Phê Cao Nguyên',
        'phone' => '0901234567',
        'address' => 'Đắk Lắk',
        'is_active' => true,
    ]);

    $policy = IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'is_primary' => true,
        'lead_days' => 3,
        'moq' => 500.0,
        'order_multiple' => 100.0,
        'pack_size' => 100.0,
        'ordering_cost' => 50000.0,
        'annual_holding_cost' => 100.0,
        'unit_cost' => 25.0,
        'service_factor' => 1.65,
    ]);

    // Step 1: Generate deterministic synthetic dataset (84 days to support expanding window >= 3 origins)
    $startDateStr = '2026-01-01';
    $config = [
        'days' => 84,
        'orders_per_day' => 20,
        'start_date' => $startDateStr,
        'menu_item_ids' => [$menuItem->id],
        'trend' => 0.02,
        'weekly' => true,
        'noise' => 0.05,
        'zero_demand_rate' => 0.0,
        'outlier_rate' => 0.0,
        'missing_rate' => 0.0,
        'stockout_censor_rate' => 0.0,
        'promotion_rate' => 0.0,
    ];

    $configHash = hash('sha256', (string) json_encode($config, JSON_THROW_ON_ERROR));

    $dataset = SyntheticDataset::create([
        'name' => 'E2E Full Lifecycle Synthetic Dataset',
        'description' => 'Deterministic 84-day dataset for end-to-end regression',
        'seed' => 4242,
        'configuration' => $config,
        'configuration_hash' => $configHash,
        'generator_version' => SyntheticDemandGenerator::VERSION,
        'dataset_hash' => hash('sha256', 'seed:4242:days:84'),
        'created_by' => $admin->id,
    ]);

    $generator = app(SyntheticDemandGenerator::class);
    $records = $generator->generate($config, 4242);
    $generator->persist($dataset, $records);

    $invoiceCount = Invoice::where('synthetic_dataset_id', $dataset->id)->count();
    expect($invoiceCount)->toBeGreaterThan(0);

    // Verify operational isolation: operational queries ignore synthetic invoices
    $realInvoiceCount = Invoice::whereNull('synthetic_dataset_id')->count();
    expect($realInvoiceCount)->toBe(0);

    $start = Carbon::parse($startDateStr)->startOfDay();
    $end = Carbon::parse($startDateStr)->endOfDay();
    $kpis = app(DashboardService::class)->kpis($start, $end, $start->copy()->subDay(), $end->copy()->subDay());
    expect($kpis['revenue']['value'])->toBe(0.0);

    // Step 2: Aggregate demand exclusively from synthetic dataset
    $seriesBuilder = app(DemandSeriesBuilder::class);
    $aggregatedRows = $seriesBuilder->aggregate($dataset->id);
    expect($aggregatedRows)->toBe(84);

    expect(DailyProductDemand::where('synthetic_dataset_id', $dataset->id)->count())->toBe(84)
        ->and(DailyProductDemand::whereNull('synthetic_dataset_id')->count())->toBe(0);

    // Step 3: Evaluate the 5 models with >= 3 origins
    $dataCutoff = Carbon::parse($startDateStr)->addDays(83)->startOfDay();

    $evalRun = ForecastRun::create([
        'kind' => 'evaluate',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => $dataCutoff,
        'status' => 'queued',
        'is_active' => false,
        'configuration' => ['horizon_days' => 7],
    ]);

    app(ForecastOrchestrator::class)->run($evalRun);

    $evalRun->refresh();
    expect($evalRun->status)->toBe('completed')
        ->and($evalRun->is_active)->toBeTrue();

    $evaluations = ForecastModelEvaluation::where('forecast_run_id', $evalRun->id)->get();
    expect($evaluations)->toHaveCount(5);

    $candidateKeys = $evaluations->pluck('model_key')->all();
    expect($candidateKeys)->toContain('sma_7', 'sma_14', 'sma_28', 'holt_winters_additive', 'holt_winters_multiplicative');

    foreach ($evaluations as $eval) {
        expect($eval->origins_evaluated)->toBeGreaterThanOrEqual(3)
            ->and($eval->mae)->toBeGreaterThanOrEqual(0.0)
            ->and($eval->rmse)->toBeGreaterThanOrEqual(0.0)
            ->and($eval->wape)->toBeGreaterThanOrEqual(0.0);
    }

    $selectedModel = $evaluations->firstWhere('is_selected', true);
    expect($selectedModel)->not->toBeNull();

    // Step 4: Publish 7-day forecast
    $forecastRun = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => $dataCutoff,
        'status' => 'queued',
        'is_active' => false,
        'configuration' => ['horizon_days' => 7],
    ]);

    app(ForecastOrchestrator::class)->run($forecastRun);

    $forecastRun->refresh();
    expect($forecastRun->status)->toBe('completed')
        ->and($forecastRun->is_active)->toBeTrue();

    $productForecasts = ProductForecast::where('forecast_run_id', $forecastRun->id)->get();
    expect($productForecasts)->toHaveCount(7);

    $totalForecastDemand = (float) $productForecasts->sum('forecast_quantity');
    expect($totalForecastDemand)->toBeGreaterThan(0.0);

    // Step 5: Convert via BOM to ingredient demand
    $recipes = ProductRecipe::with('ingredient')->where('menu_item_id', $menuItem->id)->get();
    $demandCalculator = app(IngredientDemandCalculator::class);
    $bomConversion = $demandCalculator->calculate($productForecasts, $recipes);

    expect($bomConversion['issues'])->toBeEmpty()
        ->and($bomConversion['demands'])->toHaveKey($ingredient->id)
        ->and($bomConversion['bom_hash'])->not->toBeEmpty();

    $ingredientDemandQty = (float) $bomConversion['demands'][$ingredient->id]['demand_quantity'];
    expect($ingredientDemandQty)->toEqualWithDelta($totalForecastDemand * 20.0, 0.01);

    // Step 6: Generate inventory recommendation
    $optimizer = app(InventoryOptimizer::class);
    $decision = $optimizer->recommend(new InventoryInput(
        available: (float) $ingredient->stock_quantity,
        dailyDemandStdDev: 50.0,
        leadDays: (float) $policy->lead_days,
        serviceFactor: (float) $policy->service_factor,
        annualDemand: $ingredientDemandQty * 52.0,
        orderingCost: (float) $policy->ordering_cost,
        annualHoldingCost: (float) $policy->annual_holding_cost,
        moq: (float) $policy->moq,
        orderMultiple: (float) $policy->order_multiple,
        dailyDemand: $ingredientDemandQty / 7.0,
    ));

    expect($decision->triggersOrder)->toBeTrue()
        ->and($decision->finalQuantity)->toBeGreaterThanOrEqual((float) $policy->moq);

    // Calculate recipe-level BOM hash consistent with RecommendationFreshness assertion
    $currentBomHash = $demandCalculator->bomHash(ProductRecipe::where('ingredient_id', $ingredient->id)->get());

    $recommendation = InventoryRecommendation::updateOrCreate([
        'forecast_run_id' => $forecastRun->id,
        'ingredient_id' => $ingredient->id,
    ], [
        'supplier_id' => $supplier->id,
        'demand_quantity' => $ingredientDemandQty,
        'stock_quantity' => (float) $ingredient->stock_quantity,
        'reserved_quantity' => 0.0,
        'safety_stock' => $decision->safetyStock,
        'reorder_point' => $decision->reorderPoint,
        'raw_quantity' => $decision->rawQuantity,
        'after_moq_quantity' => $decision->afterMoqQuantity,
        'final_quantity' => $decision->finalQuantity,
        'suggested_quantity' => $decision->finalQuantity,
        'method' => $decision->method,
        'unit' => $ingredient->unit,
        'purchase_unit' => $ingredient->purchase_unit ?? $ingredient->unit,
        'bom_hash' => $currentBomHash,
        'policy_hash' => null,
        'stock_snapshot_at' => now()->addMinute(),
        'stock_snapshot_quantity' => (float) $ingredient->stock_quantity,
        'status' => 'pending',
    ]);

    expect($recommendation->status)->toBe('pending');

    // Step 7: Approve procurement plan without modifying stock
    $stockBeforeApproval = (float) $ingredient->fresh()->stock_quantity;
    expect($stockBeforeApproval)->toBe(100.0);

    $reviewResponse = $this->actingAs($admin)->post('/planning/procurement/plans', [
        'items' => [
            [
                'recommendation_id' => $recommendation->id,
                'final_quantity' => $decision->finalQuantity,
                'adjustment_reason' => null,
            ],
        ],
    ]);

    $reviewResponse->assertRedirect();

    expect(ProcurementPlan::count())->toBe(1);
    $plan = ProcurementPlan::with('items')->first();
    expect($plan->status)->toBe('approved')
        ->and($plan->supplier_id)->toBe($supplier->id)
        ->and($plan->items)->toHaveCount(1);

    $planItem = $plan->items->first();
    expect($planItem->ingredient_id)->toBe($ingredient->id)
        ->and((float) $planItem->final_quantity)->toBe((float) $decision->finalQuantity)
        ->and($planItem->stock_voucher_item_id)->toBeNull();

    expect($recommendation->fresh()->status)->toBe('approved');

    // Assert stock remains strictly unchanged upon plan approval
    expect((float) $ingredient->fresh()->stock_quantity)->toBe($stockBeforeApproval);

    // Step 8: Prefill stock voucher from plan and assert stock updates ONLY upon voucher submission
    $voucherPageResponse = $this->actingAs($admin)->get("/manager/inventory/vouchers?procurement_plan_id={$plan->id}");
    $voucherPageResponse->assertOk();

    // Submit actual stock import voucher referencing the procurement plan
    $importQuantity = (float) $planItem->final_quantity;
    $submitVoucherResponse = $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'type' => 'import',
        'supplier_id' => $supplier->id,
        'procurement_plan_id' => $plan->id,
        'note' => "Import fulfilled from procurement plan {$plan->plan_code}",
        'items' => [
            [
                'procurement_plan_item_id' => $planItem->id,
                'ingredient_id' => $ingredient->id,
                'quantity' => $importQuantity,
                'unit_price' => (float) $planItem->unit_price,
                'unit' => $planItem->unit,
            ],
        ],
    ]);

    $submitVoucherResponse->assertRedirect();

    // Verify stock updated ONLY upon voucher submission
    $expectedFinalStock = $stockBeforeApproval + $importQuantity;
    expect((float) $ingredient->fresh()->stock_quantity)->toBe($expectedFinalStock);

    // Verify plan item and procurement plan are marked fulfilled/completed
    $planItem->refresh();
    expect($planItem->stock_voucher_item_id)->not->toBeNull()
        ->and($planItem->status)->toBe('received');

    $plan->refresh();
    expect($plan->status)->toBe('completed');
});

it('blocks operational refunds against synthetic invoices', function () {
    $admin = posAdmin();

    $dataset = SyntheticDataset::create([
        'name' => 'Refund Isolation Dataset',
        'seed' => 9999,
        'configuration' => ['days' => 1],
        'configuration_hash' => hash('sha256', 'refund-iso'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'refund-ds'),
    ]);

    $invoice = Invoice::create([
        'invoice_code' => 'SYN-REFUND-001',
        'table_name' => 'Mang Đi',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => now(),
        'synthetic_dataset_id' => $dataset->id,
    ]);

    $line = InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'name_snapshot' => 'Synthetic Item',
        'quantity' => 1,
        'unit_price' => 50000,
        'subtotal' => 50000,
        'discount_amount' => 0,
        'vat_rate' => 0,
        'vat_amount' => 0,
        'refunded_qty' => 0,
    ]);

    $response = $this->actingAs($admin)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [
            [
                'invoice_line_id' => $line->id,
                'qty' => 1,
            ],
        ],
        'reason' => 'Testing synthetic isolation',
        'idempotency_key' => 'idemp-syn-'.uniqid(),
    ]);

    $response->assertStatus(422);
});

it('records audit log when procurement plan quantity is manually adjusted', function () {
    $admin = posAdmin();

    $ingredient = Ingredient::create([
        'code' => 'ING-AUDIT-ADJ',
        'name' => 'Đậu rang mộc',
        'unit' => 'g',
        'stock_quantity' => 500.0,
        'min_stock_alert' => 200.0,
        'cost_price' => 30.0,
    ]);

    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 100.0);

    $response = $this->actingAs($admin)->post('/planning/procurement/plans', [
        'items' => [
            [
                'recommendation_id' => $recommendation->id,
                'final_quantity' => 150.0,
                'adjustment_reason' => 'Dự phòng nhu cầu tăng đột biến cuối tuần',
            ],
        ],
    ]);

    $response->assertRedirect();

    $auditLog = SecurityAuditLog::where('action', 'procurement_plan.manual_adjustment')->latest('id')->first();
    expect($auditLog)->not->toBeNull()
        ->and($auditLog->actor_id)->toBe($admin->id)
        ->and((float) $auditLog->after['final_quantity'])->toEqual(150.0)
        ->and($auditLog->after['adjustment_reason'])->toBe('Dự phòng nhu cầu tăng đột biến cuối tuần');
});
