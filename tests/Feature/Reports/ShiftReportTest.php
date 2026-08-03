<?php

namespace Tests\Feature\Reports;

use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShiftReportTest extends TestCase
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
        $adminUser->roles()->attach(Role::where('name', 'admin')->first());

        return $adminUser;
    }

    public function test_shift_has_opened_and_closed_by_relations()
    {
        $opener = User::factory()->create(['name' => 'Người mở']);
        $closer = User::factory()->create(['name' => 'Người đóng']);
        $shift = Shift::create([
            'opened_at' => now(),
            'opening_cash' => 500000,
            'status' => 'closed',
            'opened_by' => $opener->id,
            'closed_by' => $closer->id,
        ]);

        $this->assertSame('Người mở', $shift->openedBy?->name);
        $this->assertSame('Người đóng', $shift->closedBy?->name);
    }

    public function test_unauthorized_user_cannot_access_report()
    {
        $this->actingAs(User::factory()->create())
            ->get('/reports/shifts')
            ->assertStatus(403);
    }

    public function test_index_returns_closed_and_open_shifts()
    {
        $user = $this->adminUser();
        $closed = Shift::create([
            'opened_at' => '2026-07-02 08:00:00',
            'opening_cash' => 1000000,
            'closed_at' => '2026-07-02 16:00:00',
            'closing_cash' => 1500000,
            'actual_cash' => 1550000,
            'status' => 'closed',
            'opened_by' => $user->id,
            'closed_by' => $user->id,
        ]);
        Shift::create([
            'opened_at' => '2026-07-15 08:00:00',
            'opening_cash' => 500000,
            'status' => 'open',
            'opened_by' => $user->id,
        ]);

        $this->actingAs($user)
            ->get('/reports/shifts?start_date=2026-07-01&end_date=2026-07-31')
            ->assertInertia(fn ($page) => $page
                ->component('reports/ShiftReport')
                ->has('rows', 2)
                ->where('rows.0.status', 'open')
                ->where('rows.1.status', 'closed')
                ->where('rows.1.difference', 50000)
                ->where('metrics.total_shift_count', 2)
                ->where('metrics.open_count', 1)
                ->where('metrics.closed_count', 1)
                ->where('metrics.total_opening_cash', 1500000)
                ->where('metrics.total_difference', 50000)
            );
    }
}
