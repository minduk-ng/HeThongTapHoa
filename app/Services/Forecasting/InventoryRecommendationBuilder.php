<?php

namespace App\Services\Forecasting;

use App\Models\DailyProductDemand;
use App\Models\ForecastRun;
use App\Models\InventoryRecommendation;
use App\Models\ProductForecast;

class InventoryRecommendationBuilder
{
    public function __construct(
        private ?IngredientDemandCalculator $calculator = null,
        private ?PlanningSnapshot $snapshotter = null
    ) {
        $this->calculator = $calculator ?? app(IngredientDemandCalculator::class);
        $this->snapshotter = $snapshotter ?? app(PlanningSnapshot::class);
    }

    public function build(ForecastRun $run): void
    {
        class_exists(InventoryOptimizer::class);

        $forecasts = ProductForecast::where('forecast_run_id', $run->id)->get();
        if ($forecasts->isEmpty()) {
            return;
        }

        $config = is_array($run->configuration) ? $run->configuration : [];
        $snapshot = $config['snapshot'] ?? null;
        if (! is_array($snapshot) || empty($snapshot['ingredients'])) {
            $snapshot = $this->snapshotter->capture();
            if ($run->synthetic_dataset_id !== null) {
                $config['snapshot'] = $snapshot;
                $run->update(['configuration' => $config]);
            }
        }

        $forecastsByItem = [];
        $itemsWithNull = [];
        foreach ($forecasts as $f) {
            $mid = (int) $f->menu_item_id;
            if ($f->forecast_quantity === null || $f->status === 'unavailable') {
                $itemsWithNull[$mid] = true;
            }
            $forecastsByItem[$mid][] = $f;
        }
        $availableForecasts = $forecasts->filter(fn ($f) => $f->forecast_quantity !== null && $f->status !== 'unavailable');
        if ($availableForecasts->isEmpty()) {
            return;
        }

        $calcResult = $this->calculator->calculateSnapshot($availableForecasts, $snapshot);
        $demands = $calcResult['demands'];
        $snapshotIngredients = $snapshot['ingredients'] ?? [];
        $snapshotPolicies = $snapshot['policies'] ?? [];
        $snapshotRecipes = $snapshot['recipes'] ?? [];
        $horizon = $run->horizon_days > 0 ? $run->horizon_days : 7;

        // Map menu items that use each ingredient for historical stddev calculation
        $ingredientMenuItems = [];
        $recipeMap = [];
        foreach ($snapshotRecipes as $r) {
            $ingId = (int) $r['ingredient_id'];
            $mid = (int) $r['menu_item_id'];
            $ingredientMenuItems[$ingId][] = $mid;
            $recipeMap[$mid][$ingId] = $r;
        }

        foreach ($demands as $ingredientId => $demandData) {
            $ingData = $snapshotIngredients[$ingredientId] ?? null;
            if (! $ingData) {
                continue;
            }

            $itemIdsForNull = array_unique($ingredientMenuItems[$ingredientId] ?? []);
            foreach ($itemIdsForNull as $nullMid) {
                if (isset($itemsWithNull[$nullMid])) {
                    continue 2;
                }
            }

            $policyData = $snapshotPolicies[$ingredientId] ?? null;

            $leadDays = $policyData ? (int) $policyData['lead_days'] : 1;
            if ($leadDays > $horizon) {
                continue;
            }
            $serviceFactor = $policyData && (float) $policyData['service_factor'] > 0 ? (float) $policyData['service_factor'] : 1.65;
            $orderingCost = $policyData && (float) $policyData['ordering_cost'] > 0 ? (float) $policyData['ordering_cost'] : null;
            $annualHoldingCost = $policyData && (float) $policyData['annual_holding_cost'] > 0 ? (float) $policyData['annual_holding_cost'] : null;
            $moq = $policyData ? (float) $policyData['moq'] : 0.0;
            $orderMultiple = $policyData && (float) $policyData['order_multiple'] > 0 ? (float) $policyData['order_multiple'] : 1.0;
            $packSize = $policyData && (float) $policyData['pack_size'] > 0 ? (float) $policyData['pack_size'] : 1.0;
            $available = (float) $ingData['stock_quantity'];

            // Lead time demand: exact sum of daily demands during lead time
            $dailyDemands = $demandData['daily_demands'] ?? [];
            ksort($dailyDemands);
            $dailyValues = array_values($dailyDemands);

            if ($leadDays > $horizon) {
                $leadDemand = array_sum($dailyValues);
            } elseif ($leadDays === 0) {
                $leadDemand = (float) ($dailyValues[0] ?? 0.0);
            } else {
                $leadDemand = (float) array_sum(array_slice($dailyValues, 0, $leadDays));
            }

            $totalDemand = (float) ($demandData['demand_quantity'] ?? 0.0);
            $dailyDemandRate = $totalDemand / $horizon;
            $annualDemand = $dailyDemandRate * 365.0;

            // Historical standard deviation in ingredient base units via snapshot BOM.
            $dailyDemandStdDev = 0.0;
            $stdWarning = null;
            $itemIds = array_unique($ingredientMenuItems[$ingredientId] ?? []);
            if (! empty($itemIds)) {
                $demandsHistory = DailyProductDemand::whereIn('menu_item_id', $itemIds)
                    ->when(
                        $run->synthetic_dataset_id === null,
                        fn ($q) => $q->whereNull('synthetic_dataset_id'),
                        fn ($q) => $q->where('synthetic_dataset_id', $run->synthetic_dataset_id)
                    )
                    ->whereDate('demand_date', '<=', $run->data_cutoff ? $run->data_cutoff->toDateString() : now()->toDateString())
                    ->get();

                if ($demandsHistory->isNotEmpty()) {
                    $dailyTotals = [];
                    foreach ($demandsHistory as $demandRecord) {
                        $dateKey = is_string($demandRecord->demand_date)
                            ? substr($demandRecord->demand_date, 0, 10)
                            : $demandRecord->demand_date->toDateString();
                        $rec = $recipeMap[(int) $demandRecord->menu_item_id][$ingredientId] ?? null;
                        if (! $rec) {
                            continue;
                        }
                        $perUnit = $this->convertRecipeToBase((float) ($rec['amount'] ?? 0.0), (string) ($rec['unit'] ?? ''), $ingData);
                        if ($perUnit === null) {
                            $stdWarning = 'unconvertible_history_unit';

                            continue;
                        }
                        $dailyTotals[$dateKey] = ($dailyTotals[$dateKey] ?? 0.0) + ((float) $demandRecord->quantity * $perUnit);
                    }

                    $vals = array_values($dailyTotals);
                    $count = count($vals);
                    if ($count > 1) {
                        $mean = array_sum($vals) / $count;
                        $variance = array_sum(array_map(fn ($x) => ($x - $mean) ** 2, $vals)) / ($count - 1);
                        $dailyDemandStdDev = round(sqrt($variance), 4);
                    } else {
                        $stdWarning = $stdWarning ?? 'insufficient_history';
                    }
                } else {
                    $stdWarning = 'no_history';
                }
            }

            $input = new InventoryInput(
                available: $available,
                dailyDemandStdDev: $dailyDemandStdDev,
                leadDays: $leadDays,
                serviceFactor: $serviceFactor,
                annualDemand: $annualDemand,
                orderingCost: $orderingCost,
                annualHoldingCost: $annualHoldingCost,
                moq: $moq,
                orderMultiple: $orderMultiple,
                packSize: $packSize,
                leadDemand: $leadDemand,
                dailyDemand: $dailyDemandRate,
                reserved: 0.0,
            );

            $decision = InventoryOptimizer::recommend($input);

            $explanation = [
                'lead_demand' => round($leadDemand, 4),
                'lead_days' => $leadDays,
                'daily_demand_stddev' => $dailyDemandStdDev,
                'stddev_warning' => $stdWarning,
                'stddev_unit' => (string) $ingData['unit'],
                'safety_stock' => round($decision->safetyStock, 4),
                'reorder_point' => round($decision->reorderPoint, 4),
                'raw_quantity' => round($decision->rawQuantity, 4),
                'after_moq_quantity' => round($decision->afterMoqQuantity, 4),
                'final_quantity' => round($decision->finalQuantity, 4),
                'method' => $decision->method,
                'pack_size' => $packSize,
                'base_unit' => (string) $ingData['unit'],
                'purchase_unit' => (string) ($ingData['purchase_unit'] ?? $ingData['unit']),
                'stock_snapshot_quantity' => round($available, 4),
                'assumptions' => [
                    'reserved' => 0.0,
                    'inbound_pipeline_included' => false,
                    'perishability_penalty_included' => false,
                ],
            ];

            InventoryRecommendation::updateOrCreate(
                [
                    'forecast_run_id' => $run->id,
                    'ingredient_id' => $ingredientId,
                ],
                [
                    'supplier_id' => $policyData['supplier_id'] ?? null,
                    'demand_quantity' => round($totalDemand, 4),
                    'stock_quantity' => round($available, 4),
                    'reserved_quantity' => 0.0,
                    'safety_stock' => round($decision->safetyStock, 4),
                    'reorder_point' => round($decision->reorderPoint, 4),
                    'raw_quantity' => round($decision->rawQuantity, 4),
                    'after_moq_quantity' => round($decision->afterMoqQuantity, 4),
                    'final_quantity' => round($decision->finalQuantity, 4),
                    'suggested_quantity' => round($decision->suggestedQuantity, 4),
                    'method' => $decision->method,
                    'unit' => (string) $ingData['unit'],
                    'purchase_unit' => (string) ($ingData['purchase_unit'] ?? $ingData['unit']),
                    'bom_hash' => (string) $calcResult['bom_hash'],
                    'policy_hash' => $policyData['policy_hash'] ?? null,
                    'stock_snapshot_at' => now(),
                    'stock_snapshot_quantity' => round($available, 4),
                    'status' => 'pending',
                    'notes' => $decision->notes,
                    'explanation' => $explanation,
                ]
            );
        }
    }

    /**
     * @param  array<string, mixed>  $ingData
     */
    private function convertRecipeToBase(float $amount, string $fromUnit, array $ingData): ?float
    {
        $from = strtolower(trim($fromUnit));
        $base = strtolower(trim((string) ($ingData['unit'] ?? '')));
        $purchase = strtolower(trim((string) ($ingData['purchase_unit'] ?? $base)));
        $conv = (float) ($ingData['unit_conversion'] ?? 1.0);

        if ($from === $base) {
            return $amount;
        }
        if ($from === $purchase && $conv > 0) {
            return $amount * $conv;
        }
        $mass = ['g' => 1.0, 'gram' => 1.0, 'gr' => 1.0, 'kg' => 1000.0, 'kilogram' => 1000.0];
        $vol = ['ml' => 1.0, 'l' => 1000.0, 'liter' => 1000.0, 'litre' => 1000.0];
        if (isset($mass[$from], $mass[$base])) {
            return ($amount * $mass[$from]) / $mass[$base];
        }
        if (isset($vol[$from], $vol[$base])) {
            return ($amount * $vol[$from]) / $vol[$base];
        }

        return null;
    }
}
