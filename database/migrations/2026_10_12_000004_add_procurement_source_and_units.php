<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('procurement_plans', function (Blueprint $table) {
            $table->foreignId('synthetic_dataset_id')->nullable()->after('forecast_run_id')->constrained('synthetic_datasets')->cascadeOnDelete();
        });

        Schema::table('procurement_plan_items', function (Blueprint $table) {
            $table->decimal('purchase_quantity', 12, 4)->nullable()->after('final_quantity');
            $table->string('purchase_unit', 30)->nullable()->after('unit');
            $table->decimal('pack_size', 12, 4)->nullable()->after('purchase_unit');
        });
    }

    public function down(): void
    {
        Schema::table('procurement_plan_items', function (Blueprint $table) {
            $table->dropColumn(['purchase_quantity', 'purchase_unit', 'pack_size']);
        });

        Schema::table('procurement_plans', function (Blueprint $table) {
            $table->dropForeign(['synthetic_dataset_id']);
            $table->dropColumn('synthetic_dataset_id');
        });
    }
};
