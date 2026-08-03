<?php

namespace Tests\Feature\Reports;

use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\ProductRecipe;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfitReportTest extends TestCase
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

    public function test_unauthorized_user_cannot_access()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/profit')
            ->assertStatus(403);
    }

    public function test_profit_uses_recipe_cost_and_flags_missing_recipe()
    {
        // Món A có định lượng: NL1 (cost 5000) *2 + NL2 (cost 2000) *1 → vốn 12000/phần.
        $itemA = posMenuItem(['name' => 'Món A', 'price' => 50000]);
        $nl1 = Ingredient::create(['code' => 'NL'.uniqid(), 'name' => 'NL1', 'unit' => 'kg', 'stock_quantity' => 100, 'cost_price' => 5000]);
        $nl2 = Ingredient::create(['code' => 'NL'.uniqid(), 'name' => 'NL2', 'unit' => 'kg', 'stock_quantity' => 100, 'cost_price' => 2000]);
        ProductRecipe::create(['menu_item_id' => $itemA->id, 'ingredient_id' => $nl1->id, 'amount' => 2, 'unit' => 'kg']);
        ProductRecipe::create(['menu_item_id' => $itemA->id, 'ingredient_id' => $nl2->id, 'amount' => 1, 'unit' => 'kg']);

        // Món B KHÔNG định lượng.
        $itemB = posMenuItem(['name' => 'Món B', 'price' => 10000]);

        $invoice = Invoice::create([
            'invoice_code' => 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => 'cash',
            'amount_received' => 0,
            'change_amount' => 0,
            'total_amount' => 0,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => '2026-07-15 12:00:00'])->save();
        posOrder(posTable(), [
            ['item' => $itemA, 'qty' => 2, 'price' => 50000],   // doanh thu 100000, vốn 24000, LN 76000
            ['item' => $itemB, 'qty' => 1, 'price' => 10000],   // doanh thu 10000, vốn 0, LN 10000
        ], ['invoice_id' => $invoice->id, 'status' => 'paid']);

        $this->actingAs($this->adminUser())
            ->get('/reports/profit?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/ProfitReport')
                ->where('metrics.revenue', 110000)
                ->where('metrics.cost', 24000)
                ->where('metrics.profit', 86000)
                ->where('missing_recipe_count', 1)
                ->has('daily')
            );
    }

    public function test_profit_uses_net_revenue_after_discount()
    {
        $itemA = posMenuItem(['name' => 'Món Net', 'price' => 50000]);
        $invoice = Invoice::create([
            'invoice_code' => 'HD-'.strtoupper(uniqid()),
            'table_name' => 'B01',
            'payment_method' => 'cash',
            'amount_received' => 0,
            'change_amount' => 0,
            'total_amount' => 0,
            'deposit_amount' => 0,
        ]);
        $invoice->forceFill(['issued_at' => '2026-07-15 12:00:00'])->save();
        $order = posOrder(posTable(), [
            ['item' => $itemA, 'qty' => 2, 'price' => 50000],
        ], ['invoice_id' => $invoice->id, 'status' => 'paid', 'discount_amount' => 10000, 'total' => 90000]);
        // Phân bổ 10000 cho 1 dòng (2×50000=100000).
        $order->items->first()->update(['discount_amount' => 10000]);

        $this->actingAs($this->adminUser())
            ->get('/reports/profit?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->where('metrics.revenue', 90000)
                ->where('metrics.cost', 0)
                ->where('metrics.profit', 90000)
            );
    }
}
