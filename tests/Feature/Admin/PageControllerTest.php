<?php

use App\Models\Page;

test('admin tao page co sub_group', function () {
    $admin = posAdmin();
    $this->actingAs($admin)->post('/admin/pages', [
        'name' => 'Bao cao test', 'route_path' => '/reports/xyz', 'group_name' => 'Báo cáo', 'sub_group' => 'Doanh thu',
    ])->assertSessionHasNoErrors();

    $page = Page::where('route_path', '/reports/xyz')->first();
    expect($page->sub_group)->toBe('Doanh thu');
});

test('admin sua page cap nhat sub_group', function () {
    $admin = posAdmin();
    $page = Page::create(['name' => 'Old', 'route_path' => '/reports/old', 'group_name' => 'Báo cáo', 'sort_order' => 99]);

    $this->actingAs($admin)->put("/admin/pages/{$page->id}", [
        'name' => 'New', 'route_path' => '/reports/old', 'group_name' => 'Báo cáo', 'sub_group' => 'Hoạt động',
    ])->assertSessionHasNoErrors();

    expect($page->fresh()->sub_group)->toBe('Hoạt động');
});
