<?php

use Database\Seeders\AuthorizationSeeder;

test('navigation bao cao chia __subs theo sub_group, group khac flat', function () {
    $this->seed(AuthorizationSeeder::class);
    $admin = posAdmin();

    $this->actingAs($admin)->get('/')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('manager/dashboard/DashboardManager')
            ->has('navigation.Báo cáo.__subs.Doanh thu', 5)
            ->has('navigation.Báo cáo.__subs.Hoạt động', 3)
            ->missing('navigation.Quản lý.__subs')
            ->has('navigation.Quản lý')
            ->has('navigation.Quản lý.0.id'));
});
