<?php

use App\Jobs\Planning\EvaluateForecastModels;
use App\Jobs\Planning\RunDemandForecast;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\Page;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
});

it('denies planning run to a user with view permission only', function () {
    $user = posStaff(['planning.view'], ['/planning']);
    $this->actingAs($user)->post('/planning/runs', ['horizon_days' => 7])->assertForbidden();
});

it('shows planning navigation only to roles with page access', function () {
    $userWithoutAccess = posStaff(['dashboard.view'], ['/']);
    $this->actingAs($userWithoutAccess)->get('/')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->missing('navigation.Dự báo & Kế hoạch')
        );

    $userWithAccess = posStaff(['planning.view'], ['/planning']);
    $this->actingAs($userWithAccess)->get('/planning')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('navigation.Dự báo & Kế hoạch', 1)
        );
});

it('allows planning run and dispatches job for authorized user', function () {
    Queue::fake();

    $user = posStaff(['planning.view', 'planning.run'], ['/planning']);
    $response = $this->actingAs($user)->post('/planning/runs', [
        'horizon_days' => 7,
    ]);

    $response->assertRedirect();
    Queue::assertPushed(RunDemandForecast::class, function ($job) {
        return $job->run->horizon_days === 7 && $job->run->status === 'queued';
    });
});

it('denies model evaluation run without planning.run permission', function () {
    $user = posStaff(['planning.view'], ['/planning', '/planning/evaluation']);
    $this->actingAs($user)->post('/planning/evaluation/runs', ['horizon_days' => 7])->assertForbidden();
});

it('allows model evaluation run and dispatches job for authorized user', function () {
    Queue::fake();

    $user = posStaff(['planning.view', 'planning.run'], ['/planning', '/planning/evaluation']);
    $response = $this->actingAs($user)->post('/planning/evaluation/runs', [
        'horizon_days' => 7,
    ]);

    $response->assertRedirect();
    Queue::assertPushed(EvaluateForecastModels::class, function ($job) {
        return $job->run->kind === 'evaluate' && $job->run->status === 'queued';
    });
});

it('denies model apply without planning.apply_model permission', function () {
    $user = posStaff(['planning.view'], ['/planning', '/planning/evaluation']);
    $this->actingAs($user)->post('/planning/models/apply', [
        'model_key' => 'sma_7',
    ])->assertForbidden();
});

it('allows model apply for user with planning.apply_model permission', function () {
    $user = posStaff(['planning.view', 'planning.apply_model'], ['/planning', '/planning/evaluation']);

    $item = posMenuItem();
    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);
    ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'mae' => 1.0,
        'rmse' => 1.5,
        'wape' => 0.1,
        'is_selected' => false,
    ]);

    $response = $this->actingAs($user)->post('/planning/models/apply', [
        'model_key' => 'sma_7',
        'menu_item_id' => $item->id,
        'forecast_run_id' => $run->id,
    ]);

    $response->assertRedirect();
    expect(ForecastModelEvaluation::where('model_key', 'sma_7')->value('is_selected'))->toBeTrue();

    $log = SecurityAuditLog::where('action', 'planning.apply_model')->first();
    expect($log)->not->toBeNull()
        ->and($log->actor_id)->toBe($user->id)
        ->and($log->target_type)->toBe(ForecastModelEvaluation::class)
        ->and($log->after['model_key'])->toBe('sma_7')
        ->and($log->after['menu_item_id'])->toBe($item->id);
});

it('enforces granular page permissions across all planning GET pages', function () {
    $viewer = posStaff(['planning.view'], ['/planning', '/planning/products', '/planning/procurement', '/planning/evaluation']);

    $this->actingAs($viewer)->get('/planning')->assertOk();
    $this->actingAs($viewer)->get('/planning/products')->assertOk();
    $this->actingAs($viewer)->get('/planning/procurement')->assertOk();
    $this->actingAs($viewer)->get('/planning/evaluation')->assertOk();

    // User without planning.view but with page access
    $unpermitted = posStaff([], ['/planning']);
    $this->actingAs($unpermitted)->get('/planning')->assertForbidden();

    // User with planning.view but without page access
    $noPageAccess = posStaff(['planning.view'], []);
    $this->actingAs($noPageAccess)->get('/planning')->assertForbidden();
});

it('requires authentication for planning routes', function () {
    $this->get('/planning')->assertRedirect('/login');
    $this->post('/planning/runs')->assertRedirect('/login');
});

it('seeds exact planning pages and permissions', function () {
    $expectedPages = [
        ['route_path' => '/planning', 'name' => 'Tổng quan', 'group_name' => 'Dự báo & Kế hoạch', 'sort_order' => 50],
        ['route_path' => '/planning/products', 'name' => 'Dự báo sản phẩm', 'group_name' => 'Dự báo & Kế hoạch', 'sort_order' => 51],
        ['route_path' => '/planning/procurement', 'name' => 'Đề xuất nhập hàng', 'group_name' => 'Dự báo & Kế hoạch', 'sort_order' => 52],
        ['route_path' => '/planning/evaluation', 'name' => 'Đánh giá mô hình', 'group_name' => 'Dự báo & Kế hoạch', 'sort_order' => 53],
        ['route_path' => '/admin/synthetic-datasets', 'name' => 'Dữ liệu mô phỏng', 'group_name' => 'Dự báo & Kế hoạch', 'sort_order' => 54],
    ];

    foreach ($expectedPages as $expected) {
        $page = Page::firstWhere('route_path', $expected['route_path']);
        expect($page)->not->toBeNull()
            ->and($page->name)->toBe($expected['name'])
            ->and($page->group_name)->toBe($expected['group_name'])
            ->and($page->sort_order)->toBe($expected['sort_order']);
    }

    $expectedPermissions = [
        'planning.view',
        'planning.run',
        'planning.configure',
        'planning.apply_model',
        'planning.procurement_review',
        'planning.experiments',
    ];

    foreach ($expectedPermissions as $permName) {
        expect(Permission::where('name', $permName)->exists())->toBeTrue();
    }
});

it('auto-registers planning permissions in RoleController', function () {
    // Delete one planning permission to verify auto-registration
    Permission::where('name', 'planning.configure')->delete();
    expect(Permission::where('name', 'planning.configure')->exists())->toBeFalse();

    $admin = posAdmin();
    $this->actingAs($admin)->get('/admin/roles')->assertOk();

    expect(Permission::where('name', 'planning.configure')->exists())->toBeTrue();
});

it('allows admin full access to planning pages and runs', function () {
    Queue::fake();

    $admin = posAdmin();

    $this->actingAs($admin)->get('/planning')->assertOk();
    $this->actingAs($admin)->get('/planning/products')->assertOk();
    $this->actingAs($admin)->get('/planning/procurement')->assertOk();
    $this->actingAs($admin)->get('/planning/evaluation')->assertOk();
    $this->actingAs($admin)->get('/admin/synthetic-datasets')->assertOk();

    $this->actingAs($admin)->post('/planning/runs', ['horizon_days' => 30])->assertRedirect();
    Queue::assertPushed(RunDemandForecast::class);
});
