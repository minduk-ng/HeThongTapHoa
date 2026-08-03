<?php

namespace Tests\Feature\Reports;

use App\Models\Deposit;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReservationsReportTest extends TestCase
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

    private function makeReservation(string $time, string $status, float $deposit = 0): \App\Models\Order
    {
        $order = posOrder(posTable(), [], [
            'status' => $status,
            'reservation_name' => 'Anh Minh',
            'reservation_phone' => '0901234567',
        ]);
        $order->forceFill(['reservation_time' => $time])->save();

        if ($deposit > 0) {
            Deposit::create([
                'order_id' => $order->id,
                'amount' => $deposit,
                'method' => 'cash',
                'status' => 'held',
                'received_by_user_id' => $this->adminUser()->id,
            ]);
        }

        return $order;
    }

    public function test_unauthorized_user_cannot_access()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/reservations')
            ->assertStatus(403);
    }

    public function test_lists_reservations_with_result_and_deposit_metrics()
    {
        // Trong kỳ: 1 đã đến (paid, cọc 200k), 1 huỷ. Ngoài kỳ: 1 (không tính).
        $this->makeReservation('2026-07-10 18:00:00', 'paid', 200000);
        $this->makeReservation('2026-07-12 19:00:00', 'cancelled');
        $this->makeReservation('2026-06-01 18:00:00', 'paid', 500000);

        $this->actingAs($this->adminUser())
            ->get('/reports/reservations?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/ReservationsReport')
                ->has('rows', 2)
                ->where('metrics.total', 2)
                ->where('metrics.arrived', 1)
                ->where('metrics.cancelled', 1)
                ->where('metrics.deposit_total', 200000)
            );
    }
}
