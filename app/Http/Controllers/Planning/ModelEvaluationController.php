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
        $datasetId = $request->query('synthetic_dataset_id') !== null
            ? (int) $request->query('synthetic_dataset_id')
            : null;

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

        return Inertia::render('planning/ModelEvaluation', [
            'activeRun' => $activeRun,
            'evaluations' => $evaluations,
            'candidates' => config('forecasting.models.candidates', []),
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
            ],
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
