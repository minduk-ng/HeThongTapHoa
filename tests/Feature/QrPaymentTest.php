<?php

test('QR config phai duoc mo ta trong env', function () {
    config()->set('payment.qr.enabled', true);
    expect(config('payment.qr.enabled'))->toBeTrue();
    expect(config('payment.qr.bank_code'))->not->toBeEmpty();
});

test('payment_qr duoc share qua HandleInertiaRequests', function () {
    $share = (new \App\Http\Middleware\HandleInertiaRequests())->share(\Illuminate\Http\Request::create('/'));

    expect($share)->toHaveKey('payment_qr');
    expect($share['payment_qr'])->toHaveKeys(['enabled', 'bank_code', 'account_no', 'account_name']);
});
