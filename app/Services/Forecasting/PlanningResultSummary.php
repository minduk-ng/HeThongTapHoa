<?php

namespace App\Services\Forecasting;

use App\Models\ForecastRun;

class PlanningResultSummary
{
    /**
     * Both runs must be scoped by the caller to the same source and kind.
     * The latest attempt must also match the requested horizon.
     *
     * @return array{latest_run_status: string|null, matching_horizon: bool, unfiltered_product_count: int, available_product_count: int, recommendation_count: int, positive_recommendation_count: int, empty_reason: 'no_run'|'running'|'failed'|'horizon_mismatch'|'missing_forecasts'|'no_recommendation_evidence'|null}
     */
    public function forRun(?ForecastRun $run, ?ForecastRun $latestRun, ?int $requestedHorizon): array
    {
        $products = $run?->productForecasts();
        $unfiltered = $products ? (clone $products)->distinct()->count('menu_item_id') : 0;
        $available = $products ? (clone $products)->whereNotNull('forecast_quantity')
            ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'unavailable'))
            ->distinct()->count('menu_item_id') : 0;
        $recommendations = $run ? $run->recommendations()->count() : 0;
        $positive = $run ? $run->recommendations()->where('suggested_quantity', '>', 0)->count() : 0;
        $matching = $run !== null && ($requestedHorizon === null || $run->horizon_days === $requestedHorizon);
        $usable = $run !== null && in_array($run->status, ['completed', 'stale'], true);

        if (! $usable) {
            $reason = match ($latestRun->status ?? $run?->status) {
                'queued', 'running' => 'running',
                'failed' => 'failed',
                default => 'no_run',
            };
        } elseif (! $matching) {
            $reason = 'horizon_mismatch';
        } elseif ($available === 0) {
            $reason = 'missing_forecasts';
        } elseif ($recommendations === 0) {
            $reason = 'no_recommendation_evidence';
        } else {
            $reason = null;
        }

        return [
            'latest_run_status' => $latestRun?->status,
            'matching_horizon' => $matching,
            'unfiltered_product_count' => $unfiltered,
            'available_product_count' => $available,
            'recommendation_count' => $recommendations,
            'positive_recommendation_count' => $positive,
            'empty_reason' => $reason,
        ];
    }
}
