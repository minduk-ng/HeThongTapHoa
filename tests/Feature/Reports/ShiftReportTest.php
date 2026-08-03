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
}
