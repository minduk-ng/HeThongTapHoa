<?php

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    config()->set('filesystems.disks.sirv', [
        'driver' => 'sirv',
        'enabled' => true,
        'client_id' => 'test-client-id',
        'client_secret' => 'test-client-secret',
        'cdn_url' => 'https://ngminduk-191.sirv.com',
        'base_folder' => '/TapHoa',
    ]);
});

test('storage disk sirv is registered and can generate url', function () {
    $url = Storage::disk('sirv')->url('banner/banner.png');
    expect($url)->toBe('https://ngminduk-191.sirv.com/TapHoa/banner/banner.png');
});

test('storage disk sirv can put file', function () {
    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token', 'expiresIn' => 1200], 200),
        'api.sirv.com/v2/files/upload*' => Http::response([], 200),
    ]);

    $result = Storage::disk('sirv')->put('test.txt', 'hello sirv');
    expect($result)->toBeTrue();
});
