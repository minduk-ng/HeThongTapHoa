<?php

namespace App\Services\Forecasting;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\MenuItem;
use App\Models\SyntheticDataset;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class SyntheticDemandGenerator
{
    public const VERSION = '2.0.0';

    /**
     * @param  array<string, mixed>  $configuration
     * @return array<int, array{
     *     date: string,
     *     menu_item_id: int,
     *     latent_demand: float,
     *     observed_sales: float|null,
     *     is_open: bool,
     *     is_missing: bool,
     *     is_stockout: bool,
     *     quantity: int,
     *     signals: array<string, mixed>
     * }>
     */
    /**
     * Resolve full generator configuration with explicit item IDs (no DB access inside generator).
     *
     * @param  array<string, mixed>  $configuration
     * @param  array<int>  $itemIds
     * @return array<string, mixed>
     */
    public static function resolveConfiguration(array $configuration, array $itemIds): array
    {
        if (isset($configuration['preset']) && is_string($configuration['preset'])) {
            $presetKey = $configuration['preset'];
            $presetDefaults = config("forecasting.presets.{$presetKey}", []);
            $configuration = array_merge($presetDefaults, $configuration);
        }

        $ids = array_values(array_map('intval', $itemIds));
        sort($ids);
        $configuration['menu_item_ids'] = $ids;
        $configuration['days'] = max(1, (int) ($configuration['days'] ?? 120));
        $configuration['start_date'] = (string) ($configuration['start_date'] ?? '2026-01-01');

        return $configuration;
    }

    /**
     * @param  array<string, mixed>  $configuration
     * @return list<array{date: string, menu_item_id: int, latent_demand: float, observed_sales: float|null, is_open: bool, is_missing: bool, is_stockout: bool, quantity: int, signals: array<string, mixed>}>
     */
    public function generate(array $configuration, int $seed): array
    {
        $rawIds = $configuration['menu_item_ids'] ?? null;
        if (! is_array($rawIds) || empty($rawIds)) {
            throw new InvalidArgumentException('menu_item_ids must be provided explicitly (generator does not query DB).');
        }
        $configuration = self::resolveConfiguration($configuration, array_values(array_map('intval', $rawIds)));

        $days = (int) $configuration['days'];
        $startDateStr = (string) $configuration['start_date'];
        $baseDate = Carbon::parse($startDateStr);

        $menuItemIds = $configuration['menu_item_ids'];

        $globalBase = (float) ($configuration['base'] ?? ($configuration['orders_per_day'] ?? 20.0));
        $trend = (float) ($configuration['trend'] ?? 0.0);
        $weeklyEnabled = (bool) ($configuration['weekly'] ?? true);
        $noiseRatio = (float) ($configuration['noise'] ?? 0.1);

        $zeroDemandRate = (float) ($configuration['zero_demand_rate'] ?? 0.0);
        $outlierRate = (float) ($configuration['outlier_rate'] ?? 0.0);
        $missingRate = (float) ($configuration['missing_rate'] ?? 0.0);
        $stockoutRate = (float) ($configuration['stockout_censor_rate'] ?? 0.0);

        $promotionRate = (float) ($configuration['promotion_rate'] ?? 0.0);
        $promotionFactor = (float) ($configuration['promotion_factor'] ?? 1.5);

        $shiftFraction = (float) ($configuration['shift_fraction'] ?? 0.0);
        $shiftFactor = (float) ($configuration['shift_factor'] ?? 1.0);

        $closedWeekdays = isset($configuration['closed_weekdays']) && is_array($configuration['closed_weekdays'])
            ? array_map('intval', $configuration['closed_weekdays'])
            : [];

        // Raw day of week factors (1=Monday, ..., 7=Sunday). Sum = 7.4. Normalize so mean is 1.0.
        $rawFactors = [
            1 => 0.85,
            2 => 0.90,
            3 => 0.95,
            4 => 1.00,
            5 => 1.20,
            6 => 1.35,
            7 => 1.15,
        ];
        $meanRaw = array_sum($rawFactors) / 7.0;
        $weeklyFactors = [];
        foreach ($rawFactors as $d => $f) {
            $weeklyFactors[$d] = $f / $meanRaw;
        }

        $results = [];

        foreach ($menuItemIds as $ordinal => $menuItemId) {
            // Independent PRNG streams per menu item ordinal: latent vs observation masking.
            $itemSeed = 1 + (($seed - 1 + 104729 * $ordinal) % 2147483646);
            $maskSeed = 1 + (($seed - 1 + 104729 * $ordinal + 999983) % 2147483646);
            $latentPrng = new SeededPrng($itemSeed);
            $maskPrng = new SeededPrng($maskSeed);

            // Item-specific multiplier and amplitude
            $multiplier = 0.75 + (0.25 * ($ordinal % 5));
            $amplitude = 0.5 + (0.25 * ($ordinal % 3));
            $itemBase = $globalBase * $multiplier;

            // Determine seasonal mode for this item
            $seasonMode = (string) ($configuration['season_mode'] ?? 'additive');
            if (isset($configuration['preset']) && $configuration['preset'] === 'trend_seasonal') {
                $seasonMode = ($ordinal % 2 === 0) ? 'additive' : 'multiplicative';
            }

            for ($d = 0; $d < $days; $d++) {
                $currentDate = $baseDate->copy()->addDays($d);
                $dayOfWeek = (int) $currentDate->isoFormat('E');
                $isOpen = ! in_array($dayOfWeek, $closedWeekdays, true);

                $weeklyFactor = $weeklyEnabled ? ($weeklyFactors[$dayOfWeek] ?? 1.0) : 1.0;
                $trendFactor = max(0.0, 1.0 + ($trend * $d));

                $currentBase = $itemBase;
                if ($shiftFraction > 0.0 && ($d / $days) >= $shiftFraction) {
                    $currentBase *= $shiftFactor;
                }

                $isPromotion = $isOpen && ($promotionRate > 0.0 && $latentPrng->nextFloat() < $promotionRate);
                $currentPromoFactor = $isPromotion ? $promotionFactor : 1.0;

                $noise = 0.0;
                if ($isOpen && $noiseRatio > 0.0) {
                    $noise = ($latentPrng->nextFloat() * 2.0 - 1.0) * $noiseRatio * $currentBase;
                }

                if (! $isOpen) {
                    $latentDemand = 0.0;
                    $observedSales = 0.0;
                    $isZero = true;
                    $isOutlier = false;
                    $isStockout = false;
                    $isMissing = false;
                } else {
                    if ($seasonMode === 'multiplicative') {
                        $rawDemand = ($currentBase * $trendFactor * max(0.0, 1.0 + $amplitude * ($weeklyFactor - 1.0)) * $currentPromoFactor) + $noise;
                    } else {
                        $rawDemand = ($currentBase * $trendFactor + $currentBase * $amplitude * ($weeklyFactor - 1.0)) * $currentPromoFactor + $noise;
                    }
                    $rawDemand = max(0.0, $rawDemand);

                    $isZero = false;
                    $isOutlier = false;

                    if ($zeroDemandRate > 0.0 && $latentPrng->nextFloat() < $zeroDemandRate) {
                        $latentDemand = 0.0;
                        $isZero = true;
                    } elseif ($outlierRate > 0.0 && $latentPrng->nextFloat() < $outlierRate) {
                        $latentDemand = round($rawDemand * 2.5, 4);
                        $isOutlier = true;
                    } else {
                        $latentDemand = round($rawDemand, 4);
                    }

                    // Determine observed sales
                    $isMissing = false;
                    $isStockout = false;

                    if ($missingRate > 0.0 && $maskPrng->nextFloat() < $missingRate) {
                        $observedSales = null;
                        $isMissing = true;
                    } elseif ($stockoutRate > 0.0 && $maskPrng->nextFloat() < $stockoutRate) {
                        $observedSales = floor(0.4 * $latentDemand);
                        $isStockout = true;
                    } else {
                        $observedSales = $latentDemand;
                    }
                }

                $signals = [
                    'day_of_week' => $dayOfWeek,
                    'trend_factor' => round($trendFactor, 6),
                    'weekly_factor' => round($weeklyFactor, 4),
                    'season_mode' => $seasonMode,
                    'promotion' => $isPromotion,
                    'promotion_factor' => $currentPromoFactor,
                    'noise' => round($noise, 4),
                    'zero_demand' => $isZero,
                    'outlier' => $isOutlier,
                    'stockout' => $isStockout,
                ];

                $quantity = ($isMissing || $observedSales === null) ? 0 : (int) round($observedSales);

                $results[] = [
                    'date' => $currentDate->toDateString(),
                    'menu_item_id' => $menuItemId,
                    'latent_demand' => $latentDemand,
                    'observed_sales' => $observedSales,
                    'is_open' => $isOpen,
                    'is_missing' => $isMissing,
                    'is_stockout' => $isStockout,
                    'quantity' => $quantity,
                    'signals' => $signals,
                ];
            }
        }

        // Sort results by date then menu_item_id deterministically
        usort($results, function ($a, $b) {
            $cmp = strcmp($a['date'], $b['date']);
            if ($cmp !== 0) {
                return $cmp;
            }

            return $a['menu_item_id'] <=> $b['menu_item_id'];
        });

        return $results;
    }

    /**
     * Deterministic canonical hash of configuration or data array.
     *
     * @param  array<mixed>  $value
     */
    public static function canonicalHash(array $value): string
    {
        $normalized = self::normalizeCanonical($value);

        return hash('sha256', (string) json_encode($normalized, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    private static function normalizeCanonical(mixed $data): mixed
    {
        if (! is_array($data)) {
            return $data;
        }

        $isAssoc = array_keys($data) !== range(0, count($data) - 1);
        if ($isAssoc) {
            ksort($data);
        }

        foreach ($data as $k => $v) {
            $data[$k] = self::normalizeCanonical($v);
        }

        return $data;
    }

    /**
     * @param  array<mixed>  $data
     */
    public function hash(array $data): string
    {
        return self::canonicalHash($data);
    }

    /**
     * @param  array<int, array<string, mixed>>  $demandRecords
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
                        $isMissing = (bool) ($item['is_missing'] ?? false);
                        if ($isMissing) {
                            continue;
                        }

                        $qty = (int) round((float) ($item['observed_sales'] ?? $item['quantity'] ?? 0));
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
