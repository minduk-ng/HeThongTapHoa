<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\ReviewProcurementRequest;
use App\Models\Ingredient;
use App\Models\InventoryRecommendation;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\SecurityAuditLog;
use App\Services\Forecasting\RecommendationFreshness;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

class ProcurementRecommendationController extends Controller
{
    /**
     * Review recommendations and create approved procurement plans grouped by supplier.
     * Note: Does NOT modify ingredient stock_quantity.
     */
    public function store(ReviewProcurementRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $items = $validated['items'];
        $user = $request->user();

        DB::transaction(function () use ($items, $validated, $user, $request) {
            $recIds = array_column($items, 'recommendation_id');

            // 1. Lock selected recommendations and ingredients
            /** @var Collection<int, InventoryRecommendation> $recommendations */
            $recommendations = InventoryRecommendation::whereIn('id', $recIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $ingredientIds = $recommendations->pluck('ingredient_id')->unique()->all();
            /** @var Collection<int, Ingredient> $ingredients */
            $ingredients = Ingredient::whereIn('id', $ingredientIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            // 2. Validate freshness for all recommendations
            foreach ($items as $itemData) {
                $rec = $recommendations->get($itemData['recommendation_id']);
                if ($rec) {
                    RecommendationFreshness::assertFresh($rec);
                }
            }

            // 3. Group plan items by supplier
            /** @var array<string|int, array<int, array{item: array<string, mixed>, recommendation: InventoryRecommendation, ingredient: Ingredient}>> $groups */
            $groups = [];
            foreach ($items as $itemData) {
                /** @var InventoryRecommendation $rec */
                $rec = $recommendations->get($itemData['recommendation_id']);
                /** @var Ingredient $ing */
                $ing = $ingredients->get($rec->ingredient_id);

                $supplierKey = $rec->supplier_id ?? 'none';
                $groups[$supplierKey][] = [
                    'item' => $itemData,
                    'recommendation' => $rec,
                    'ingredient' => $ing,
                ];
            }

            // 4. Create approved ProcurementPlan per supplier group
            foreach ($groups as $groupItems) {
                $dateStr = now()->format('Ymd');
                $prefix = "PLAN-{$dateStr}-";
                $maxSeq = ProcurementPlan::where('plan_code', 'like', $prefix.'%')
                    ->lockForUpdate()
                    ->pluck('plan_code')
                    ->map(fn ($code) => (int) substr((string) $code, strlen($prefix)))
                    ->max() ?? 0;
                $planCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

                $firstRec = $groupItems[0]['recommendation'];
                $supplierId = $firstRec->supplier_id;

                $plan = ProcurementPlan::create([
                    'plan_code' => $planCode,
                    'supplier_id' => $supplierId,
                    'forecast_run_id' => $firstRec->forecast_run_id,
                    'status' => 'approved',
                    'approved_by' => $user?->id,
                    'approved_at' => now(),
                    'notes' => $validated['notes'] ?? null,
                ]);

                foreach ($groupItems as $entry) {
                    $itemData = $entry['item'];
                    $rec = $entry['recommendation'];
                    $ingredient = $entry['ingredient'];

                    $finalQty = (float) $itemData['final_quantity'];
                    $suggestedQty = (float) $rec->suggested_quantity;
                    $reason = $itemData['adjustment_reason'] ?? null;

                    $unitPrice = (float) ($ingredient->cost_price ?? 0.0);
                    $totalPrice = round($finalQty * $unitPrice, 2);

                    $planItem = ProcurementPlanItem::create([
                        'procurement_plan_id' => $plan->id,
                        'inventory_recommendation_id' => $rec->id,
                        'ingredient_id' => $ingredient->id,
                        'supplier_id' => $supplierId,
                        'suggested_quantity' => $suggestedQty,
                        'final_quantity' => $finalQty,
                        'unit' => $rec->purchase_unit ?: ($rec->unit ?: ($ingredient->purchase_unit ?: $ingredient->unit)),
                        'unit_price' => $unitPrice,
                        'total_price' => $totalPrice,
                        'adjustment_reason' => $reason,
                        'status' => 'approved',
                    ]);

                    $rec->update(['status' => 'approved']);

                    // Audit log on quantity change
                    if (abs($finalQty - $suggestedQty) > 0.0001) {
                        SecurityAuditLog::record(
                            actor: $user,
                            action: 'procurement_plan.manual_adjustment',
                            target: $planItem,
                            before: [
                                'suggested_quantity' => $suggestedQty,
                                'quantity' => $suggestedQty,
                            ],
                            after: [
                                'final_quantity' => $finalQty,
                                'quantity' => $finalQty,
                                'adjustment_reason' => $reason,
                            ],
                            ip: $request->ip(),
                            userAgent: $request->userAgent(),
                        );
                    }
                }
            }
        });

        return redirect()->back()->with('success', 'Tạo kế hoạch mua hàng thành công.');
    }
}
