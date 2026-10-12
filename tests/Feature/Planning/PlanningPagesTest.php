<?php

use App\Models\ForecastRun;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
});

it('returns only approved model keys on evaluation page', function () {
    $this->actingAs(posAdmin())->get('/planning/evaluation')
        ->assertInertia(fn ($page) => $page
            ->component('planning/ModelEvaluation')
            ->where('candidate_keys', [
                'naive', 'seasonal_naive_7', 'sma_7', 'sma_14', 'sma_28',
                'holt_winters_additive', 'holt_winters_multiplicative',
            ]));
});

it('returns approved metrics and methodology on evaluation page', function () {
    $this->actingAs(posAdmin())->get('/planning/evaluation')
        ->assertInertia(fn ($page) => $page
            ->component('planning/ModelEvaluation')
            ->where('metrics', ['mae', 'rmse', 'wape'])
            ->has('methodology')
            ->has('modelComparison', 7)
        );
});

it('scopes evaluation by horizon and keeps null wape as null', function () {
    $this->actingAs(posAdmin())->get('/planning/evaluation?horizon_days=30')
        ->assertInertia(fn ($page) => $page
            ->component('planning/ModelEvaluation')
            ->has('modelComparison', 7)
            ->where('modelComparison.0.avg_wape', null)
        );
});

it('renders product forecasts page with paginated products and filter props', function () {
    $this->actingAs(posAdmin())->get('/planning/products')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('planning/ProductForecasts')
            ->has('products')
            ->has('forecasts')
            ->has('categories')
            ->has('filters')
        );
});

it('supports search, category, horizon, and quality filters on product forecasts page', function () {
    $category = MenuCategory::create(['name' => 'Cà phê', 'description' => 'Cà phê']);
    $item = MenuItem::create([
        'category_id' => $category->id,
        'name' => 'Cà phê muối',
        'price' => 25000,
        'vat_rate' => 0.1,
        'is_available' => true,
    ]);

    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    ProductForecast::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'forecast_date' => now()->addDay()->toDateString(),
        'forecast_quantity' => 15.0,
        'lower_bound' => 12.0,
        'upper_bound' => 18.0,
        'model_key' => 'sma_7',
        'data_quality' => 'sufficient',
        'data_cutoff' => now()->startOfDay(),
    ]);

    $this->actingAs(posAdmin())->get("/planning/products?search=muối&category_id={$category->id}&horizon_days=7&quality=sufficient")
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('planning/ProductForecasts')
            ->where('filters.search', 'muối')
            ->where('filters.category_id', $category->id)
            ->where('filters.quality', 'sufficient')
            ->has('products.data', 1)
            ->where('products.data.0.name', 'Cà phê muối')
            ->where('products.data.0.forecast_quantity', 15)
        );
});

it('applies selected candidate model via post /planning/models/apply', function () {
    $user = posStaff(['planning.view', 'planning.apply_model'], ['/planning', '/planning/evaluation']);
    $response = $this->actingAs($user)->post('/planning/models/apply', [
        'model_key' => 'holt_winters_additive',
    ]);

    $response->assertRedirect();
});
