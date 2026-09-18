<?php

return [
    'large_cash_out_threshold' => (float) env('MONEY_LARGE_CASH_OUT_THRESHOLD', 1_000_000),
    'large_deposit_threshold' => (float) env('MONEY_LARGE_DEPOSIT_THRESHOLD', 10_000_000),
    'refund_burst_threshold' => (int) env('MONEY_REFUND_BURST_THRESHOLD', 5),
];
