<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\RunForecastRequest;
use App\Jobs\Planning\RunDemandForecast;
use App\Models\ForecastRun;
use App\Models\InventoryRecommendation;
use App\Models\ProductForecast;
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

        $activeForecastRun = ForecastRun::where('kind', 'forecast')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $activeEvalRun = ForecastRun::where('kind', 'evaluate')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $recentRuns = ForecastRun::latest('id')
            ->take(10)
            ->get();

        $summary = [
            'active_forecast_run' => $activeForecastRun,
            'active_eval_run' => $activeEvalRun,
            'total_forecasts_count' => $activeForecastRun ? ProductForecast::where('forecast_run_id', $activeForecastRun->id)->count() : 0,
            'total_recommendations_count' => $activeForecastRun ? InventoryRecommendation::where('forecast_run_id', $activeForecastRun->id)->count() : 0,
        ];

        return Inertia::render('planning/Overview', [
            'activeRun' => $activeForecastRun,
            'activeEvalRun' => $activeEvalRun,
            'recentRuns' => $recentRuns,
            'summary' => $summary,
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
            ],
        ]);
    }

    public function storeRun(RunForecastRequest $request): SymfonyResponse
    {
        $validated = $request->validated();
        $horizon = (int) ($validated['horizon_days'] ?? config('forecasting.horizons.default', 7));
        $datasetId = isset($validated['synthetic_dataset_id']) ? (int) $validated['synthetic_dataset_id'] : null;

        $run = ForecastRun::create([
            'kind' => 'forecast',
            'synthetic_dataset_id' => $datasetId,
            'horizon_days' => $horizon,
            'data_cutoff' => now()->startOfDay(),
            'status' => 'queued',
            'configuration' => [
                'horizon_days' => $horizon,
            ],
            'is_active' => false,
        ]);

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
