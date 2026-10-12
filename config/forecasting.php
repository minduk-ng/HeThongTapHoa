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
    | Synthetic Presets
    |--------------------------------------------------------------------------
    */
    'presets' => [
        'stable' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.0,
            'weekly' => false,
            'zero_demand_rate' => 0.0,
            'outlier_rate' => 0.0,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
        'weekly_seasonal' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.0,
            'weekly' => true,
            'season_mode' => 'additive',
            'zero_demand_rate' => 0.0,
            'outlier_rate' => 0.0,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
        'trend_seasonal' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.002,
            'weekly' => true,
            'zero_demand_rate' => 0.0,
            'outlier_rate' => 0.0,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
        'intermittent' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.0,
            'weekly' => false,
            'zero_demand_rate' => 0.6,
            'outlier_rate' => 0.0,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
        'level_shift' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.0,
            'weekly' => false,
            'shift_fraction' => 0.65,
            'shift_factor' => 1.8,
            'zero_demand_rate' => 0.0,
            'outlier_rate' => 0.0,
            'missing_rate' => 0.0,
            'stockout_censor_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
        'data_stress' => [
            'base' => 20.0,
            'noise' => 0.1,
            'trend' => 0.0,
            'weekly' => true,
            'missing_rate' => 0.08,
            'stockout_censor_rate' => 0.1,
            'outlier_rate' => 0.03,
            'zero_demand_rate' => 0.0,
            'promotion_rate' => 0.0,
        ],
    ],

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
            'naive',
            'seasonal_naive_7',
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
