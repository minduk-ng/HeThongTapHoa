<?php

namespace Tests\Feature\Reports;

use App\Models\Invoice;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceItemsReportTest extends TestCase
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

    /** Hoá đơn kèm 2 dòng món (qty 2 + 1), issued_at tuỳ ý; trả về [invoice, itemA, itemB]. */
    private function makeInvoiceWithItems(string $issuedAt): array
    {
        $invoice = Invoice::create([
            'invoice_code' => 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => 'cash',
            'amount_received' => 90000,
            'change_amount' => 0,
            'total_amount' => 90000,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => $issuedAt])->save();

        $itemA = posMenuItem(['price' => 20000]);
        $itemB = posMenuItem(['price' => 50000]);
        $order = posOrder(posTable(), [
            ['item' => $itemA, 'qty' => 2, 'price' => 20000],
            ['item' => $itemB, 'qty' => 1, 'price' => 50000],
        ], ['invoice_id' => $invoice->id, 'status' => 'paid']);

        return [$invoice, $order->items];
    }

    public function test_unauthorized_user_cannot_access()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/invoice-items')
            ->assertStatus(403);
    }

    public function test_filters_rows_by_date_range()
    {
        $this->makeInvoiceWithItems('2026-07-15 12:00:00');
        $this->makeInvoiceWithItems('2026-06-01 12:00:00');

        $this->actingAs($this->adminUser())
            ->get('/reports/invoice-items?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/InvoiceItemsReport')
                ->has('rows', 2)
            );
    }

    public function test_metrics_and_excludes_cancelled_items()
    {
        [$invoice, $items] = $this->makeInvoiceWithItems('2026-07-15 12:00:00');
        // Huỷ 1 dòng (qty 1, giá 50000) — còn 2×20000 = 40000.
        $items->last()->forceFill(['status' => 'cancelled', 'cancelled_at' => now()])->save();

        $this->actingAs($this->adminUser())
            ->get('/reports/invoice-items?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->where('metrics.total_amount', 40000)
                ->where('metrics.line_count', 1)
                ->where('metrics.quantity_total', 2)
                ->where('metrics.invoice_count', 1)
            );
    }

    public function test_rows_expose_order_gross_and_discount()
    {
        [$invoice] = $this->makeInvoiceWithItems('2026-07-15 12:00:00');
        $invoice->orders()->update(['discount_amount' => 10000]);

        $this->actingAs($this->adminUser())
            ->get('/reports/invoice-items?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->has('rows', 2)
                ->where('rows.0.order_discount', 10000)
                ->where('rows.0.order_gross', 100000)
            );
    }
}
