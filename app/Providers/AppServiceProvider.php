<?php

namespace App\Providers;

use App\Models\Ingredient;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Page;
use App\Models\Role;
use App\Models\Table;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->registerCacheInvalidators();
    }

    protected function registerCacheInvalidators(): void
    {
        $flushUserCache = function () {
            try {
                Cache::tags(['user_inertia'])->flush();
            } catch (\Exception $e) {
                Log::warning('Redis flush failed for user_inertia: '.$e->getMessage());
            }
        };

        User::saved($flushUserCache);
        User::deleted($flushUserCache);
        Role::saved($flushUserCache);
        Role::deleted($flushUserCache);
        Page::saved($flushUserCache);
        Page::deleted($flushUserCache);

        $flushTablesCache = function () {
            try {
                Cache::tags(['pos_tables'])->flush();
            } catch (\Exception $e) {
                Log::warning('Redis flush failed for pos_tables: '.$e->getMessage());
            }
        };

        Table::saved($flushTablesCache);
        Table::deleted($flushTablesCache);
        Order::saved($flushTablesCache);
        Order::deleted($flushTablesCache);
        OrderItem::saved($flushTablesCache);
        OrderItem::deleted($flushTablesCache);

        $flushProductsCache = function () {
            try {
                Cache::tags(['pos_products_and_categories'])->flush();
            } catch (\Exception $e) {
                Log::warning('Redis flush failed for pos_products_and_categories: '.$e->getMessage());
            }
        };

        MenuItem::saved($flushProductsCache);
        MenuItem::deleted($flushProductsCache);
        MenuCategory::saved($flushProductsCache);
        MenuCategory::deleted($flushProductsCache);
        Ingredient::saved($flushProductsCache);
        Ingredient::deleted($flushProductsCache);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
