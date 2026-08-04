<?php

namespace Tests\Feature\Reports;

use App\Models\Invoice;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductDetailsReportTest extends TestCase
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

    /** Tạo hoá đơn paid ở $issuedAt với các dòng $specs [['item' => MenuItem, 'qty' => int, 'price' => float]]. */
    private function makePaidInvoice(string $issuedAt, array $specs): void
    {
        $invoice = Invoice::create([
            'invoice_code' => 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => 'cash',
            'amount_received' => 0,
            'change_amount' => 0,
            'total_amount' => 0,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => $issuedAt])->save();
        posOrder(posTable(), $specs, ['invoice_id' => $invoice->id, 'status' => 'paid']);
    }

    public function test_unauthorized_user_cannot_access()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/product-details')
            ->assertStatus(403);
    }

    public function test_groups_items_and_computes_metrics()
    {
        $itemA = posMenuItem(['name' => 'Phở bò', 'price' => 30000]);
        $itemB = posMenuItem(['name' => 'Trà đá', 'price' => 10000]);
        $this->makePaidInvoice('2026-07-15 10:00:00', [
            ['item' => $itemA, 'qty' => 2, 'price' => 30000],
            ['item' => $itemB, 'qty' => 3, 'price' => 10000],
        ]);
        $this->makePaidInvoice('2026-06-01 10:00:00', [
            ['item' => $itemA, 'qty' => 9, 'price' => 30000],
        ]);

        $this->actingAs($this->adminUser())
            ->get('/reports/product-details?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/ProductDetailsReport')
                ->has('rows', 2)
                ->where('metrics.revenue', 90000)   // 2*30000 + 3*10000 (ngoài kỳ không tính)
                ->where('metrics.quantity_total', 5)
                ->where('metrics.item_count', 2)
                ->where('metrics.top_item', 'Phở bò')
                ->has('categories')
            );
    }

    public function test_revenue_subtracts_line_discount()
    {
        $itemA = posMenuItem(['name' => 'Cà phê đen', 'price' => 15000]);
        $itemB = posMenuItem(['name' => 'Trà đá', 'price' => 10000]);
        $this->makePaidInvoice('2026-07-15 10:00:00', [
            ['item' => $itemA, 'qty' => 2, 'price' => 15000],
            ['item' => $itemB, 'qty' => 1, 'price' => 10000],
        ]);

        // Giảm giá 15.000 phân bổ xuống dòng Cà phê đen (vd: 1 đơn có mã KM)
        \App\Models\OrderItem::where('menu_item_id', $itemA->id)
            ->update(['discount_amount' => 15000]);

        $this->actingAs($this->adminUser())
            ->get('/reports/product-details?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->has('rows', 2)
                ->where('metrics.revenue', 25000)   // (2*15000 - 15000) + 1*10000
                ->where('metrics.quantity_total', 3)
                ->where('rows.0.item_name', 'Cà phê đen')
                ->where('rows.0.revenue', 15000)    // 30000 - 15000 KM
                ->where('rows.0.discount_amount', 15000)
                ->where('rows.1.item_name', 'Trà đá')
                ->where('rows.1.revenue', 10000)
                ->where('rows.1.discount_amount', 0)
            );
    }

    public function test_date_filter_excludes_out_of_range_rows()
    {
        $itemA = posMenuItem(['name' => 'Phở bò']);
        $this->makePaidInvoice('2026-06-01 10:00:00', [
            ['item' => $itemA, 'qty' => 5, 'price' => 30000],
        ]);

        $this->actingAs($this->adminUser())
            ->get('/reports/product-details?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page->has('rows', 0));
    }
}
