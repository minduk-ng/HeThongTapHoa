<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Jobs\Planning\RunForecastExperiment;
use App\Models\ForecastExperiment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class ForecastExperimentController extends Controller
{
    public function store(Request $request): SymfonyResponse
    {
        abort_unless(config('forecasting.synthetic_enabled', false), 403, 'Batch experiments require synthetic datasets enabled.');

        $validated = $request->validate([
            'presets' => ['required', 'array', 'min:1', 'max:6'],
            'presets.*' => ['string', 'in:stable,weekly_seasonal,trend_seasonal,intermittent,level_shift,data_stress'],
            'seeds' => ['required', 'array', 'min:1', 'max:10'],
            'seeds.*' => ['integer', 'distinct', 'min:1', 'max:2147483646'],
            'horizons' => ['required', 'array', 'min:1', 'max:2'],
            'horizons.*' => ['integer', 'distinct', 'in:7,30'],
            'days' => ['nullable', 'integer', 'min:14', 'max:730'],
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'menu_item_ids' => ['nullable', 'array', 'max:50'],
            'menu_item_ids.*' => ['integer', 'distinct', 'exists:menu_items,id'],
        ]);

        $presets = $validated['presets'];
        $seeds = $validated['seeds'];
        $horizons = $validated['horizons'];
        $totalCells = count($presets) * count($seeds) * count($horizons);

        $config = [
            'presets' => $presets,
            'seeds' => $seeds,
            'horizons' => $horizons,
            'days' => (int) ($validated['days'] ?? 365),
            'start_date' => (string) ($validated['start_date'] ?? '2026-01-01'),
            'menu_item_ids' => $validated['menu_item_ids'] ?? null,
            'summary' => [
                'total' => $totalCells,
                'completed' => 0,
                'failed' => 0,
            ],
            'cells' => [],
        ];

        $experiment = ForecastExperiment::create([
            'configuration' => $config,
            'status' => 'queued',
            'created_by' => $request->user()?->id,
        ]);

        RunForecastExperiment::dispatch($experiment)->afterCommit();

        return response()->json([
            'message' => 'Đã tạo và xếp hàng batch thực nghiệm.',
            'data' => $experiment,
        ], 201);
    }

    public function show(ForecastExperiment $experiment): JsonResponse
    {
        return response()->json([
            'data' => $experiment->load('runs'),
        ]);
    }
}
