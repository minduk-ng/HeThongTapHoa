<?php

use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

it('denies guest access to forecast checks routes', function () {
    $this->get('/planning/forecast-checks')->assertRedirect('/login');
    $this->postJson('/planning/forecast-checks', [])->assertUnauthorized();
});

it('denies access to users without planning.experiments permission', function () {
    $user = posStaff(['planning.view'], ['/planning']);
    $this->actingAs($user)->get('/planning/forecast-checks')->assertForbidden();
    $this->actingAs($user)->postJson('/planning/forecast-checks', [])->assertForbidden();
});

it('allows access to users with planning.experiments permission and page access', function () {
    $admin = posAdmin();
    $this->actingAs($admin)->get('/planning/forecast-checks')->assertOk();
});

it('blocks creating forecast check when synthetic_enabled is false', function () {
    config(['forecasting.synthetic_enabled' => false]);
    $admin = posAdmin();

    $this->actingAs($admin)->postJson('/planning/forecast-checks', [
        'synthetic_dataset_id' => 1,
        'menu_item_id' => 1,
        'start_date' => '2026-01-15',
        'submission_token' => '9d2b27e1-2726-4a13-84cb-46bc97e64405',
    ])->assertForbidden();
});
