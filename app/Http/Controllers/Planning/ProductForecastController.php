<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Inertia\Inertia;
use Inertia\Response;

class ProductForecastController extends Controller
{
    public function index(Request $request): Response
    {
        $datasetId = $request->query('synthetic_dataset_id') !== null && $request->query('synthetic_dataset_id') !== ''
            ? (int) $request->query('synthetic_dataset_id')
            : null;

        $search = trim((string) $request->query('search', ''));
        $categoryId = $request->query('category_id') !== null && $request->query('category_id') !== ''
            ? (int) $request->query('category_id')
            : null;
        $horizonDays = $request->query('horizon_days') !== null && $request->query('horizon_days') !== ''
            ? (int) $request->query('horizon_days')
            : ($request->query('horizon') !== null && $request->query('horizon') !== '' ? (int) $request->query('horizon') : null);
        $quality = trim((string) ($request->query('quality') ?: $request->query('data_quality', '')));
        $perPage = max(1, min(100, (int) $request->query('per_page', 15)));

        $activeRunQuery = ForecastRun::where('kind', 'forecast')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'));

        if ($horizonDays !== null) {
            $activeRunQuery->where('horizon_days', $horizonDays);
        }

        $activeRun = $activeRunQuery->latest('id')->first();

        // If no active run with specific horizon, fallback to latest active run for dataset
        if (! $activeRun && $horizonDays !== null) {
            $activeRun = ForecastRun::where('kind', 'forecast')
                ->where('is_active', true)
                ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
                ->latest('id')
                ->first();
        }

        $categories = MenuCategory::select('id', 'name')->orderBy('name')->get();

        if (! $activeRun) {
            $emptyPaginator = new LengthAwarePaginator([], 0, $perPage, 1, [
                'path' => $request->url(),
                'query' => $request->query(),
            ]);

            return Inertia::render('planning/ProductForecasts', [
                'activeRun' => null,
                'products' => $emptyPaginator,
                'forecasts' => $emptyPaginator,
                'categories' => $categories,
                'filters' => [
                    'search' => $search ?: null,
                    'category_id' => $categoryId,
                    'horizon_days' => $horizonDays ?? 7,
                    'quality' => $quality ?: null,
                    'synthetic_dataset_id' => $datasetId,
                ],
            ]);
        }

        // Query items that have forecasts in activeRun
        $itemsQuery = MenuItem::query()
            ->with('category')
            ->whereHas('forecasts', function ($q) use ($activeRun, $quality) {
                $q->where('forecast_run_id', $activeRun->id);
                if ($quality !== '') {
                    $q->where('data_quality', $quality);
                }
            });

        if ($search !== '') {
            $itemsQuery->where('name', 'like', "%{$search}%");
        }

        if ($categoryId !== null) {
            $itemsQuery->where('category_id', $categoryId);
        }

        $paginatedItems = $itemsQuery->orderBy('name')->paginate($perPage)->withQueryString();

        $itemIds = $paginatedItems->pluck('id')->all();

        $forecastsByItem = ProductForecast::where('forecast_run_id', $activeRun->id)
            ->whereIn('menu_item_id', $itemIds)
            ->orderBy('forecast_date')
            ->get()
            ->groupBy('menu_item_id');

        $evaluationsByItem = ForecastModelEvaluation::whereIn('menu_item_id', $itemIds)
            ->where('is_selected', true)
            ->latest('id')
            ->get()
            ->keyBy('menu_item_id');

        $paginatedProducts = $paginatedItems->through(function ($item) use ($forecastsByItem, $evaluationsByItem, $activeRun) {
            /** @var Collection<int, ProductForecast> $itemForecasts */
            $itemForecasts = $forecastsByItem->get($item->id, collect());
            $first = $itemForecasts->first();
            $eval = $evaluationsByItem->get($item->id);

            $totalQty = (float) $itemForecasts->sum('forecast_quantity');
            $hasLower = $itemForecasts->contains(fn ($f) => $f->lower_bound !== null);
            $hasUpper = $itemForecasts->contains(fn ($f) => $f->upper_bound !== null);

            $lowerBoundTotal = $hasLower ? (float) $itemForecasts->sum('lower_bound') : null;
            $upperBoundTotal = $hasUpper ? (float) $itemForecasts->sum('upper_bound') : null;

            $dailyForecasts = $itemForecasts->map(function ($f) {
                return [
                    'id' => $f->id,
                    'forecast_date' => $f->forecast_date instanceof Carbon
                        ? $f->forecast_date->toDateString()
                        : (string) $f->forecast_date,
                    'forecast_quantity' => (float) $f->forecast_quantity,
                    'lower_bound' => $f->lower_bound !== null ? (float) $f->lower_bound : null,
                    'upper_bound' => $f->upper_bound !== null ? (float) $f->upper_bound : null,
                ];
            })->values()->all();

            $modelKey = $first?->model_key ?? 'sma_7';
            $dataQuality = $first?->data_quality ?? 'sufficient';
            $cutoff = $first?->data_cutoff?->toISOString() ?? $activeRun->data_cutoff?->toISOString();

            return [
                'id' => $item->id,
                'menu_item_id' => $item->id,
                'name' => $item->name,
                'category_id' => $item->category_id,
                'category_name' => $item->category?->name,
                'price' => (float) $item->price,
                'image' => $item->image,
                'forecast_quantity' => round($totalQty, 2),
                'lower_bound' => $lowerBoundTotal !== null ? round($lowerBoundTotal, 2) : null,
                'upper_bound' => $upperBoundTotal !== null ? round($upperBoundTotal, 2) : null,
                'model_key' => $modelKey,
                'data_quality' => $dataQuality,
                'data_cutoff' => $cutoff,
                'mae' => $eval?->mae ?? ($first?->metrics['mae'] ?? null),
                'rmse' => $eval?->rmse ?? ($first?->metrics['rmse'] ?? null),
                'wape' => $eval?->wape ?? ($first?->metrics['wape'] ?? null),
                'origins_count' => $eval?->origins_evaluated ?? ($first?->metrics['origins_count'] ?? 8),
                'daily_forecasts' => $dailyForecasts,
            ];
        });

        return Inertia::render('planning/ProductForecasts', [
            'activeRun' => $activeRun,
            'products' => $paginatedProducts,
            'forecasts' => $paginatedProducts,
            'categories' => $categories,
            'filters' => [
                'search' => $search ?: null,
                'category_id' => $categoryId,
                'horizon_days' => $horizonDays ?? ($activeRun->horizon_days ?? 7),
                'quality' => $quality ?: null,
                'synthetic_dataset_id' => $datasetId,
            ],
        ]);
    }
}
