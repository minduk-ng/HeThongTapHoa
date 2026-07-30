<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AuthorizationSeeder::class);
    }

    public function test_guest_cannot_access_manager_dashboard()
    {
        $response = $this->get('/manager/dashboard');
        $response->assertRedirect('/login');
    }

    public function test_unauthorized_user_cannot_access_manager_dashboard()
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->get('/manager/dashboard');
        $response->assertStatus(403);
    }

    public function test_authorized_admin_can_access_manager_dashboard()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (!$adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = \App\Models\Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        $response = $this->actingAs($adminUser)->get('/manager/dashboard');
        $response->assertOk();
    }

    public function test_dashboard_returns_correct_kpis_structure()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (!$adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = \App\Models\Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        $response = $this->actingAs($adminUser)->get('/manager/dashboard?date_range=today');
        
        $response->assertInertia(fn ($page) => $page
            ->component('manager/dashboard/DashboardManager')
            ->has('kpis.revenue')
            ->has('kpis.orders')
            ->has('kpis.tables')
            ->has('kpis.inventory_warnings_count')
            ->has('live_operations')
            ->has('analytics.chart_data')
            ->has('analytics.top_products')
            ->has('inventory_warnings')
        );
    }
}
