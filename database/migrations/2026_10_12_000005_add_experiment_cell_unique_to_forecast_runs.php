<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->unique(['experiment_id', 'cell_key'], 'forecast_runs_experiment_cell_unique');
        });
    }

    public function down(): void
    {
        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->dropUnique('forecast_runs_experiment_cell_unique');
        });
    }
};
