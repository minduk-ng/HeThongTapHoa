<?php

test('config admin khong co default password', function () {
    $originalEnvironment = [];
    foreach (['ADMIN_EMAIL', 'ADMIN_DEFAULT_PASSWORD'] as $var) {
        $originalEnvironment[$var] = [getenv($var), $_ENV[$var] ?? null, $_SERVER[$var] ?? null];
    }
    $originalConfig = config('services.admin');

    try {
        // Bỏ env (test chạy không env ADMIN_*) → phải ra null, không phải '244466666'
        foreach (array_keys($originalEnvironment) as $var) {
            putenv($var);
            unset($_ENV[$var], $_SERVER[$var]);
        }
        config()->set('services.admin.email', env('ADMIN_EMAIL'));
        config()->set('services.admin.default_password', env('ADMIN_DEFAULT_PASSWORD'));

        expect(config('services.admin.email'))->toBeNull();
        expect(config('services.admin.default_password'))->toBeNull();
    } finally {
        foreach ($originalEnvironment as $var => [$process, $environment, $server]) {
            putenv($process === false ? $var : $var.'='.$process);
            if ($environment === null) {
                unset($_ENV[$var]);
            } else {
                $_ENV[$var] = $environment;
            }
            if ($server === null) {
                unset($_SERVER[$var]);
            } else {
                $_SERVER[$var] = $server;
            }
        }
        config()->set('services.admin', $originalConfig);
    }
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

test('private pos channel requires pos permission', function () {
    $guest = posStaff([], []);
    $this->actingAs($guest)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-pos-channel',
    ])->assertForbidden();

    $allowed = posStaff(['pos.view'], []);
    $this->actingAs($allowed)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-pos-channel',
    ])->assertOk();
});

test('private kitchen channel requires kitchen permission', function () {
    $denied = posStaff([], []);
    $this->actingAs($denied)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-kitchen-channel',
    ])->assertForbidden();

    $allowed = posStaff(['kitchen.view'], []);
    $this->actingAs($allowed)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-kitchen-channel',
    ])->assertOk();
});

test('private inventory channel requires ingredients or history permission', function () {
    $denied = posStaff([], []);
    $this->actingAs($denied)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-inventory-channel',
    ])->assertForbidden();

    $allowed = posStaff(['ingredients.view'], []);
    $this->actingAs($allowed)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-inventory-channel',
    ])->assertOk();

    $allowedHistory = posStaff(['inventory.history.view'], []);
    $this->actingAs($allowedHistory)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-inventory-channel',
    ])->assertOk();
});

test('presence pos-room requires pos view or create permission', function () {
    $denied = posStaff([], []);
    $this->actingAs($denied)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'presence-pos-room',
    ])->assertForbidden();

    $allowed = posStaff(['pos.create'], []);
    $this->actingAs($allowed)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'presence-pos-room',
    ])->assertOk();

    $viewOnly = posStaff(['pos.view'], []);
    $this->actingAs($viewOnly)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'presence-pos-room',
    ])->assertOk();
});
