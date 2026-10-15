<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\ReviewProcurementRequest;
use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\InventoryRecommendation;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\SecurityAuditLog;
use App\Services\Forecasting\RecommendationFreshness;
use App\Services\Forecasting\PlanningResultSummary;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProcurementRecommendationController extends Controller
{
    public function index(Request $request, PlanningResultSummary $resultSummary): Response
    {
        $datasetId = $request->query('synthetic_dataset_id') !== null
            ? (int) $request->query('synthetic_dataset_id')
            : null;

        $horizonDays = $request->query('horizon_days') !== null && $request->query('horizon_days') !== ''
            ? (int) $request->query('horizon_days') : null;

        $activeRun = ForecastRun::where('kind', 'forecast')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->with('syntheticDataset')
            ->latest('id')
            ->first();

        $latestRun = ForecastRun::where('kind', 'forecast')
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->when($horizonDays !== null, fn ($q) => $q->where('horizon_days', $horizonDays))
            ->latest('id')->first();

        $recommendations = $activeRun
            ? InventoryRecommendation::with([
                'ingredient.primarySupplierPolicy.supplier',
                'ingredient.supplierPolicies.supplier',
                'supplier',
            ])
                ->where('forecast_run_id', $activeRun->id)
                ->get()
            : [];

        return Inertia::render('planning/ProcurementRecommendations', [
            'activeRun' => $activeRun,
            'resultSummary' => $resultSummary->forRun($activeRun, $latestRun, $horizonDays),
            'recommendations' => $recommendations,
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
                'horizon_days' => $horizonDays ?? $activeRun->horizon_days ?? 7,
            ],
        ]);
    }

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
                $forecastRun = $firstRec->relationLoaded('forecastRun') ? $firstRec->forecastRun : $firstRec->forecastRun()->first();

                $plan = ProcurementPlan::create([
                    'plan_code' => $planCode,
                    'supplier_id' => $supplierId,
                    'forecast_run_id' => $firstRec->forecast_run_id,
                    'synthetic_dataset_id' => $forecastRun?->synthetic_dataset_id,
                    'status' => 'approved',
                    'approved_by' => $user?->id,
                    'approved_at' => now(),
                    'notes' => $validated['notes'] ?? null,
                ]);

                foreach ($groupItems as $entry) {
                    $itemData = $entry['item'];
                    $rec = $entry['recommendation'];
                    $ingredient = $entry['ingredient'];
                    $recRun = $rec->relationLoaded('forecastRun') ? $rec->forecastRun : $rec->forecastRun()->first();
                    $recSnapshot = ($recRun && is_array($recRun->configuration)) ? ($recRun->configuration['snapshot'] ?? null) : null;
                    $snapIng = is_array($recSnapshot) ? ($recSnapshot['ingredients'][$rec->ingredient_id] ?? null) : null;

                    $finalQty = (float) $itemData['final_quantity'];
                    $suggestedQty = (float) $rec->suggested_quantity;
                    $reason = $itemData['adjustment_reason'] ?? null;

                    $unit = (string) ($snapIng['unit'] ?? $rec->unit ?: $ingredient->unit);
                    $purchaseUnit = (string) ($snapIng['purchase_unit'] ?? $rec->purchase_unit ?: ($ingredient->purchase_unit ?: $unit));
                    $unitPrice = (float) ($snapIng['cost_price'] ?? $ingredient->cost_price ?? 0.0);
                    $totalPrice = round($finalQty * $unitPrice, 2);

                    $packSize = null;
                    if (is_array($rec->explanation) && isset($rec->explanation['pack_size'])) {
                        $packSize = (float) $rec->explanation['pack_size'];
                    } elseif (is_array($recSnapshot) && isset($recSnapshot['policies'][$rec->ingredient_id]['pack_size'])) {
                        $packSize = (float) $recSnapshot['policies'][$rec->ingredient_id]['pack_size'];
                    } elseif ($snapIng !== null && isset($snapIng['unit_conversion'])) {
                        $packSize = (float) $snapIng['unit_conversion'];
                    } else {
                        $packSize = (float) ($ingredient->unit_conversion ?? 0.0);
                    }
                    if (! is_finite($packSize) || $packSize <= 0.0) {
                        abort(422, 'Thiếu pack_size hợp lệ cho đề xuất.');
                    }
                    $conv = $snapIng !== null && isset($snapIng['unit_conversion'])
                        ? (float) $snapIng['unit_conversion']
                        : (float) ($ingredient->unit_conversion ?? 1.0);
                    if (strtolower(trim($unit)) === strtolower(trim($purchaseUnit))) {
                        abort_unless(abs($conv - 1.0) <= 1e-9 && $packSize > 0, 422, 'Cấu hình đơn vị không nhất quán.');
                    } elseif (abs($packSize - $conv) > 1e-6 * max(1.0, $conv)) {
                        abort(422, 'pack_size xung đột unit_conversion.');
                    }
                    $purchaseQty = round($finalQty / $packSize, 4);

                    $planItem = ProcurementPlanItem::create([
                        'procurement_plan_id' => $plan->id,
                        'inventory_recommendation_id' => $rec->id,
                        'ingredient_id' => $ingredient->id,
                        'supplier_id' => $supplierId,
                        'suggested_quantity' => $suggestedQty,
                        'final_quantity' => $finalQty,
                        'purchase_quantity' => $purchaseQty,
                        'unit' => $unit,
                        'purchase_unit' => $purchaseUnit,
                        'pack_size' => $packSize,
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
