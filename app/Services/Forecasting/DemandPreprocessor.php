<?php

namespace App\Services\Forecasting;

use Carbon\CarbonImmutable;

class DemandPreprocessor
{
    /**
     * Prepare a causal demand series from observation rows up to cutoff.
     *
     * @param  list<array{date: string, observed_sales: float|null, is_open: bool, is_missing: bool, is_stockout: bool}>  $rows
     * @return array{
     *     values: list<float>,
     *     dates: list<string>,
     *     quality: string,
     *     counts: array{
     *         observed: int,
     *         zero: int,
     *         missing: int,
     *         imputed: int,
     *         stockout: int,
     *         closed: int,
     *         dropped_leading: int
     *     },
     *     unavailable_reason: string|null
     * }
     */
    public function prepare(array $rows, string $cutoff): array
    {
        $cutoffDate = CarbonImmutable::parse($cutoff)->startOfDay();

        // Filter up to cutoff and sort ascending by date
        $filtered = [];
        foreach ($rows as $row) {
            $rowDate = CarbonImmutable::parse($row['date'])->startOfDay();
            if ($rowDate->lte($cutoffDate)) {
                $filtered[] = $row;
            }
        }

        usort($filtered, fn ($a, $b) => strcmp($a['date'], $b['date']));

        $counts = [
            'observed' => 0,
            'zero' => 0,
            'missing' => 0,
            'imputed' => 0,
            'stockout' => 0,
            'closed' => 0,
            'dropped_leading' => 0,
        ];

        if (empty($filtered)) {
            return [
                'values' => [],
                'dates' => [],
                'quality' => 'insufficient',
                'counts' => $counts,
                'unavailable_reason' => 'No historical observations found up to cutoff.',
            ];
        }

        // Store original observations mapped by date string for causal lookups
        $originalValidObs = [];

        // Find the index of the first valid observation (to drop leading unfillable missing days)
        $firstValidIndex = null;
        foreach ($filtered as $idx => $r) {
            $isOpen = $r['is_open'];
            $isMissing = $r['is_missing'] || $r['observed_sales'] === null;
            if ($isOpen && ! $isMissing) {
                $firstValidIndex = $idx;
                break;
            }
        }

        if ($firstValidIndex === null) {
            $counts['dropped_leading'] = count($filtered);

            return [
                'values' => [],
                'dates' => [],
                'quality' => 'insufficient',
                'counts' => $counts,
                'unavailable_reason' => 'No valid observations to establish series baseline.',
            ];
        }

        $counts['dropped_leading'] = $firstValidIndex;
        $activeRows = array_slice($filtered, $firstValidIndex);

        $values = [];
        $dates = [];

        foreach ($activeRows as $row) {
            $dateStr = (string) $row['date'];
            $curDate = CarbonImmutable::parse($dateStr);
            $isOpen = $row['is_open'];
            $isMissing = $row['is_missing'] || $row['observed_sales'] === null;
            $isStockout = $row['is_stockout'];

            if (! $isOpen) {
                $val = 0.0;
                $counts['closed']++;
                $counts['zero']++;
            } elseif ($isMissing) {
                $counts['missing']++;

                // Causal imputation precedence 1: same weekday in past 28 days
                $sameWeekdayValues = [];
                for ($w = 1; $w <= 4; $w++) {
                    $pastDateStr = $curDate->subWeeks($w)->toDateString();
                    if (isset($originalValidObs[$pastDateStr])) {
                        $sameWeekdayValues[] = $originalValidObs[$pastDateStr];
                    }
                }

                if (! empty($sameWeekdayValues)) {
                    $val = round(array_sum($sameWeekdayValues) / count($sameWeekdayValues), 4);
                    $counts['imputed']++;
                } else {
                    // Precedence 2: average of up to 7 valid original days immediately prior
                    $recentValues = [];
                    for ($d = 1; $d <= 7; $d++) {
                        $pastDateStr = $curDate->subDays($d)->toDateString();
                        if (isset($originalValidObs[$pastDateStr])) {
                            $recentValues[] = $originalValidObs[$pastDateStr];
                        }
                    }

                    if (! empty($recentValues)) {
                        $val = round(array_sum($recentValues) / count($recentValues), 4);
                        $counts['imputed']++;
                    } else {
                        // Interior gap with no past history
                        return [
                            'values' => [],
                            'dates' => [],
                            'quality' => 'insufficient',
                            'counts' => $counts,
                            'unavailable_reason' => "Unresolved interior gap in observation calendar on {$dateStr}.",
                        ];
                    }
                }
            } else {
                $val = (float) $row['observed_sales'];
                $counts['observed']++;
                if ($val == 0.0) {
                    $counts['zero']++;
                }
                if ($isStockout) {
                    $counts['stockout']++;
                }

                // Register as original valid observation for future imputation
                $originalValidObs[$dateStr] = $val;
            }

            $values[] = $val;
            $dates[] = $dateStr;
        }

        // Determine overall data quality
        $n = count($values);
        if ($n < 7) {
            $quality = 'insufficient';
        } elseif ($counts['imputed'] > 0 || $counts['stockout'] > 0 || $n < 14 || ($counts['zero'] > ($n * 0.7))) {
            $quality = 'limited';
        } else {
            $quality = 'sufficient';
        }

        return [
            'values' => $values,
            'dates' => $dates,
            'quality' => $quality,
            'counts' => $counts,
            'unavailable_reason' => null,
        ];
    }
}
