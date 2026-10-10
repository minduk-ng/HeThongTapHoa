<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('synthetic_datasets', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->text('description')->nullable();
            $table->integer('seed');
            $table->json('configuration');
            $table->string('configuration_hash', 64);
            $table->string('generator_version', 32);
            $table->string('dataset_hash', 64);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('forecast_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('synthetic_dataset_id')->nullable()->constrained('synthetic_datasets')->cascadeOnDelete();
            $table->string('kind', 24); // aggregate, evaluate, forecast
            $table->unsignedSmallInteger('horizon_days');
            $table->timestamp('data_cutoff');
            $table->string('status', 20)->index();
            $table->json('configuration')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->boolean('is_active')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('daily_product_demands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('synthetic_dataset_id')->nullable()->constrained('synthetic_datasets')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
            $table->date('demand_date')->index();
            $table->decimal('quantity', 12, 4)->default(0);
            $table->decimal('refunded_quantity', 12, 4)->default(0);
            $table->unsignedInteger('order_count')->default(0);
            $table->json('signals')->nullable();
            $table->timestamps();

            $table->unique(
                ['synthetic_dataset_id', 'menu_item_id', 'demand_date'],
                'daily_demands_source_item_date_unique'
            );
        });

        Schema::create('forecast_model_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('forecast_run_id')->constrained('forecast_runs')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
            $table->string('model_key', 50);
            $table->json('parameters')->nullable();
            $table->decimal('mae', 12, 4);
            $table->decimal('rmse', 12, 4);
            $table->decimal('wape', 8, 4)->nullable();
            $table->unsignedSmallInteger('origins_evaluated')->default(0);
            $table->boolean('is_selected')->default(false)->index();
            $table->text('selection_notes')->nullable();
            $table->json('metrics')->nullable();
            $table->timestamps();

            $table->unique(
                ['forecast_run_id', 'menu_item_id', 'model_key'],
                'forecast_evals_run_item_model_unique'
            );
        });

        Schema::create('product_forecasts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('forecast_run_id')->constrained('forecast_runs')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
            $table->date('forecast_date')->index();
            $table->decimal('forecast_quantity', 12, 4);
            $table->decimal('lower_bound', 12, 4)->nullable();
            $table->decimal('upper_bound', 12, 4)->nullable();
            $table->string('model_key', 50);
            $table->json('parameters')->nullable();
            $table->timestamp('data_cutoff')->nullable();
            $table->string('data_quality', 30)->default('sufficient');
            $table->json('metrics')->nullable();
            $table->timestamps();

            $table->unique(
                ['forecast_run_id', 'menu_item_id', 'forecast_date'],
                'product_forecasts_run_item_date_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_forecasts');
        Schema::dropIfExists('forecast_model_evaluations');
        Schema::dropIfExists('daily_product_demands');
        Schema::dropIfExists('forecast_runs');
        Schema::dropIfExists('synthetic_datasets');
    }
};
