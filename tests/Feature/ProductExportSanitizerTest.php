<?php

test('product csv export neutralizes spreadsheet formulas', function () {
    $admin = posAdmin();
    posMenuItem(['name' => '=HYPERLINK("http://evil.example","click")', 'description' => '@SUM(1+1)']);

    $response = $this->actingAs($admin)->get('/manager/products/export');

    $response->assertOk();
    $content = $response->streamedContent();
    expect($content)->toContain("'=HYPERLINK");
    expect($content)->toContain("'@SUM");
    expect($content)->not->toContain('"=HYPERLINK');
});
