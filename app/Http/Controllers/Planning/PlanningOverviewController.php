<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\RunForecastRequest;
use App\Jobs\Planning\RunDemandForecast;
use App\Models\DailyProductDemand;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\InventoryRecommendation;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use App\Services\Forecasting\ForecastRunFactory;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class PlanningOverviewController extends Controller
{
    public function index(Request $request): Response
    {
        $datasetId = $request->query('synthetic_dataset_id') !== null
            ? (int) $request->query('synthetic_dataset_id')
            : null;
        $categoryId = $request->query('category_id') !== null
            ? (int) $request->query('category_id')
            : null;
        $horizonDays = $request->query('horizon_days') !== null
            ? (int) $request->query('horizon_days')
            : null;

        $activeForecastRun = ForecastRun::with('syntheticDataset')
            ->where('kind', 'forecast')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $activeEvalRun = ForecastRun::with('syntheticDataset')
            ->where('kind', 'evaluate')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $recentRuns = ForecastRun::with('syntheticDataset')
            ->latest('id')
            ->take(10)
            ->get();

        $categories = MenuCategory::select('id', 'name')->orderBy('name')->get();

        $summary = [
            'active_forecast_run' => $activeForecastRun,
            'active_eval_run' => $activeEvalRun,
            'total_forecasts_count' => $activeForecastRun ? ProductForecast::where('forecast_run_id', $activeForecastRun->id)->count() : 0,
            'total_recommendations_count' => $activeForecastRun ? InventoryRecommendation::where('forecast_run_id', $activeForecastRun->id)->count() : 0,
        ];

        // 1. Default KPIs
        $growthItemsCount = 0;
        $procurementNeededCount = 0;
        $estimatedValue = 0.0;
        $averageWape = null;

        // 2. Default Chart and distributions
        $chartData = [];
        $cutoffDate = null;
        $dataQualityDistribution = [];
        $modelDistribution = [];
        $topGrowingProducts = [];
        $urgentReorders = [];

        if ($activeForecastRun) {
            $cutoff = Carbon::parse($activeForecastRun->data_cutoff);
            $cutoffDate = $cutoff->toDateString();
            $runId = $activeForecastRun->id;

            // Average WAPE from evaluations or product forecasts
            /** @var float|null $evalWape */
            $evalWape = ForecastModelEvaluation::where('forecast_run_id', $activeEvalRun ? $activeEvalRun->id : 0)
                ->where('is_selected', true)
                ->whereNotNull('wape')
                ->avg('wape');

            if ($evalWape === null && $activeEvalRun) {
                $evalWape = ForecastModelEvaluation::where('forecast_run_id', $activeEvalRun->id)
                    ->whereNotNull('wape')
                    ->avg('wape');
            }

            if ($evalWape === null) {
                $evalWape = ProductForecast::where('forecast_run_id', $runId)
                    ->take(100)
                    ->get()
                    ->pluck('metrics.wape')
                    ->filter(fn ($v) => is_numeric($v))
                    ->avg();
            }

            $averageWape = $evalWape !== null ? round((float) $evalWape, 4) : null;

            // Procurement needed & estimated value
            $procurementNeededCount = InventoryRecommendation::where('forecast_run_id', $runId)
                ->where('suggested_quantity', '>', 0)
                ->count();

            $estimatedValue = (float) (InventoryRecommendation::where('forecast_run_id', $runId)
                ->where('suggested_quantity', '>', 0)
                ->join('ingredients', 'inventory_recommendations.ingredient_id', '=', 'ingredients.id')
                ->selectRaw('SUM(inventory_recommendations.suggested_quantity * COALESCE(ingredients.cost_price, 0)) as total_val')
                ->value('total_val') ?? 0.0);

            // Forecast growth items count (distinct products with positive forecast)
            $growthItemsCount = ProductForecast::where('forecast_run_id', $runId)
                ->where('forecast_quantity', '>', 0)
                ->distinct('menu_item_id')
                ->count('menu_item_id');

            // Quality distribution
            $dataQualityDistribution = ProductForecast::where('forecast_run_id', $runId)
                ->when($categoryId !== null, fn ($q) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $categoryId)))
                ->groupBy('data_quality')
                ->selectRaw('data_quality as quality, COUNT(DISTINCT menu_item_id) as count')
                ->toBase()
                ->get()
                ->map(fn ($r) => ['quality' => (string) $r->quality, 'count' => (int) $r->count])
                ->all();

            // Model distribution
            $modelDistribution = ProductForecast::where('forecast_run_id', $runId)
                ->when($categoryId !== null, fn ($q) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $categoryId)))
                ->groupBy('model_key')
                ->selectRaw('model_key, COUNT(DISTINCT menu_item_id) as count')
                ->toBase()
                ->get()
                ->map(fn ($r) => ['model_key' => (string) $r->model_key, 'count' => (int) $r->count])
                ->all();

            // Top growing / demand products
            $topItems = ProductForecast::where('forecast_run_id', $runId)
                ->when($categoryId !== null, fn ($q) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $categoryId)))
                ->groupBy('menu_item_id')
                ->selectRaw('menu_item_id, SUM(forecast_quantity) as total_forecast, MAX(data_quality) as quality, MAX(model_key) as model_key')
                ->orderByDesc('total_forecast')
                ->take(10)
                ->toBase()
                ->get();

            $menuItemIds = $topItems->pluck('menu_item_id')->all();
            $menuItems = MenuItem::with('category')->whereIn('id', $menuItemIds)->get()->keyBy('id');

            $topGrowingProducts = $topItems->map(function ($row) use ($menuItems) {
                $menuItem = $menuItems->get((int) $row->menu_item_id);

                return [
                    'id' => (int) $row->menu_item_id,
                    'name' => (string) ($menuItem ? $menuItem->name : "Sản phẩm #{$row->menu_item_id}"),
                    'category_name' => $menuItem?->category?->name,
                    'forecast_quantity' => round((float) $row->total_forecast, 2),
                    'data_quality' => (string) $row->quality,
                    'model_key' => (string) $row->model_key,
                ];
            })->all();

            // Urgent reorders
            $urgentReorders = InventoryRecommendation::with(['ingredient', 'supplier'])
                ->where('forecast_run_id', $runId)
                ->where(function ($q) {
                    $q->whereColumn('stock_quantity', '<=', 'reorder_point')
                        ->orWhere('suggested_quantity', '>', 0);
                })
                ->orderByDesc('suggested_quantity')
                ->take(6)
                ->get()
                ->map(function ($rec) {
                    return [
                        'id' => (int) $rec->id,
                        'ingredient_id' => (int) $rec->ingredient_id,
                        'ingredient_name' => (string) ($rec->ingredient->name ?? "Nguyên liệu #{$rec->ingredient_id}"),
                        'supplier_name' => $rec->supplier?->name,
                        'stock_quantity' => round((float) $rec->stock_quantity, 2),
                        'safety_stock' => round((float) $rec->safety_stock, 2),
                        'reorder_point' => round((float) $rec->reorder_point, 2),
                        'suggested_quantity' => round((float) $rec->suggested_quantity, 2),
                        'unit' => (string) ($rec->purchase_unit ?: ($rec->unit ?: ($rec->ingredient->unit ?? ''))),
                        'status' => (string) $rec->status,
                    ];
                })
                ->all();

            // Build chart time series
            $historyDays = 14;
            $startDate = $cutoff->copy()->subDays($historyDays)->toDateString();

            /** @var array<string, float> $actualByDate */
            $actualByDate = DailyProductDemand::whereBetween('demand_date', [$startDate, $cutoffDate])
                ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
                ->when($categoryId !== null, fn ($q) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $categoryId)))
                ->groupBy('demand_date')
                ->selectRaw('demand_date, SUM(quantity) as total_qty')
                ->pluck('total_qty', 'demand_date')
                ->map(fn ($v) => (float) $v)
                ->all();

            $forecastQuery = ProductForecast::where('forecast_run_id', $runId)
                ->when($categoryId !== null, fn ($q) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $categoryId)))
                ->when($horizonDays !== null && $horizonDays > 0, function ($q) use ($cutoff, $horizonDays) {
                    $maxDate = $cutoff->copy()->addDays($horizonDays)->toDateString();
                    $q->where('forecast_date', '<=', $maxDate);
                })
                ->groupBy('forecast_date')
                ->orderBy('forecast_date')
                ->selectRaw('forecast_date, SUM(forecast_quantity) as forecast, SUM(lower_bound) as lower_b, SUM(upper_bound) as upper_b')
                ->toBase()
                ->get();

            // Assemble chart points
            $dates = [];
            $cur = Carbon::parse($startDate);
            while ($cur->lte($cutoff)) {
                $dStr = $cur->toDateString();
                $dates[$dStr] = [
                    'date' => $dStr,
                    'label' => $cur->format('d/m'),
                    'actual' => round($actualByDate[$dStr] ?? 0.0, 2),
                    'forecast' => null,
                    'lowerBound' => null,
                    'upperBound' => null,
                ];
                $cur->addDay();
            }

            foreach ($forecastQuery as $fRow) {
                $fDate = Carbon::parse($fRow->forecast_date);
                $dStr = $fDate->toDateString();
                $forecastQty = round((float) $fRow->forecast, 2);
                $lowerB = $fRow->lower_b !== null ? round((float) $fRow->lower_b, 2) : null;
                $upperB = $fRow->upper_b !== null ? round((float) $fRow->upper_b, 2) : null;

                if (isset($dates[$dStr])) {
                    $dates[$dStr]['forecast'] = $forecastQty;
                    $dates[$dStr]['lowerBound'] = $lowerB;
                    $dates[$dStr]['upperBound'] = $upperB;
                } else {
                    $dates[$dStr] = [
                        'date' => $dStr,
                        'label' => $fDate->format('d/m'),
                        'actual' => null,
                        'forecast' => $forecastQty,
                        'lowerBound' => $lowerB,
                        'upperBound' => $upperB,
                    ];
                }
            }

            $chartData = array_values($dates);
        }

        $kpis = [
            'growth_items_count' => $growthItemsCount,
            'procurement_needed_count' => $procurementNeededCount,
            'estimated_value' => round($estimatedValue, 2),
            'average_wape' => $averageWape,
        ];

        return Inertia::render('planning/Overview', [
            'activeRun' => $activeForecastRun,
            'activeEvalRun' => $activeEvalRun,
            'recentRuns' => $recentRuns,
            'summary' => $summary,
            'kpis' => $kpis,
            'chartData' => $chartData,
            'cutoffDate' => $cutoffDate,
            'categories' => $categories,
            'dataQualityDistribution' => $dataQualityDistribution,
            'modelDistribution' => $modelDistribution,
            'topGrowingProducts' => $topGrowingProducts,
            'urgentReorders' => $urgentReorders,
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
                'category_id' => $categoryId,
                'horizon_days' => $horizonDays,
            ],
        ]);
    }

    public function storeRun(RunForecastRequest $request, ForecastRunFactory $factory): SymfonyResponse
    {
        $validated = $request->validated();
        $horizon = (int) ($validated['horizon_days'] ?? config('forecasting.horizons.default', 7));
        $datasetId = isset($validated['synthetic_dataset_id']) ? (int) $validated['synthetic_dataset_id'] : null;
        $cutoff = isset($validated['cutoff']) ? (string) $validated['cutoff'] : null;

        $run = $factory->create('forecast', $datasetId, $horizon, $cutoff);

        RunDemandForecast::dispatch($run)->afterCommit();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => "Đã tạo và xếp hàng lượt dự báo #{$run->id}.",
                'data' => $run,
            ], 201);
        }

        return redirect()->back()->with('success', "Đã tạo và xếp hàng lượt dự báo #{$run->id}.");
    }
}
