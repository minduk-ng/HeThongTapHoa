<?php

namespace Tests\Feature\Reports;

use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CancelledReportTest extends TestCase
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
            ->get('/reports/cancelled')
            ->assertStatus(403);
    }

    public function test_returns_both_collections_filtered_by_date()
    {
        $item = posMenuItem(['price' => 30000]);

        $orderIn = posOrder(posTable(), [['item' => $item, 'qty' => 2, 'price' => 30000]], ['status' => 'cancelled']);
        $orderIn->forceFill(['updated_at' => '2026-07-15 12:00:00'])->save();

        $orderOut = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 30000]], ['status' => 'cancelled']);
        $orderOut->forceFill(['updated_at' => '2026-06-01 12:00:00'])->save();

        $itemRow = $orderIn->items->first();
        $itemRow->forceFill([
            'status' => 'cancelled',
            'cancellation_reason' => 'Khách đổi ý',
            'cancelled_at' => '2026-07-15 11:00:00',
            'cancelled_by_user_id' => $this->adminUser()->id,
        ])->save();

        $this->actingAs($this->adminUser())
            ->get('/reports/cancelled?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/CancelledReport')
                ->has('cancelledOrders', 1)          // đơn ngoài kỳ bị loại
                ->has('cancelledItems', 1)
                ->where('cancelledItems.0.cancellation_reason', 'Khách đổi ý')
                ->where('metrics.cancelled_orders_count', 1)
                ->where('metrics.cancelled_orders_value', 60000)
                ->where('metrics.cancelled_items_count', 1)
                ->where('metrics.cancelled_items_value', 60000)
            );
    }
}
