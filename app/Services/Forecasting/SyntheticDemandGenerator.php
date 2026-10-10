<?php

namespace App\Services\Forecasting;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\MenuItem;
use App\Models\SyntheticDataset;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class SeededPrng
{
    private int $state;

    public function __construct(int $seed)
    {
        $s = $seed % 2147483647;
        if ($s <= 0) {
            $s += 2147483646;
        }
        $this->state = $s;
    }

    /** @phpstan-impure */
    public function nextInt(int $min = 0, int $max = 2147483646): int
    {
        $this->state = (int) (($this->state * 48271) % 2147483647);
        if ($min === $max) {
            return $min;
        }
        if ($min > $max) {
            [$min, $max] = [$max, $min];
        }

        $range = ($max - $min + 1);

        return $min + ($this->state % $range);
    }

    /** @phpstan-impure */
    public function nextFloat(): float
    {
        return $this->nextInt(0, 2147483646) / 2147483647.0;
    }
}

class SyntheticDemandGenerator
{
    public const VERSION = '1.0.0';

    /**
     * @param  array<string, mixed>  $configuration
     * @return array<int, array{date: string, menu_item_id: int, quantity: int, signals: array<string, mixed>}>
     */
    public function generate(array $configuration, int $seed): array
    {
        $prng = new SeededPrng($seed);

        $days = max(1, (int) ($configuration['days'] ?? 120));
        $startDateStr = (string) ($configuration['start_date'] ?? '2026-01-01');
        $baseDate = Carbon::parse($startDateStr);

        $menuItemIds = $configuration['menu_item_ids'] ?? null;
        if (! is_array($menuItemIds) || empty($menuItemIds)) {
            try {
                $menuItemIds = MenuItem::pluck('id')->all();
            } catch (\Throwable) {
                $menuItemIds = [];
            }
            if (empty($menuItemIds)) {
                $menuItemIds = [1];
            }
        }
        $menuItemIds = array_map('intval', $menuItemIds);
        sort($menuItemIds);

        $base = (float) ($configuration['base'] ?? 20.0);
        $trend = (float) ($configuration['trend'] ?? 0.0);
        $weeklyEnabled = (bool) ($configuration['weekly'] ?? true);
        $noiseRatio = (float) ($configuration['noise'] ?? 0.0);

        $zeroDemandRate = (float) ($configuration['zero_demand_rate'] ?? 0.0);
        $outlierRate = (float) ($configuration['outlier_rate'] ?? 0.0);
        $missingRate = (float) ($configuration['missing_rate'] ?? 0.0);
        $stockoutRate = (float) ($configuration['stockout_censor_rate'] ?? 0.0);

        $promotionRate = (float) ($configuration['promotion_rate'] ?? 0.05);
        $promotionFactor = (float) ($configuration['promotion_factor'] ?? 1.5);

        // Day of week factors (1=Monday, ..., 7=Sunday)
        $weeklyFactors = [
            1 => 0.85,
            2 => 0.90,
            3 => 0.95,
            4 => 1.00,
            5 => 1.20,
            6 => 1.35,
            7 => 1.15,
        ];

        $results = [];

        for ($d = 0; $d < $days; $d++) {
            $currentDate = $baseDate->copy()->addDays($d);
            $dayOfWeek = (int) $currentDate->isoFormat('E');
            $weeklyFactor = $weeklyEnabled ? ($weeklyFactors[$dayOfWeek] ?? 1.0) : 1.0;
            $trendFactor = 1.0 + ($trend * $d);

            foreach ($menuItemIds as $menuItemId) {
                if ($missingRate > 0 && $prng->nextFloat() < $missingRate) {
                    continue;
                }

                $isPromotion = $prng->nextFloat() < $promotionRate;
                $currentPromoFactor = $isPromotion ? $promotionFactor : 1.0;

                $noise = 0.0;
                if ($noiseRatio > 0) {
                    $noise = ($prng->nextFloat() * 2.0 - 1.0) * $noiseRatio * $base;
                }

                $rawDemand = ($base * $trendFactor * $weeklyFactor * $currentPromoFactor) + $noise;

                $isZero = false;
                $isOutlier = false;
                $isStockout = false;

                if ($zeroDemandRate > 0 && $prng->nextFloat() < $zeroDemandRate) {
                    $quantity = 0;
                    $isZero = true;
                } elseif ($outlierRate > 0 && $prng->nextFloat() < $outlierRate) {
                    $quantity = (int) round($rawDemand * 2.5);
                    $isOutlier = true;
                } elseif ($stockoutRate > 0 && $prng->nextFloat() < $stockoutRate) {
                    $quantity = (int) round($rawDemand * 0.4);
                    $isStockout = true;
                } else {
                    $quantity = (int) round($rawDemand);
                }

                $quantity = max(0, $quantity);

                $signals = [
                    'day_of_week' => $dayOfWeek,
                    'trend_factor' => round($trendFactor, 6),
                    'weekly_factor' => round($weeklyFactor, 4),
                    'promotion' => $isPromotion,
                    'promotion_factor' => $currentPromoFactor,
                    'noise' => round($noise, 4),
                    'zero_demand' => $isZero,
                    'outlier' => $isOutlier,
                    'stockout' => $isStockout,
                ];

                $results[] = [
                    'date' => $currentDate->toDateString(),
                    'menu_item_id' => $menuItemId,
                    'quantity' => $quantity,
                    'signals' => $signals,
                ];
            }
        }

        return $results;
    }

    /**
     * @param  array<mixed>  $data
     */
    public function hash(array $data): string
    {
        return hash('sha256', (string) json_encode($data, JSON_THROW_ON_ERROR));
    }

    /**
     * @param  array<int, array{date: string, menu_item_id: int, quantity: int, signals: array<string, mixed>}>  $demandRecords
     */
    public function persist(SyntheticDataset $dataset, array $demandRecords): void
    {
        if (empty($demandRecords)) {
            return;
        }

        $menuItems = MenuItem::whereIn('id', array_unique(array_column($demandRecords, 'menu_item_id')))
            ->get()
            ->keyBy('id');

        $byDate = [];
        foreach ($demandRecords as $row) {
            $byDate[$row['date']][] = $row;
        }

        $invCounter = 1;
        $chunks = array_chunk($byDate, 20, true);

        foreach ($chunks as $chunkDates) {
            DB::transaction(function () use ($chunkDates, $dataset, $menuItems, &$invCounter) {
                foreach ($chunkDates as $date => $items) {
                    $dateCompact = str_replace('-', '', (string) $date);
                    $issuedAt = Carbon::parse($date)->setTime(12, 0);

                    $linesToInsert = [];
                    $subtotal = 0.0;

                    foreach ($items as $item) {
                        $qty = (int) $item['quantity'];
                        if ($qty <= 0) {
                            continue;
                        }
                        $mItem = $menuItems->get($item['menu_item_id']);
                        $price = $mItem ? (float) $mItem->price : 50000.0;
                        $lineSub = $qty * $price;
                        $subtotal += $lineSub;

                        $linesToInsert[] = [
                            'menu_item_id' => (int) $item['menu_item_id'],
                            'name_snapshot' => $mItem ? $mItem->name : ('Item '.$item['menu_item_id']),
                            'quantity' => $qty,
                            'unit_price' => $price,
                            'subtotal' => $lineSub,
                            'discount_amount' => 0.0,
                            'vat_rate' => 0.0,
                            'vat_amount' => 0.0,
                            'created_at' => $issuedAt,
                            'updated_at' => $issuedAt,
                        ];
                    }

                    if (empty($linesToInsert)) {
                        continue;
                    }

                    $invoiceCode = sprintf('SYN-%d-%s-%04d', $dataset->id, $dateCompact, $invCounter++);

                    $invoice = Invoice::create([
                        'invoice_code' => $invoiceCode,
                        'table_name' => 'Synthetic',
                        'payment_method' => 'cash',
                        'subtotal_amount' => $subtotal,
                        'discount_amount' => 0.0,
                        'vat_amount' => 0.0,
                        'total_amount' => $subtotal,
                        'amount_received' => $subtotal,
                        'change_amount' => 0.0,
                        'issued_at' => $issuedAt,
                        'synthetic_dataset_id' => $dataset->id,
                        'created_at' => $issuedAt,
                        'updated_at' => $issuedAt,
                    ]);

                    foreach ($linesToInsert as &$line) {
                        $line['invoice_id'] = $invoice->id;
                    }
                    unset($line);

                    InvoiceLine::insert($linesToInsert);
                }
            });
        }
    }
}
