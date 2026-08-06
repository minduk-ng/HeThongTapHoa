<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Services\Manager\DashboardService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __construct(
        private DashboardService $service
    ) {}

    public function index(Request $request)
    {
        $range = $request->input('date_range', 'today');
        [$startDate, $endDate, $prevStartDate, $prevEndDate] = $this->service->getDateBounds($range);

        return Inertia::render('manager/dashboard/DashboardManager', [
            'filters' => [
                'date_range' => $range,
                'available_ranges' => ['today', 'yesterday', 'last_7_days', 'this_month'],
            ],
            'kpis' => $this->service->kpis($startDate, $endDate, $prevStartDate, $prevEndDate),
            'live_operations' => $this->service->liveOperations($range),
            'analytics' => [
                'chart_data' => $this->service->chartData($range, $startDate, $endDate),
                'top_products' => $this->service->topProducts($startDate, $endDate),
            ],
            'inventory_warnings' => $this->service->lowStock(),
        ]);
    }
}
