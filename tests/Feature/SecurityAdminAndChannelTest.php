<?php

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

test('config admin khong co default password', function () {
    // Bỏ env (test chạy không env ADMIN_*) → phải ra null, không phải '244466666'
    foreach (['ADMIN_EMAIL', 'ADMIN_DEFAULT_PASSWORD'] as $var) {
        putenv($var);
        unset($_ENV[$var], $_SERVER[$var]);
    }
    config()->set('services.admin.email', env('ADMIN_EMAIL'));
    config()->set('services.admin.default_password', env('ADMIN_DEFAULT_PASSWORD'));

    expect(config('services.admin.email'))->toBeNull();
    expect(config('services.admin.default_password'))->toBeNull();
});

test('broadcasting/auth tu choi an danh cho private pos-channel', function () {
    $this->postJson('/broadcasting/auth', [
        'socket_id' => '12345.67890',
        'channel_name' => 'private-pos-channel',
    ])->assertStatus(403);
});

test('broadcasting/auth cho phep user da dang nhap', function () {
    $admin = posAdmin();
    $this->actingAs($admin)->postJson('/broadcasting/auth', [
        'socket_id' => '12345.67890',
        'channel_name' => 'private-pos-channel',
    ])->assertOk();
});
