<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Models\ForecastRun;
use App\Models\ProductForecast;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProductForecastController extends Controller
{
    public function index(Request $request): Response
    {
        $datasetId = $request->query('synthetic_dataset_id') !== null
            ? (int) $request->query('synthetic_dataset_id')
            : null;

        $activeRun = ForecastRun::where('kind', 'forecast')
            ->where('is_active', true)
            ->when($datasetId !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetId), fn ($q) => $q->whereNull('synthetic_dataset_id'))
            ->latest('id')
            ->first();

        $forecasts = $activeRun
            ? ProductForecast::with('menuItem')
                ->where('forecast_run_id', $activeRun->id)
                ->get()
            : [];

        return Inertia::render('planning/ProductForecasts', [
            'activeRun' => $activeRun,
            'forecasts' => $forecasts,
            'filters' => [
                'synthetic_dataset_id' => $datasetId,
            ],
        ]);
    }
}
