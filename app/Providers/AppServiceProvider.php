<?php

namespace App\Providers;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
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
                \Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("Redis flush failed for user_inertia: " . $e->getMessage());
            }
        };

        \App\Models\User::saved($flushUserCache);
        \App\Models\User::deleted($flushUserCache);
        \App\Models\Role::saved($flushUserCache);
        \App\Models\Role::deleted($flushUserCache);
        \App\Models\Page::saved($flushUserCache);
        \App\Models\Page::deleted($flushUserCache);

        $flushTablesCache = function () {
            try {
                \Illuminate\Support\Facades\Cache::tags(['pos_tables'])->flush();
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("Redis flush failed for pos_tables: " . $e->getMessage());
            }
        };

        \App\Models\Table::saved($flushTablesCache);
        \App\Models\Table::deleted($flushTablesCache);
        \App\Models\Order::saved($flushTablesCache);
        \App\Models\Order::deleted($flushTablesCache);
        \App\Models\OrderItem::saved($flushTablesCache);
        \App\Models\OrderItem::deleted($flushTablesCache);

        $flushProductsCache = function () {
            try {
                \Illuminate\Support\Facades\Cache::tags(['pos_products_and_categories'])->flush();
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("Redis flush failed for pos_products_and_categories: " . $e->getMessage());
            }
        };

        \App\Models\MenuItem::saved($flushProductsCache);
        \App\Models\MenuItem::deleted($flushProductsCache);
        \App\Models\MenuCategory::saved($flushProductsCache);
        \App\Models\MenuCategory::deleted($flushProductsCache);
        \App\Models\Ingredient::saved($flushProductsCache);
        \App\Models\Ingredient::deleted($flushProductsCache);
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
