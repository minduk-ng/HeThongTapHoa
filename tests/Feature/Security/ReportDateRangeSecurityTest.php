<?php

use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthorizationSeeder::class);
});

function reportAdmin(): User
{
    $admin = User::factory()->create();
    $adminRole = Role::where('name', 'admin')->first();
    $admin->roles()->attach($adminRole);

    return $admin;
}

test('valid date range within 90 days passes and returns 200', function () {
    $admin = reportAdmin();

    // 30 days
    $this->actingAs($admin)
        ->get('/reports/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
        ->assertOk();

    // Exactly 90 days (2026-01-01 to 2026-04-01)
    $this->actingAs($admin)
        ->get('/reports/sales-invoices?start_date=2026-01-01&end_date=2026-04-01')
        ->assertOk();
});

test('date range exceeding 90 days fails validation', function () {
    $admin = reportAdmin();

    // 91 days (2026-01-01 to 2026-04-02) - JSON request returns 422
    $this->actingAs($admin)
        ->getJson('/reports/sales-invoices?start_date=2026-01-01&end_date=2026-04-02')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['end_date']);

    // Web request returns session error / redirect back
    $this->actingAs($admin)
        ->get('/reports/sales-invoices?start_date=2026-01-01&end_date=2026-04-02')
        ->assertSessionHasErrors(['end_date']);
});

test('start_date greater than end_date fails validation', function () {
    $admin = reportAdmin();

    $this->actingAs($admin)
        ->getJson('/reports/sales-invoices?start_date=2026-07-31&end_date=2026-07-01')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['end_date']);

    $this->actingAs($admin)
        ->get('/reports/sales-invoices?start_date=2026-07-31&end_date=2026-07-01')
        ->assertSessionHasErrors(['end_date']);
});

test('invalid date format fails validation', function () {
    $admin = reportAdmin();

    $this->actingAs($admin)
        ->getJson('/reports/sales-invoices?start_date=not-a-date&end_date=2026-07-31')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['start_date']);

    $this->actingAs($admin)
        ->getJson('/reports/sales-invoices?start_date=2026-07-01&end_date=not-a-date')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['end_date']);
});

test('all seven report endpoints reject date range exceeding 90 days', function (string $endpoint) {
    $admin = reportAdmin();

    $this->actingAs($admin)
        ->getJson("{$endpoint}?start_date=2026-01-01&end_date=2026-04-02")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['end_date']);
})->with([
    '/reports/sales-invoices',
    '/reports/cancelled',
    '/reports/reservations',
    '/reports/payments',
    '/reports/invoice-items',
    '/reports/consumption',
    '/reports/stock-movement',
]);
