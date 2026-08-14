<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Role;
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

    public function test_guest_cannot_access_dashboard_home()
    {
        $response = $this->get('/');
        $response->assertRedirect('/login');
    }

    public function test_unauthorized_user_cannot_access_dashboard_home()
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->get('/');
        $response->assertStatus(403);
    }

    public function test_authorized_admin_can_access_dashboard_home()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (! $adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        $response = $this->actingAs($adminUser)->get('/');
        $response->assertOk();
    }

    public function test_dashboard_returns_correct_kpis_structure()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (! $adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        $response = $this->actingAs($adminUser)->get('/?date_range=today');

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

    public function test_dashboard_top_products_reads_from_invoice_lines()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (! $adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        // Seed: 1 invoice + 1 invoice_line (tạo dữ liệu MỚI theo tầng thanh toán)
        $invoice = Invoice::create([
            'invoice_code' => 'DASH1', 'table_name' => 'B01', 'payment_method' => 'cash',
            'amount_received' => 60000, 'change_amount' => 0, 'total_amount' => 60000,
        ]);
        $invoice->forceFill(['issued_at' => now()])->save();
        InvoiceLine::create([
            'invoice_id' => $invoice->id, 'menu_item_id' => null, 'name_snapshot' => 'Cà phê đen',
            'quantity' => 3, 'unit_price' => 20000, 'subtotal' => 60000,
            'vat_rate' => 0, 'vat_amount' => 0, 'discount_amount' => 0,
        ]);

        $response = $this->actingAs($adminUser)->get('/?date_range=today');
        $response->assertInertia(fn ($page) => $page
            ->component('manager/dashboard/DashboardManager')
            ->has('analytics.top_products', 1)
            ->where('analytics.top_products.0.name', 'Cà phê đen')
            ->where('analytics.top_products.0.sales_count', 3)
        );
    }
}
