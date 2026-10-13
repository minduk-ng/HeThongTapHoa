<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forecast_model_evaluations', function (Blueprint $table) {
            $table->decimal('mae', 12, 4)->nullable()->change();
            $table->decimal('rmse', 12, 4)->nullable()->change();
            $table->string('status', 30)->default('evaluated')->index();
            $table->text('reason')->nullable();
            $table->json('validation_sums')->nullable();
            $table->json('holdout_metrics')->nullable();
        });

        Schema::table('product_forecasts', function (Blueprint $table) {
            $table->decimal('forecast_quantity', 12, 4)->nullable()->change();
            $table->string('model_key', 50)->nullable()->change();
            $table->string('status', 30)->default('available')->index();
            $table->string('bound_method', 50)->nullable();
            $table->decimal('bound_percentage', 5, 2)->nullable();
        });

        Schema::table('inventory_recommendations', function (Blueprint $table) {
            $table->json('explanation')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_recommendations', function (Blueprint $table) {
            $table->dropColumn('explanation');
        });

        Schema::table('product_forecasts', function (Blueprint $table) {
            $table->dropColumn(['status', 'bound_method', 'bound_percentage']);
            $table->decimal('forecast_quantity', 12, 4)->nullable(false)->change();
            $table->string('model_key', 50)->nullable(false)->change();
        });

        Schema::table('forecast_model_evaluations', function (Blueprint $table) {
            $table->dropColumn(['status', 'reason', 'validation_sums', 'holdout_metrics']);
            $table->decimal('mae', 12, 4)->nullable(false)->change();
            $table->decimal('rmse', 12, 4)->nullable(false)->change();
        });
    }
};
