<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forecast_experiments', function (Blueprint $table) {
            $table->id();
            $table->json('configuration')->nullable();
            $table->string('status', 20)->default('queued')->index();
            $table->text('error_message')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->foreignId('experiment_id')->nullable()->after('synthetic_dataset_id')->constrained('forecast_experiments')->nullOnDelete();
            $table->string('cell_key', 100)->nullable()->after('experiment_id')->index();
        });

        Schema::create('forecast_evaluation_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('forecast_run_id')->constrained('forecast_runs')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
            $table->string('stage', 20)->index(); // validation, holdout
            $table->date('origin_date');
            $table->date('target_date')->index();
            $table->string('model_key', 50)->index();
            $table->decimal('observed_actual', 16, 6)->nullable();
            $table->decimal('predicted', 16, 6)->nullable();
            $table->string('status', 20)->default('evaluated'); // evaluated, skipped, failed
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->unique(
                ['forecast_run_id', 'menu_item_id', 'stage', 'origin_date', 'target_date', 'model_key'],
                'eval_points_run_item_stage_origin_target_model_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forecast_evaluation_points');

        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->dropForeign(['experiment_id']);
            $table->dropColumn(['experiment_id', 'cell_key']);
        });

        Schema::dropIfExists('forecast_experiments');
    }
};
