<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Jobs\Planning\EvaluateForecastModels;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
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

        $candidateKeys = [
            'sma_7',
            'sma_14',
            'sma_28',
            'holt_winters_additive',
            'holt_winters_multiplicative',
        ];

        $approvedMetrics = ['mae', 'rmse', 'wape'];

        $activeRun = ForecastRun::where('kind', 'evaluate')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $evaluations = $activeRun
            ? ForecastModelEvaluation::with('menuItem')
                ->where('forecast_run_id', $activeRun->id)
                ->get()
            : [];

        // Build comparison table for 5 candidate models
        $candidateNames = [
            'sma_7' => 'SMA (7 ngày)',
            'sma_14' => 'SMA (14 ngày)',
            'sma_28' => 'SMA (28 ngày)',
            'holt_winters_additive' => 'Holt-Winters (Cộng)',
            'holt_winters_multiplicative' => 'Holt-Winters (Nhân)',
        ];

        $evaluationsCollection = collect($evaluations);

        $modelComparison = collect($candidateKeys)->map(function ($key) use ($evaluationsCollection, $candidateNames) {
            $filtered = $evaluationsCollection->where('model_key', $key);
            $count = $filtered->count();

            $avgMae = $count > 0 ? (float) $filtered->avg('mae') : 0.0;
            $avgRmse = $count > 0 ? (float) $filtered->avg('rmse') : 0.0;
            $avgWape = $count > 0 ? (float) $filtered->avg('wape') : 0.0;
            $selectedCount = $filtered->where('is_selected', true)->count();
            $originsCount = $count > 0 ? (int) ($filtered->max('origins_evaluated') ?: 8) : 8;

            $parameters = match ($key) {
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
                'avg_mae' => round($avgMae, 4),
                'avg_rmse' => round($avgRmse, 4),
                'avg_wape' => round($avgWape, 4),
                'selected_count' => $selectedCount,
                'origins_count' => $originsCount,
                'is_selected' => $selectedCount > 0,
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
            'recentRuns' => $recentRuns,
            'methodology' => [
                'initial_training_window' => (int) config('forecasting.evaluation.initial_training_window', 56),
                'horizon' => (int) config('forecasting.evaluation.horizon', 7),
                'origin_step' => (int) config('forecasting.evaluation.origin_step', 7),
                'origins_count' => (int) config('forecasting.evaluation.origins_default', 8),
                'origins_min' => (int) config('forecasting.evaluation.origins_min', 3),
                'primary_metric' => (string) config('forecasting.evaluation.primary_metric', 'wape'),
                'tie_break_wape_threshold' => (float) config('forecasting.evaluation.tie_break_wape_threshold', 0.5),
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

    public function storeRun(Request $request): SymfonyResponse
    {
        $validated = $request->validate([
            'horizon_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'synthetic_dataset_id' => ['nullable', 'integer', 'exists:synthetic_datasets,id'],
        ]);

        $horizon = (int) ($validated['horizon_days'] ?? config('forecasting.evaluation.horizon', 7));
        $datasetId = isset($validated['synthetic_dataset_id']) ? (int) $validated['synthetic_dataset_id'] : null;

        $run = ForecastRun::create([
            'kind' => 'evaluate',
            'synthetic_dataset_id' => $datasetId,
            'horizon_days' => $horizon,
            'data_cutoff' => now()->startOfDay(),
            'status' => 'queued',
            'configuration' => [
                'horizon_days' => $horizon,
            ],
            'is_active' => false,
        ]);

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
        $candidates = (array) config('forecasting.models.candidates', [
            'sma_7', 'sma_14', 'sma_28', 'holt_winters_additive', 'holt_winters_multiplicative',
        ]);

        $validated = $request->validate([
            'model_key' => ['required', 'string', Rule::in($candidates)],
            'menu_item_id' => ['nullable', 'integer', 'exists:menu_items,id'],
            'forecast_run_id' => ['nullable', 'integer', 'exists:forecast_runs,id'],
        ]);

        $modelKey = (string) $validated['model_key'];
        $menuItemId = isset($validated['menu_item_id']) ? (int) $validated['menu_item_id'] : null;
        $runId = isset($validated['forecast_run_id']) ? (int) $validated['forecast_run_id'] : null;

        DB::transaction(function () use ($modelKey, $menuItemId, $runId) {
            $baseQuery = ForecastModelEvaluation::query();

            if ($runId !== null) {
                $baseQuery->where('forecast_run_id', $runId);
            }
            if ($menuItemId !== null) {
                $baseQuery->where('menu_item_id', $menuItemId);
            }

            (clone $baseQuery)->update(['is_selected' => false]);

            (clone $baseQuery)->where('model_key', $modelKey)->update([
                'is_selected' => true,
                'selection_notes' => 'Manually selected by user',
            ]);
        });

        if ($request->wantsJson()) {
            return response()->json([
                'message' => "Đã áp dụng mô hình {$modelKey} thành công.",
            ]);
        }

        return redirect()->back()->with('success', "Đã áp dụng mô hình {$modelKey} thành công.");
    }
}
