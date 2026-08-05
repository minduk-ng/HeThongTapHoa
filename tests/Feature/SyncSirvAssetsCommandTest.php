<?php

use Illuminate\Support\Facades\Http;

test('sirv:sync command uploads static assets to sirv', function () {
    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token', 'expiresIn' => 1200], 200),
        'api.sirv.com/v2/files/upload*' => Http::response([], 200),
    ]);

    $this->artisan('sirv:sync')
        ->expectsOutputToContain('Starting Sirv CDN asset synchronization')
        ->assertExitCode(0);
});
