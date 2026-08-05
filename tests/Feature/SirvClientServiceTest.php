<?php

use App\Services\Sirv\SirvClientService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

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

test('sirv client gets access token and caches it', function () {
    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token', 'expiresIn' => 1200], 200),
    ]);

    $service = new SirvClientService();
    $token = $service->getAccessToken();

    expect($token)->toBe('fake-jwt-token');
    expect(Cache::get('sirv_access_token'))->toBe('fake-jwt-token');
});

test('sirv client builds cdn url correctly', function () {
    $service = new SirvClientService();
    $url = $service->getUrl('logo/minilogo.png');

    expect($url)->toBe('https://ngminduk-191.sirv.com/TapHoa/logo/minilogo.png');
});

test('sirv client uploads file to sirv api', function () {
    Http::fake([
        'api.sirv.com/v2/token' => Http::response(['token' => 'fake-jwt-token', 'expiresIn' => 1200], 200),
        'api.sirv.com/v2/files/upload*' => Http::response([], 200),
    ]);

    $service = new SirvClientService();
    $result = $service->uploadFile('logo/minilogo.png', 'binary-content');

    expect($result)->toBeTrue();
});
