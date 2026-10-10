<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Synthetic Dataset Generator Flag
    |--------------------------------------------------------------------------
    |
    | When disabled, generation or alteration of synthetic datasets is prohibited
    | in production environments.
    |
    */
    'synthetic_enabled' => (bool) env('FORECAST_SYNTHETIC_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | Forecasting Horizon & Windows
    |--------------------------------------------------------------------------
    |
    | Supported prediction horizons (in days) and rolling window sizes for SMA.
    |
    */
    'horizons' => [
        'default' => 7,
        'available' => [7, 30],
    ],

    'windows' => [7, 14, 28],

    /*
    |--------------------------------------------------------------------------
    | Candidate Forecasting Models
    |--------------------------------------------------------------------------
    */
    'models' => [
        'candidates' => [
            'sma_7',
            'sma_14',
            'sma_28',
            'holt_winters_additive',
            'holt_winters_multiplicative',
        ],
        'default' => 'sma_7',
    ],

    /*
    |--------------------------------------------------------------------------
    | Rolling Origin Evaluation
    |--------------------------------------------------------------------------
    */
    'evaluation' => [
        'initial_training_window' => 56,
        'horizon' => 7,
        'origin_step' => 7,
        'origins_default' => 8,
        'origins_min' => 3,
        'primary_metric' => 'wape',
        'tie_break_wape_threshold' => 0.5,
    ],

    /*
    |--------------------------------------------------------------------------
    | Execution Schedule Defaults
    |--------------------------------------------------------------------------
    */
    'schedule' => [
        'aggregate_demand' => '00:10',
        'run_forecast' => '00:15',
        'evaluate_models' => '01:00',
    ],
];
