<?php

namespace Tests\Feature\Reports;

use App\Models\Invoice;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SalesInvoiceReportTest extends TestCase
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
        $adminRole = \App\Models\Role::where('name', 'admin')->first();
        $adminUser->roles()->attach($adminRole);

        return $adminUser;
    }

    private function makeInvoice(string $issuedAt, string $method = 'cash', float $total = 100000, ?string $code = null): Invoice
    {
        $invoice = Invoice::create([
            'invoice_code' => $code ?? 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => $method,
            'amount_received' => $total,
            'change_amount' => 0,
            'total_amount' => $total,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => $issuedAt])->save();

        return $invoice;
    }

    public function test_unauthorized_user_cannot_access_report()
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/reports/sales-invoices')->assertStatus(403);
    }

    public function test_filters_invoices_by_date_range()
    {
        $in = $this->makeInvoice('2026-07-15 12:00:00');
        $this->makeInvoice('2026-06-01 12:00:00');

        $this->actingAs($this->adminUser())
            ->get('/reports/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/SalesInvoiceReport')
                ->has('invoices', 1)
                ->where('invoices.0.invoice_code', $in->invoice_code)
            );
    }

    public function test_metrics_are_correct()
    {
        $this->makeInvoice('2026-07-10 09:00:00', 'cash', 100000);
        $this->makeInvoice('2026-07-11 09:00:00', 'bank_transfer', 200000);

        $this->actingAs($this->adminUser())
            ->get('/reports/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->where('metrics.revenue', 300000)
                ->where('metrics.invoice_count', 2)
                ->where('metrics.avg_invoice', 150000)
                ->where('metrics.bank_transfer_count', 1)
            );
    }

    public function test_avg_invoice_is_zero_when_no_invoices()
    {
        $this->actingAs($this->adminUser())
            ->get('/reports/sales-invoices')
            ->assertInertia(fn ($page) => $page
                ->where('metrics.invoice_count', 0)
                ->where('metrics.avg_invoice', 0)
            );
    }

    public function test_gross_discount_doc_tu_invoice_snapshot_khong_phai_orders_child()
    {
        $this->actingAs($this->adminUser());
        $invoice = \App\Models\Invoice::create([
            'invoice_code' => 'SIR1', 'table_name' => 'B01', 'payment_method' => 'cash',
            'amount_received' => 90000, 'change_amount' => 0, 'total_amount' => 90000,
            'subtotal_amount' => 100000, 'discount_amount' => 10000,
        ]);
        $invoice->forceFill(['issued_at' => '2026-07-15 10:00:00'])->save();

        $this->get('/reports/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->has('invoices', 1)
                ->where('invoices.0.gross_amount', 100000)
                ->where('invoices.0.discount_amount', 10000)
            );
    }

    public function test_invoice_exposes_gross_and_discount_columns()
    {
        $invoice = $this->makeInvoice('2026-07-15 12:00:00', 'cash', 80000);
        $invoice->forceFill(['subtotal_amount' => 100000, 'discount_amount' => 20000])->save();
        posOrder(posTable(), [
            ['item' => posMenuItem(['price' => 100000]), 'qty' => 1, 'price' => 100000],
        ], [
            'invoice_id' => $invoice->id,
            'status' => 'paid',
            'subtotal' => 100000,
            'discount_amount' => 20000,
        ]);

        $this->actingAs($this->adminUser())
            ->get('/reports/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->where('invoices.0.total_amount', 80000)
                ->where('invoices.0.gross_amount', 100000)
                ->where('invoices.0.discount_amount', 20000)
            );
    }
}
