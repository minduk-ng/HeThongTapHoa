<?php

use App\Models\ForecastCheck;
use App\Services\Forecasting\DemandPreprocessor;
use App\Services\Forecasting\ForecastCheckService;
use App\Services\Forecasting\ForecastModelRunner;
use Carbon\CarbonImmutable;
use Tests\TestCase;

uses(TestCase::class);

it('ranks using full precision and keeps exported point errors consistent', function () {
    $runner = new class extends ForecastModelRunner
    {
        public function run(string $key, array $training, int $horizon, array $parameters = []): array
        {
            $error = match ($key) {
                'naive' => 0.000001,
                'seasonal_naive_7' => 0.000002,
                default => 1.0,
            };

            return ['status' => 'evaluated', 'predictions' => array_fill(0, $horizon, 10.0 + $error), 'parameters' => [], 'reason' => null];
        }
    };
    $observations = [];
    for ($day = 0; $day < 21; $day++) {
        $observations[] = [
            'date' => CarbonImmutable::parse('2026-01-01')->addDays($day)->toDateString(),
            'observed_sales' => 10.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false,
        ];
    }
    $result = (new ForecastCheckService(new DemandPreprocessor, $runner))->calculate([
        'start_date' => '2026-01-15', 'end_date' => '2026-01-21', 'cutoff' => '2026-01-14',
        'versions' => ForecastCheck::VERSIONS, 'observations' => $observations,
    ]);
    expect($result['best_model_keys'])->toBe(['naive']);
    $candidate = $result['candidates'][0];
    expect($candidate['mae'])->toEqualWithDelta(0.000001, 1e-12)
        ->and($candidate['points'][0]['predicted'])->toBe($candidate['predictions'][0])
        ->and($candidate['points'][0]['absolute_error'])->toBe($candidate['mae']);
});
