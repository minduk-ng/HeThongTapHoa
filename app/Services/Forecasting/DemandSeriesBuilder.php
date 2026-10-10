<?php

namespace App\Services\Forecasting;

use App\Models\DailyProductDemand;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class DemandSeriesBuilder
{
    /**
     * Aggregate invoices into daily_product_demands with strict source isolation.
     * Preserves refunded quantity as metadata without subtracting from demand.
     */
    public function aggregate(?int $syntheticDatasetId = null, ?CarbonInterface $fromDate = null, ?CarbonInterface $toDate = null): int
    {
        $query = DB::table('invoice_lines')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereNotNull('invoice_lines.menu_item_id');

        // ponytail: strict source predicate isolation
        if ($syntheticDatasetId === null) {
            $query->whereNull('invoices.synthetic_dataset_id');
        } else {
            $query->where('invoices.synthetic_dataset_id', $syntheticDatasetId);
        }

        if ($fromDate !== null) {
            $query->whereDate('invoices.issued_at', '>=', $fromDate->toDateString());
        }

        if ($toDate !== null) {
            $query->whereDate('invoices.issued_at', '<=', $toDate->toDateString());
        }

        $rows = $query->select([
            DB::raw('DATE(invoices.issued_at) as demand_date'),
            'invoice_lines.menu_item_id',
            DB::raw('SUM(invoice_lines.quantity) as quantity'),
            DB::raw('SUM(COALESCE(invoice_lines.refunded_qty, 0)) as refunded_quantity'),
            DB::raw('COUNT(DISTINCT invoices.id) as order_count'),
        ])
            ->groupBy(DB::raw('DATE(invoices.issued_at)'), 'invoice_lines.menu_item_id')
            ->get();

        $processed = 0;
        foreach ($rows as $row) {
            $date = is_string($row->demand_date) ? $row->demand_date : Carbon::parse($row->demand_date)->toDateString();

            DailyProductDemand::updateOrCreate(
                [
                    'synthetic_dataset_id' => $syntheticDatasetId,
                    'menu_item_id' => (int) $row->menu_item_id,
                    'demand_date' => $date,
                ],
                [
                    'quantity' => (float) $row->quantity,
                    'refunded_quantity' => (float) $row->refunded_quantity,
                    'order_count' => (int) $row->order_count,
                ]
            );

            $processed++;
        }

        return $processed;
    }

    /**
     * Alias for aggregate().
     */
    public function build(?int $syntheticDatasetId = null, ?CarbonInterface $fromDate = null, ?CarbonInterface $toDate = null): int
    {
        return $this->aggregate($syntheticDatasetId, $fromDate, $toDate);
    }

    /**
     * Extract contiguous daily demand series for a menu item up to data cutoff.
     * Missing days are imputed as 0.0.
     *
     * @return list<float>
     */
    public function getSeries(
        int $menuItemId,
        ?int $syntheticDatasetId = null,
        ?CarbonInterface $dataCutoff = null,
        int $days = 120
    ): array {
        $cutoff = $dataCutoff ? $dataCutoff->copy()->startOfDay() : now()->startOfDay();
        $windowStart = $cutoff->copy()->subDays(max(1, $days) - 1);

        $query = DailyProductDemand::where('menu_item_id', $menuItemId)
            ->whereDate('demand_date', '<=', $cutoff->toDateString());

        if ($syntheticDatasetId === null) {
            $query->whereNull('synthetic_dataset_id');
        } else {
            $query->where('synthetic_dataset_id', $syntheticDatasetId);
        }

        $minDateStr = (string) $query->min('demand_date');
        if ($minDateStr === '') {
            return [];
        }

        $startDate = Carbon::parse($minDateStr);
        if ($startDate->lt($windowStart)) {
            $startDate = $windowStart;
        }

        $records = $query->whereDate('demand_date', '>=', $startDate->toDateString())
            ->get()
            ->keyBy(function ($record) {
                return is_string($record->demand_date)
                    ? substr($record->demand_date, 0, 10)
                    : $record->demand_date->toDateString();
            });

        $series = [];
        $cursor = $startDate->copy();
        while ($cursor->lte($cutoff)) {
            $dateStr = $cursor->toDateString();
            $val = isset($records[$dateStr]) ? (float) $records[$dateStr]->quantity : 0.0;
            $series[] = $val;
            $cursor = $cursor->addDay();
        }

        return $series;
    }

    /**
     * Alias for getSeries().
     *
     * @return list<float>
     */
    public function buildSeries(
        int $menuItemId,
        ?int $syntheticDatasetId = null,
        ?CarbonInterface $dataCutoff = null,
        int $days = 120
    ): array {
        return $this->getSeries($menuItemId, $syntheticDatasetId, $dataCutoff, $days);
    }
}
