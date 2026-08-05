<?php

test('cdn_asset returns local asset url when sirv is disabled', function () {
    config()->set('filesystems.disks.sirv.enabled', false);

    $url = cdn_asset('logo/minilogo.png');
    expect($url)->toContain('/logo/minilogo.png');
});

test('cdn_asset returns sirv cdn url when sirv is enabled', function () {
    config()->set('filesystems.disks.sirv.enabled', true);
    config()->set('filesystems.disks.sirv.cdn_url', 'https://ngminduk-191.sirv.com');
    config()->set('filesystems.disks.sirv.base_folder', '/TapHoa');

    $url = cdn_asset('logo/minilogo.png');
    expect($url)->toBe('https://ngminduk-191.sirv.com/TapHoa/logo/minilogo.png');
});

test('cdn_asset returns unchanged url if already http absolute url', function () {
    $url = cdn_asset('https://example.com/image.jpg');
    expect($url)->toBe('https://example.com/image.jpg');
});
