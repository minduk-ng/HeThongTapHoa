<?php

return [
    'qr' => [
        'enabled' => env('PAYMENT_QR_ENABLED', false),
        'bank_code' => env('PAYMENT_QR_BANK_CODE', '970422'),
        'account_no' => env('PAYMENT_QR_ACCOUNT_NO', ''),
        'account_name' => env('PAYMENT_QR_ACCOUNT_NAME', ''),
    ],
];
