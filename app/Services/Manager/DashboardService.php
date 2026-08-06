<?php

namespace App\Services\Manager;

use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use Carbon\Carbon;

final class DashboardService
{
    public function getDateBounds(string $range): array
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

    public function kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd): array
    {
        $revenue = Invoice::whereBetween('issued_at', [$start, $end])->sum('total_amount');
        $prevRevenue = Invoice::whereBetween('issued_at', [$prevStart, $prevEnd])->sum('total_amount');

        $diffPercentage = 0;
        if ($prevRevenue > 0) {
            $diffPercentage = round((($revenue - $prevRevenue) / $prevRevenue) * 100, 1);
        }

        $ordersCount = Order::whereBetween('created_at', [$start, $end])->count();
        $pendingOrdersCount = Order::whereBetween('created_at', [$start, $end])
            ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->count();

        $totalTables = Table::count();
        $occupiedTables = Table::where('status', 'occupied')->count();

        $lowStockCount = Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')->count();

        return [
            'revenue' => [
                'value' => (float) $revenue,
                'comparison_percentage' => $diffPercentage,
                'trend' => $diffPercentage >= 0 ? 'up' : 'down',
            ],
            'orders' => [
                'value' => $ordersCount,
                'pending_count' => $pendingOrdersCount,
            ],
            'tables' => [
                'occupied' => $occupiedTables,
                'total' => $totalTables,
            ],
            'inventory_warnings_count' => $lowStockCount,
        ];
    }

    public function liveOperations(string $range): ?array
    {
        if ($range !== 'today') {
            return null;
        }

        $kdsPending = OrderItem::whereDate('created_at', Carbon::today())
            ->whereIn('status', ['pending', 'processing'])->count();
        $kdsCompleted = OrderItem::whereDate('created_at', Carbon::today())
            ->whereIn('status', ['completed'])->count();

        $recentKdsItems = OrderItem::with('menuItem')
            ->whereDate('created_at', Carbon::today())
            ->latest()
            ->limit(3)
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->menuItem?->name ?? 'Món ăn',
                'quantity' => $item->quantity,
                'time_ago' => $item->created_at->diffForHumans(null, true).' trước',
            ]);

        $servingQueueCount = OrderItem::where('status', 'completed')
            ->whereNull('served_at')
            ->whereHas('order', fn ($q) => $q->whereDate('created_at', Carbon::today()))
            ->count();

        $tablesMap = Table::select('id', 'table_number as name', 'status', 'reservation_name')->get();

        return [
            'kds' => [
                'pending_count' => $kdsPending,
                'completed_count' => $kdsCompleted,
                'recent_items' => $recentKdsItems,
            ],
            'serving' => [
                'queue_count' => $servingQueueCount,
            ],
            'tables_map' => $tablesMap,
        ];
    }

    public function chartData(string $range, Carbon $start, Carbon $end): array
    {
        $invoices = Invoice::whereBetween('issued_at', [$start, $end])->get();

        if ($range === 'today' || $range === 'yesterday') {
            $data = $invoices->groupBy(fn ($invoice) => Carbon::parse($invoice->issued_at)->hour)
                ->map(fn ($group) => $group->sum('total_amount'))
                ->toArray();

            $chart = [];
            for ($h = 0; $h <= 23; $h++) {
                $chart[] = [
                    'label' => sprintf('%02d:00', $h),
                    'revenue' => (float) ($data[$h] ?? 0),
                ];
            }

            return $chart;
        }

        $data = $invoices->groupBy(fn ($invoice) => Carbon::parse($invoice->issued_at)->toDateString())
            ->map(fn ($group) => $group->sum('total_amount'))
            ->toArray();

        $chart = [];
        $curr = $start->copy();
        while ($curr->lte($end)) {
            $chart[] = [
                'label' => $curr->format('d/m'),
                'revenue' => (float) ($data[$curr->toDateString()] ?? 0),
            ];
            $curr->addDay();
        }

        return $chart;
    }

    public function topProducts(Carbon $start, Carbon $end): array
    {
        return InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', [$start, $end])
            ->selectRaw('invoice_lines.name_snapshot as name, SUM(invoice_lines.quantity) as sales_count')
            ->groupBy('invoice_lines.name_snapshot')
            ->orderByDesc('sales_count')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'name' => $r->name,
                'sales_count' => $r->sales_count,
            ])
            ->all();
    }

    public function lowStock(): array
    {
        return Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')
            ->select('code', 'name', 'stock_quantity', 'unit', 'min_stock_alert')
            ->get()
            ->all();
    }
}
