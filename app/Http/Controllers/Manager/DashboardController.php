<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use App\Models\Ingredient;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $range = $request->input('date_range', 'today');
        
        // 1. Calculate Date Bounds
        [$startDate, $endDate, $prevStartDate, $prevEndDate] = $this->getDateBounds($range);

        // 2. Fetch KPIs
        $revenue = Invoice::whereBetween('issued_at', [$startDate, $endDate])->sum('total_amount');
        $prevRevenue = Invoice::whereBetween('issued_at', [$prevStartDate, $prevEndDate])->sum('total_amount');
        
        $diffPercentage = 0;
        if ($prevRevenue > 0) {
            $diffPercentage = round((($revenue - $prevRevenue) / $prevRevenue) * 100, 1);
        }

        $ordersCount = Order::whereBetween('created_at', [$startDate, $endDate])->count();
        $pendingOrdersCount = Order::whereBetween('created_at', [$startDate, $endDate])
            ->whereIn('status', ['pending', 'cooking', 'ready'])->count();

        $totalTables = Table::count();
        $occupiedTables = Table::where('status', 'occupied')->count();

        $lowStockCount = Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')->count();

        // 3. Fetch Live Operations (Only for "today")
        $liveOperations = null;
        if ($range === 'today') {
            $kdsPending = OrderItem::whereDate('created_at', Carbon::today())
                ->whereIn('status', ['pending', 'cooking'])->count();
            $kdsCompleted = OrderItem::whereDate('created_at', Carbon::today())
                ->whereIn('status', ['ready', 'served'])->count();
            
            $recentKdsItems = OrderItem::with('menuItem')
                ->whereDate('created_at', Carbon::today())
                ->latest()
                ->limit(3)
                ->get()
                ->map(fn($item) => [
                    'id' => $item->id,
                    'name' => $item->menuItem?->name ?? 'Món ăn',
                    'quantity' => $item->quantity,
                    'time_ago' => $item->created_at->diffForHumans(null, true) . ' trước'
                ]);

            $servingQueueCount = OrderItem::where('status', 'completed')
                ->whereNull('served_at')
                ->whereHas('order', fn ($q) => $q->whereDate('created_at', Carbon::today()))
                ->count();

            $tablesMap = Table::select('id', 'table_number as name', 'status', 'reservation_name')->get();

            $liveOperations = [
                'kds' => [
                    'pending_count' => $kdsPending,
                    'completed_count' => $kdsCompleted,
                    'recent_items' => $recentKdsItems
                ],
                'serving' => [
                    'queue_count' => $servingQueueCount
                ],
                'tables_map' => $tablesMap
            ];
        }

        // 4. Fetch Analytics (Chart & Top Products)
        $chartData = $this->getChartData($range, $startDate, $endDate);
        
        $topProducts = OrderItem::join('menu_items', 'order_items.menu_item_id', '=', 'menu_items.id')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereBetween('orders.created_at', [$startDate, $endDate])
            ->where('order_items.status', '!=', 'cancelled')
            ->select('menu_items.name', DB::raw('SUM(order_items.quantity) as sales_count'))
            ->groupBy('menu_items.id', 'menu_items.name')
            ->orderByDesc('sales_count')
            ->limit(5)
            ->get();

        // 5. Low stock details
        $lowStockWarnings = Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')
            ->select('code', 'name', 'stock_quantity', 'unit', 'min_stock_alert')
            ->get();

        return Inertia::render('manager/dashboard/DashboardManager', [
            'filters' => [
                'date_range' => $range,
                'available_ranges' => ['today', 'yesterday', 'last_7_days', 'this_month']
            ],
            'kpis' => [
                'revenue' => [
                    'value' => (float)$revenue,
                    'comparison_percentage' => $diffPercentage,
                    'trend' => $diffPercentage >= 0 ? 'up' : 'down'
                ],
                'orders' => [
                    'value' => $ordersCount,
                    'pending_count' => $pendingOrdersCount
                ],
                'tables' => [
                    'occupied' => $occupiedTables,
                    'total' => $totalTables
                ],
                'inventory_warnings_count' => $lowStockCount
            ],
            'live_operations' => $liveOperations,
            'analytics' => [
                'chart_data' => $chartData,
                'top_products' => $topProducts
            ],
            'inventory_warnings' => $lowStockWarnings
        ]);
    }

    private function getDateBounds(string $range): array
    {
        $now = Carbon::now();
        switch ($range) {
            case 'yesterday':
                $start = Carbon::yesterday()->startOfDay();
                $end = Carbon::yesterday()->endOfDay();
                $prevStart = Carbon::yesterday()->subDay()->startOfDay();
                $prevEnd = Carbon::yesterday()->subDay()->endOfDay();
                break;
            case 'last_7_days':
                $start = Carbon::now()->subDays(6)->startOfDay();
                $end = Carbon::now()->endOfDay();
                $prevStart = Carbon::now()->subDays(13)->startOfDay();
                $prevEnd = Carbon::now()->subDays(7)->endOfDay();
                break;
            case 'this_month':
                $start = Carbon::now()->startOfMonth();
                $end = Carbon::now()->endOfMonth();
                $prevStart = Carbon::now()->subMonth()->startOfMonth();
                $prevEnd = Carbon::now()->subMonth()->endOfMonth();
                break;
            case 'today':
            default:
                $start = Carbon::today()->startOfDay();
                $end = Carbon::today()->endOfDay();
                $prevStart = Carbon::yesterday()->startOfDay();
                $prevEnd = Carbon::yesterday()->endOfDay();
                break;
        }
        return [$start, $end, $prevStart, $prevEnd];
    }

    private function getChartData(string $range, Carbon $start, Carbon $end): array
    {
        if ($range === 'today' || $range === 'yesterday') {
            // Group by hour database-agnostic using Carbon/Collection
            $invoices = Invoice::whereBetween('issued_at', [$start, $end])->get();
            $data = $invoices->groupBy(function($invoice) {
                return Carbon::parse($invoice->issued_at)->hour;
            })->map(function($group) {
                return $group->sum('total_amount');
            })->toArray();

            $chart = [];
            for ($h = 6; $h <= 22; $h++) {
                $label = sprintf('%02d:00', $h);
                $chart[] = [
                    'label' => $label,
                    'revenue' => (float)($data[$h] ?? 0)
                ];
            }
            return $chart;
        } else {
            // Group by date database-agnostic using Carbon/Collection
            $invoices = Invoice::whereBetween('issued_at', [$start, $end])->get();
            $data = $invoices->groupBy(function($invoice) {
                return Carbon::parse($invoice->issued_at)->toDateString();
            })->map(function($group) {
                return $group->sum('total_amount');
            })->toArray();

            $chart = [];
            $curr = $start->copy();
            while ($curr->lte($end)) {
                $key = $curr->toDateString();
                $chart[] = [
                    'label' => $curr->format('d/m'),
                    'revenue' => (float)($data[$key] ?? 0)
                ];
                $curr->addDay();
            }
            return $chart;
        }
    }
}
