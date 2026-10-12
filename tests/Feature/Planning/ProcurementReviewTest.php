<?php

use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\SecurityAuditLog;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('does not increase stock when approving a procurement plan', function () {
    $ingredient = Ingredient::create([
        'code' => 'PLAN-MILK',
        'name' => 'Sữa kế hoạch',
        'unit' => 'ml',
        'stock_quantity' => 14000,
        'min_stock_alert' => 5000,
        'cost_price' => 35,
        'purchase_unit' => 'can',
        'unit_conversion' => 950,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 24);
    $before = $ingredient->stock_quantity;

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 24,
            'adjustment_reason' => null,
        ]],
    ])
        ->assertRedirect();

    expect($ingredient->fresh()->stock_quantity)->toBe($before);
});

it('rejects stale recommendations when stock changed after snapshot', function () {
    $ingredient = Ingredient::create([
        'code' => 'PLAN-BEANS',
        'name' => 'Hạt cà phê',
        'unit' => 'g',
        'stock_quantity' => 5000,
        'min_stock_alert' => 1000,
        'cost_price' => 200,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 10);

    // Mutate ingredient stock
    $ingredient->update(['stock_quantity' => 4500]);

    $response = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 10,
            'adjustment_reason' => null,
        ]],
    ]);

    $response->assertStatus(422);
    expect(ProcurementPlan::count())->toBe(0);
});

it('requires a reason when final quantity differs from suggested quantity', function () {
    $ingredient = Ingredient::create([
        'code' => 'PLAN-TEA',
        'name' => 'Trà xanh',
        'unit' => 'g',
        'stock_quantity' => 2000,
        'min_stock_alert' => 500,
        'cost_price' => 150,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 10);

    $response = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 15,
            'adjustment_reason' => null,
        ]],
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['items.0.adjustment_reason']);
    expect(ProcurementPlan::count())->toBe(0);
});

it('creates approved procurement plan and records security audit log on adjustment with reason', function () {
    $admin = posAdmin();
    $ingredient = Ingredient::create([
        'code' => 'PLAN-SUGAR',
        'name' => 'Đường kính',
        'unit' => 'kg',
        'stock_quantity' => 100,
        'min_stock_alert' => 20,
        'cost_price' => 22000,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 10);

    $this->actingAs($admin)->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 15,
            'adjustment_reason' => 'Tăng dự trữ cho tuần lễ hội',
        ]],
    ])->assertRedirect();

    $plan = ProcurementPlan::first();
    expect($plan)->not->toBeNull()
        ->and($plan->status)->toBe('approved')
        ->and($plan->approved_by)->toBe($admin->id);

    $planItem = $plan->items()->first();
    expect($planItem)->not->toBeNull()
        ->and($planItem->suggested_quantity)->toBe(10.0)
        ->and($planItem->final_quantity)->toBe(15.0)
        ->and($planItem->adjustment_reason)->toBe('Tăng dự trữ cho tuần lễ hội');

    $log = SecurityAuditLog::where('action', 'procurement_plan.manual_adjustment')->first();
    expect($log)->not->toBeNull()
        ->and($log->actor_id)->toBe($admin->id)
        ->and((float) $log->before['suggested_quantity'])->toBe(10.0)
        ->and((float) $log->after['final_quantity'])->toBe(15.0);
});

it('groups plan items by supplier into distinct procurement plans', function () {
    $sup1 = Supplier::create(['name' => 'Nhà cung cấp A', 'phone' => '0901234567']);
    $sup2 = Supplier::create(['name' => 'Nhà cung cấp B', 'phone' => '0901234568']);

    $ing1 = Ingredient::create([
        'code' => 'ING-GRP-1', 'name' => 'Item 1', 'unit' => 'kg',
        'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 10000,
    ]);
    $ing2 = Ingredient::create([
        'code' => 'ING-GRP-2', 'name' => 'Item 2', 'unit' => 'kg',
        'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 20000,
    ]);

    $sharedRunId = planningForecastRun()->id;
    $rec1 = planningRecommendation($ing1, 5, ['supplier_id' => $sup1->id, 'forecast_run_id' => $sharedRunId]);
    $rec2 = planningRecommendation($ing2, 8, ['supplier_id' => $sup2->id, 'forecast_run_id' => $sharedRunId]);

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [
            ['recommendation_id' => $rec1->id, 'final_quantity' => 5, 'adjustment_reason' => null],
            ['recommendation_id' => $rec2->id, 'final_quantity' => 8, 'adjustment_reason' => null],
        ],
    ])->assertRedirect();

    expect(ProcurementPlan::count())->toBe(2);
    expect(ProcurementPlan::where('supplier_id', $sup1->id)->count())->toBe(1);
    expect(ProcurementPlan::where('supplier_id', $sup2->id)->count())->toBe(1);
});

it('validates final quantity against moq and order multiple', function () {
    $supplier = Supplier::create(['name' => 'NCC Chính', 'phone' => '0909090909']);
    $ingredient = Ingredient::create([
        'code' => 'ING-MOQ', 'name' => 'Bột mì', 'unit' => 'kg',
        'stock_quantity' => 20, 'min_stock_alert' => 10, 'cost_price' => 15000,
    ]);
    IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'is_primary' => true,
        'lead_days' => 2,
        'moq' => 10,
        'order_multiple' => 5,
        'pack_size' => 1,
        'ordering_cost' => 50000,
        'annual_holding_cost' => 2000,
    ]);

    $rec = planningRecommendation($ingredient, 10, ['supplier_id' => $supplier->id]);

    // Less than MOQ
    $resMoq = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $rec->id,
            'final_quantity' => 8,
            'adjustment_reason' => 'Thử giảm dưới MOQ',
        ]],
    ]);
    $resMoq->assertStatus(422);

    // Not multiple of 5
    $resMul = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $rec->id,
            'final_quantity' => 12,
            'adjustment_reason' => 'Thử số lượng không chia hết',
        ]],
    ]);
    $resMul->assertStatus(422);
});

it('prefills stock voucher from procurement plan via GET /manager/inventory/vouchers?procurement_plan_id={id}', function () {
    $ingredient = Ingredient::create([
        'code' => 'ING-PREFILL', 'name' => 'Bơ lạt', 'unit' => 'kg',
        'stock_quantity' => 5, 'min_stock_alert' => 2, 'cost_price' => 80000,
    ]);
    $rec = planningRecommendation($ingredient, suggestedQuantity: 12);

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $rec->id,
            'final_quantity' => 12,
            'adjustment_reason' => null,
        ]],
    ]);

    $plan = ProcurementPlan::firstOrFail();

    $response = $this->actingAs(posAdmin())
        ->get("/manager/inventory/vouchers?procurement_plan_id={$plan->id}");

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('manager/inventory/vouchers/StockVouchersManager')
            ->has('prefill')
            ->where('prefill.procurement_plan_id', $plan->id)
            ->where('prefill.items.0.ingredient_id', $ingredient->id)
            ->where('prefill.items.0.quantity', 12)
        );
});

it('links voucher items to procurement plan items on stock voucher store', function () {
    $supplier = Supplier::create(['name' => 'NCC Bơ', 'phone' => '0901111222']);
    $ingredient = Ingredient::create([
        'code' => 'ING-LINK', 'name' => 'Phô mai', 'unit' => 'kg',
        'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 50000,
    ]);
    $rec = planningRecommendation($ingredient, 20, ['supplier_id' => $supplier->id]);

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $rec->id,
            'final_quantity' => 20,
            'adjustment_reason' => null,
        ]],
    ]);

    $plan = ProcurementPlan::firstOrFail();
    $planItem = $plan->items()->firstOrFail();

    // Now stock voucher store with procurement_plan_id and procurement_plan_item_id
    $this->actingAs(posAdmin())->post('/manager/inventory/vouchers', [
        'procurement_plan_id' => $plan->id,
        'supplier_id' => $supplier->id,
        'note' => 'Nhập hàng thực tế từ kế hoạch',
        'items' => [[
            'procurement_plan_item_id' => $planItem->id,
            'ingredient_id' => $ingredient->id,
            'quantity' => 20,
            'unit_price' => 50000,
        ]],
    ])->assertRedirect();

    expect($ingredient->fresh()->stock_quantity)->toBe(30.0);
    expect($planItem->fresh()->stock_voucher_item_id)->not->toBeNull();
});

it('calculates plan item unit price using purchase unit conversion', function () {
    $ingredient = Ingredient::create([
        'code' => 'ING-CONV-PRICE',
        'name' => 'Sữa đặc',
        'unit' => 'ml',
        'stock_quantity' => 1000,
        'min_stock_alert' => 500,
        'cost_price' => 35,
        'purchase_unit' => 'can',
        'unit_conversion' => 950,
    ]);
    $recommendation = planningRecommendation($ingredient, 10);

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 10,
            'adjustment_reason' => null,
        ]],
    ])->assertRedirect();

    $item = ProcurementPlanItem::where('inventory_recommendation_id', $recommendation->id)->firstOrFail();
    expect($item->unit)->toBe('ml')
        ->and($item->purchase_unit)->toBe('can')
        ->and($item->purchase_quantity)->toEqualWithDelta(10 / 950, 0.0001)
        ->and($item->unit_price)->toBe(35.0)
        ->and($item->total_price)->toBe(350.0);
});

it('rejects duplicate recommendation ids in items array', function () {
    $ingredient = Ingredient::create([
        'code' => 'ING-DUP',
        'name' => 'Nguyên liệu trùng',
        'unit' => 'kg',
        'stock_quantity' => 10,
        'min_stock_alert' => 5,
        'cost_price' => 10000,
    ]);
    $rec = planningRecommendation($ingredient, 10);

    $response = $this->actingAs(posAdmin())->postJson('/planning/procurement/plans', [
        'items' => [
            ['recommendation_id' => $rec->id, 'final_quantity' => 10, 'adjustment_reason' => null],
            ['recommendation_id' => $rec->id, 'final_quantity' => 10, 'adjustment_reason' => null],
        ],
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['items.0.recommendation_id', 'items.1.recommendation_id']);
});

it('filters already received plan items from voucher prefill', function () {
    $supplier = Supplier::create(['name' => 'NCC Filter', 'phone' => '0908888777']);
    $ing1 = Ingredient::create([
        'code' => 'ING-F1', 'name' => 'Item F1', 'unit' => 'kg',
        'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 10000,
    ]);
    $ing2 = Ingredient::create([
        'code' => 'ING-F2', 'name' => 'Item F2', 'unit' => 'kg',
        'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 20000,
    ]);

    $sharedFilterRunId = planningForecastRun()->id;
    $rec1 = planningRecommendation($ing1, 5, ['supplier_id' => $supplier->id, 'forecast_run_id' => $sharedFilterRunId]);
    $rec2 = planningRecommendation($ing2, 8, ['supplier_id' => $supplier->id, 'forecast_run_id' => $sharedFilterRunId]);

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [
            ['recommendation_id' => $rec1->id, 'final_quantity' => 5, 'adjustment_reason' => null],
            ['recommendation_id' => $rec2->id, 'final_quantity' => 8, 'adjustment_reason' => null],
        ],
    ])->assertRedirect();

    $plan = ProcurementPlan::firstOrFail();
    $item1 = $plan->items()->where('ingredient_id', $ing1->id)->firstOrFail();

    // Mark item1 as already received via stock voucher
    $this->actingAs(posAdmin())->post('/manager/inventory/vouchers', [
        'procurement_plan_id' => $plan->id,
        'supplier_id' => $supplier->id,
        'items' => [[
            'procurement_plan_item_id' => $item1->id,
            'ingredient_id' => $ing1->id,
            'quantity' => 5,
            'unit_price' => 10000,
        ]],
    ])->assertRedirect();

    expect($item1->fresh()->stock_voucher_item_id)->not->toBeNull();

    // Now request prefill for the plan: only item2 should be in prefill items
    $response = $this->actingAs(posAdmin())
        ->get("/manager/inventory/vouchers?procurement_plan_id={$plan->id}");

    $response->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('manager/inventory/vouchers/StockVouchersManager')
            ->has('prefill.items', 1)
            ->where('prefill.items.0.ingredient_id', $ing2->id)
            ->where('prefill.items.0.quantity', 8)
        );
});
