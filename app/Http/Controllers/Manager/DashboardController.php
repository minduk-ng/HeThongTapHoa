<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Services\Manager\DashboardService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __construct(
        private DashboardService $service
    ) {}

    public function index(Request $request): Response
    {
        $topKInput = $request->input('top_k');
        if ($topKInput !== null) {
            if (! is_numeric($topKInput) || ! in_array((int) $topKInput, [5, 10, 20], true) || (string) (int) $topKInput !== (string) $topKInput) {
                abort(422, 'Giá trị top_k không hợp lệ (phải là 5, 10 hoặc 20).');
            }
            $topK = (int) $topKInput;
        } else {
            $topK = 5;
        }

        $range = $request->input('date_range', 'today');
        [$startDate, $endDate, $prevStartDate, $prevEndDate] = $this->service->getDateBounds($range);

        $topProductsResult = $this->service->topProducts($startDate, $endDate, $topK);

        return Inertia::render('manager/dashboard/DashboardManager', [
            'filters' => [
                'date_range' => $range,
                'available_ranges' => ['today', 'yesterday', 'last_7_days', 'this_month'],
                'top_k' => $topK,
            ],
            'kpis' => $this->service->kpis($startDate, $endDate, $prevStartDate, $prevEndDate),
            'live_operations' => $this->service->liveOperations($range),
            'analytics' => [
                'chart_data' => $this->service->chartData($range, $startDate, $endDate),
                'top_products' => $topProductsResult['items'],
                'top_products_meta' => $topProductsResult['metadata'],
            ],
            'inventory_warnings' => $this->service->lowStock(),
        ]);
    }
}
