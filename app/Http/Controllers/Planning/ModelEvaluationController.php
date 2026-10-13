<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Jobs\Planning\EvaluateForecastModels;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\SecurityAuditLog;
use App\Services\Forecasting\ForecastModelRunner;
use App\Services\Forecasting\ForecastRunFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class ModelEvaluationController extends Controller
{
    public function index(Request $request): Response
    {
        $datasetId = $request->query('synthetic_dataset_id') !== null && $request->query('synthetic_dataset_id') !== ''
            ? (int) $request->query('synthetic_dataset_id')
            : null;

        $candidateKeys = ForecastModelRunner::CANDIDATES;

        $approvedMetrics = ['mae', 'rmse', 'wape'];

        $horizonFilter = $request->query('horizon_days') !== null && $request->query('horizon_days') !== ''
            ? (int) $request->query('horizon_days')
            : ($request->query('horizon') !== null && $request->query('horizon') !== '' ? (int) $request->query('horizon') : null);

        $activeRun = ForecastRun::where('kind', 'evaluate')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->when($horizonFilter !== null, fn ($q) => $q->where('horizon_days', $horizonFilter))
            ->latest('id')
            ->first();
        if (! $activeRun && $horizonFilter !== null) {
            $activeRun = ForecastRun::where('kind', 'evaluate')
                ->where('is_active', true)
                ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
                ->latest('id')
                ->first();
        }

        $evaluations = $activeRun
            ? ForecastModelEvaluation::with('menuItem')
                ->where('forecast_run_id', $activeRun->id)
                ->get()
            : [];

        // Build comparison table for 7 candidate models
        $candidateNames = [
            'naive' => 'Naive (Lặp điểm cuối)',
            'seasonal_naive_7' => 'Seasonal Naive (Tuần trước)',
            'sma_7' => 'SMA (7 ngày)',
            'sma_14' => 'SMA (14 ngày)',
            'sma_28' => 'SMA (28 ngày)',
            'holt_winters_additive' => 'Holt-Winters (Cộng)',
            'holt_winters_multiplicative' => 'Holt-Winters (Nhân)',
        ];

        $evaluationsCollection = collect($evaluations);

        $modelComparison = collect($candidateKeys)->map(function ($key) use ($evaluationsCollection, $candidateNames) {
            $filtered = $evaluationsCollection->where('model_key', $key);
            $evaluated = $filtered->filter(fn ($e) => $e->mae !== null);
            $count = $evaluated->count();
            $withWape = $evaluated->filter(fn ($e) => $e->wape !== null);

            $avgMae = $count > 0 ? (float) $evaluated->avg('mae') : null;
            $avgRmse = $count > 0 ? (float) $evaluated->avg('rmse') : null;
            $avgWape = $withWape->count() > 0 ? (float) $withWape->avg('wape') : null;
            $selectedCount = $filtered->where('is_selected', true)->count();
            $originsCount = $count > 0 ? (int) ($filtered->max('origins_evaluated') ?? 0) : 0;

            $parameters = match ($key) {
                'naive' => [],
                'seasonal_naive_7' => ['period' => 7],
                'sma_7' => ['window' => 7],
                'sma_14' => ['window' => 14],
                'sma_28' => ['window' => 28],
                'holt_winters_additive' => ['season_length' => 7, 'trend' => 'add', 'seasonal' => 'add'],
                'holt_winters_multiplicative' => ['season_length' => 7, 'trend' => 'add', 'seasonal' => 'mul'],
                default => [],
            };

            return [
                'model_key' => $key,
                'name' => $candidateNames[$key] ?? $key,
                'avg_mae' => $avgMae !== null ? round($avgMae, 4) : null,
                'avg_rmse' => $avgRmse !== null ? round($avgRmse, 4) : null,
                'avg_wape' => $avgWape !== null ? round($avgWape, 4) : null,
                'selected_count' => $selectedCount,
                'origins_count' => $originsCount,
                'is_selected' => $selectedCount > 0,
                'parameters' => $parameters,
            ];
        })->values()->all();

        // Build holdout comparison table for candidate models (independent final test, never used for selection)
        $holdoutComparison = collect($candidateKeys)->map(function ($key) use ($evaluationsCollection, $candidateNames) {
            $filtered = $evaluationsCollection->where('model_key', $key);
            $evaluatedHoldout = $filtered->filter(function ($e) {
                $h = $e->holdout_metrics;

                return is_array($h) && ($h['scored_count'] ?? 0) > 0 && isset($h['mae']);
            });
            $count = $evaluatedHoldout->count();
            $avgMae = $count > 0 ? (float) $evaluatedHoldout->avg(fn ($e) => $e->holdout_metrics['mae']) : null;
            $avgRmse = $count > 0 ? (float) $evaluatedHoldout->avg(fn ($e) => $e->holdout_metrics['rmse']) : null;
            $withWape = $evaluatedHoldout->filter(fn ($e) => ($e->holdout_metrics['wape'] ?? null) !== null);
            $avgWape = $withWape->count() > 0 ? (float) $withWape->avg(fn ($e) => $e->holdout_metrics['wape']) : null;

            $parameters = match ($key) {
                'naive' => [],
                'seasonal_naive_7' => ['period' => 7],
                'sma_7' => ['window' => 7],
                'sma_14' => ['window' => 14],
                'sma_28' => ['window' => 28],
                'holt_winters_additive' => ['season_length' => 7, 'trend' => 'add', 'seasonal' => 'add'],
                'holt_winters_multiplicative' => ['season_length' => 7, 'trend' => 'add', 'seasonal' => 'mul'],
                default => [],
            };

            return [
                'model_key' => $key,
                'name' => $candidateNames[$key] ?? $key,
                'avg_mae' => $avgMae !== null ? round($avgMae, 4) : null,
                'avg_rmse' => $avgRmse !== null ? round($avgRmse, 4) : null,
                'avg_wape' => $avgWape !== null ? round($avgWape, 4) : null,
                'selected_count' => 0,
                'origins_count' => $count > 0 ? 1 : 0,
                'is_selected' => false,
                'parameters' => $parameters,
            ];
        })->values()->all();

        // History: Recent evaluation runs
        $recentRuns = ForecastRun::where('kind', 'evaluate')
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->take(10)
            ->get();

        $user = $request->user();
        $canApplyModel = $user !== null && ($user->isAdmin() || $user->hasPermission('planning.apply_model'));

        return Inertia::render('planning/ModelEvaluation', [
            'activeRun' => $activeRun,
            'evaluations' => $evaluations,
            'candidates' => $candidateKeys,
            'candidate_keys' => $candidateKeys,
            'metrics' => $approvedMetrics,
            'modelComparison' => $modelComparison,
            'holdoutComparison' => $holdoutComparison,
            'selectedHorizon' => $activeRun->horizon_days ?? $horizonFilter ?? 7,
            'recentRuns' => $recentRuns,
            'methodology' => [
                'initial_training_window' => (int) config('forecasting.evaluation.initial_training_window', 56),
                'horizon' => (int) ($activeRun->horizon_days ?? config('forecasting.evaluation.horizon', 7)),
                'origin_step' => (int) config('forecasting.evaluation.origin_step', 7),
                'origins_count' => (int) config('forecasting.evaluation.origins_default', 8),
                'origins_min' => (int) config('forecasting.evaluation.origins_min', 3),
                'primary_metric' => (string) config('forecasting.evaluation.primary_metric', 'wape'),
                'tie_break_wape_threshold' => 0.0,
                'snapshot_id' => $activeRun ? "eval-snap-{$activeRun->id}" : 'eval-snap-default',
                'config_id' => 'eval-cfg-v1',
                'data_cutoff' => $activeRun?->data_cutoff?->toISOString(),
                'formulas' => [
                    'mae' => 'MAE = (1 / n) * \sum |y_t - \hat{y}_t|',
                    'rmse' => 'RMSE = \sqrt{(1 / n) * \sum (y_t - \hat{y}_t)^2}',
                    'wape' => 'WAPE = (\sum |y_t - \hat{y}_t| / \sum y_t) * 100%',
                ],
                'limitations' => [
                    'Yêu cầu tối thiểu 14 ngày dữ liệu cho SMA và 56 ngày cho Holt-Winters để đảm bảo độ tin cậy.',
                    'Sản phẩm mới bán hoặc có chuỗi bán gián đoạn tự động chuyển về mô hình mặc định SMA (7 ngày).',
                    'Biến động đột ngột từ các đợt khuyến mãi hoặc lễ tết chưa phản ánh đầy đủ trong mô hình chuỗi thời gian đơn thuần.',
                ],
            ],
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
            ],
            'can_apply_model' => $canApplyModel,
        ]);
    }

    public function storeRun(Request $request, ForecastRunFactory $factory): SymfonyResponse
    {
        $validated = $request->validate([
            'horizon_days' => ['nullable', 'integer', 'in:7,30'],
            'synthetic_dataset_id' => ['nullable', 'integer', 'exists:synthetic_datasets,id'],
            'cutoff' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $horizon = (int) ($validated['horizon_days'] ?? config('forecasting.evaluation.horizon', 7));
        $datasetId = isset($validated['synthetic_dataset_id']) ? (int) $validated['synthetic_dataset_id'] : null;
        $cutoff = isset($validated['cutoff']) ? (string) $validated['cutoff'] : null;

        $run = $factory->create('evaluate', $datasetId, $horizon, $cutoff);

        EvaluateForecastModels::dispatch($run)->afterCommit();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => "Đã tạo và xếp hàng lượt đánh giá mô hình #{$run->id}.",
                'data' => $run,
            ], 201);
        }

        return redirect()->back()->with('success', "Đã tạo và xếp hàng lượt đánh giá mô hình #{$run->id}.");
    }

    public function applyModel(Request $request): SymfonyResponse
    {
        $candidates = (array) config('forecasting.models.candidates', ForecastModelRunner::CANDIDATES);

        $validated = $request->validate([
            'model_key' => ['required', 'string', Rule::in($candidates)],
            'menu_item_id' => ['nullable', 'integer', 'exists:menu_items,id'],
            'forecast_run_id' => ['nullable', 'integer', 'exists:forecast_runs,id'],
        ]);

        $modelKey = (string) $validated['model_key'];
        $menuItemId = isset($validated['menu_item_id']) ? (int) $validated['menu_item_id'] : null;
        $runId = isset($validated['forecast_run_id']) ? (int) $validated['forecast_run_id'] : null;

        if ($runId === null) {
            $activeRunId = ForecastRun::where('kind', 'evaluate')
                ->where('is_active', true)
                ->latest('id')
                ->value('id');
            $runId = $activeRunId !== null ? (int) $activeRunId : null;
        }

        DB::transaction(function () use ($request, $modelKey, $menuItemId, $runId) {
            $baseQuery = ForecastModelEvaluation::query();

            if ($runId !== null) {
                $baseQuery->where('forecast_run_id', $runId);
            }
            if ($menuItemId !== null) {
                $baseQuery->where('menu_item_id', $menuItemId);
            }

            $previousSelected = (clone $baseQuery)->where('is_selected', true)->first();

            (clone $baseQuery)->update(['is_selected' => false]);

            (clone $baseQuery)->where('model_key', $modelKey)->update([
                'is_selected' => true,
                'selection_notes' => 'Manually selected by user',
            ]);

            $newSelected = (clone $baseQuery)->where('model_key', $modelKey)->first();

            SecurityAuditLog::record(
                actor: $request->user(),
                action: 'planning.apply_model',
                target: $newSelected ?? ForecastModelEvaluation::class,
                before: [
                    'model_key' => $previousSelected?->model_key,
                    'menu_item_id' => $menuItemId,
                    'forecast_run_id' => $runId,
                    'selection_notes' => $previousSelected?->selection_notes,
                ],
                after: [
                    'model_key' => $modelKey,
                    'menu_item_id' => $menuItemId,
                    'forecast_run_id' => $runId,
                    'selection_notes' => 'Manually selected by user',
                ],
                ip: $request->ip(),
                userAgent: $request->userAgent(),
            );
        });

        if ($request->wantsJson()) {
            return response()->json([
                'message' => "Đã áp dụng mô hình {$modelKey} thành công.",
            ]);
        }

        return redirect()->back()->with('success', "Đã áp dụng mô hình {$modelKey} thành công.");
    }
}
