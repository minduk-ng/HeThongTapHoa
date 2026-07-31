<?php

namespace Tests\Feature\Reports;

use App\Models\Invoice;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentsReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AuthorizationSeeder::class);
    }

    private function adminUser(): User
    {
        $adminUser = User::factory()->create();
        $adminUser->roles()->attach(\App\Models\Role::where('name', 'admin')->first());

        return $adminUser;
    }

    private function makeInvoice(string $issuedAt, string $method, float $total): void
    {
        $invoice = Invoice::create([
            'invoice_code' => 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => $method,
            'amount_received' => $total,
            'change_amount' => 0,
            'total_amount' => $total,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => $issuedAt])->save();
    }

    public function test_unauthorized_user_cannot_access()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/payments')
            ->assertStatus(403);
    }

    public function test_metrics_and_comparison()
    {
        // Kỳ trước liền kề (tháng 6): 100000; kỳ hiện tại (tháng 7): 300000 (200k cash + 100k ck).
        $this->makeInvoice('2026-06-15 10:00:00', 'cash', 100000);
        $this->makeInvoice('2026-07-10 10:00:00', 'cash', 200000);
        $this->makeInvoice('2026-07-11 10:00:00', 'bank_transfer', 100000);

        $this->actingAs($this->adminUser())
            ->get('/reports/payments?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/PaymentsReport')
                ->where('metrics.revenue', 300000)
                ->where('metrics.cash_total', 200000)
                ->where('metrics.bank_total', 100000)
                ->where('metrics.invoice_count', 2)
                ->where('comparison.prev_revenue', 100000)
                ->where('comparison.change_pct', 200)
            );
    }

    public function test_change_pct_null_when_prev_zero()
    {
        $this->makeInvoice('2026-07-10 10:00:00', 'cash', 50000);

        $this->actingAs($this->adminUser())
            ->get('/reports/payments?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->where('comparison.change_pct', null)
            );
    }
}
