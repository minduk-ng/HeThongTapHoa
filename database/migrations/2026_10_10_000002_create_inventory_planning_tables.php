<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredient_supplier_policies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->boolean('is_primary')->default(false)->index();
            $table->unsignedInteger('lead_days')->default(1);
            $table->decimal('moq', 12, 4)->default(0);
            $table->decimal('order_multiple', 12, 4)->default(1);
            $table->decimal('pack_size', 12, 4)->default(1);
            $table->decimal('ordering_cost', 15, 2)->default(0);
            $table->decimal('annual_holding_cost', 15, 2)->default(0);
            $table->decimal('unit_cost', 15, 2)->nullable();
            $table->decimal('service_factor', 6, 4)->default(1.65);
            $table->string('policy_hash', 64)->nullable();
            $table->timestamps();

            $table->unique(
                ['ingredient_id', 'supplier_id'],
                'ing_supp_policies_ing_supp_unique'
            );
        });

        Schema::create('inventory_recommendations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('forecast_run_id')->constrained('forecast_runs')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->decimal('demand_quantity', 12, 4);
            $table->decimal('stock_quantity', 12, 4);
            $table->decimal('reserved_quantity', 12, 4)->default(0);
            $table->decimal('safety_stock', 12, 4);
            $table->decimal('reorder_point', 12, 4);
            $table->decimal('raw_quantity', 12, 4)->default(0);
            $table->decimal('after_moq_quantity', 12, 4)->default(0);
            $table->decimal('final_quantity', 12, 4);
            $table->decimal('suggested_quantity', 12, 4);
            $table->string('method', 32)->default('eoq');
            $table->string('unit', 20);
            $table->string('purchase_unit', 20);
            $table->string('bom_hash', 64);
            $table->string('policy_hash', 64)->nullable();
            $table->timestamp('stock_snapshot_at')->nullable();
            $table->decimal('stock_snapshot_quantity', 12, 4)->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(
                ['forecast_run_id', 'ingredient_id'],
                'inv_recommendations_run_ingredient_unique'
            );
        });

        Schema::create('procurement_plans', function (Blueprint $table) {
            $table->id();
            $table->string('plan_code', 50)->unique();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignId('forecast_run_id')->nullable()->constrained('forecast_runs')->nullOnDelete();
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('procurement_plan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('procurement_plan_id')->constrained('procurement_plans')->cascadeOnDelete();
            $table->foreignId('inventory_recommendation_id')->constrained('inventory_recommendations')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->decimal('suggested_quantity', 12, 4);
            $table->decimal('final_quantity', 12, 4);
            $table->string('unit', 20);
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('total_price', 15, 2)->default(0);
            $table->string('adjustment_reason', 255)->nullable();
            $table->foreignId('stock_voucher_item_id')->nullable()->constrained('stock_voucher_items')->nullOnDelete();
            $table->string('status', 20)->default('pending')->index();
            $table->timestamps();

            $table->unique(
                ['procurement_plan_id', 'inventory_recommendation_id'],
                'plan_items_plan_rec_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('procurement_plan_items');
        Schema::dropIfExists('procurement_plans');
        Schema::dropIfExists('inventory_recommendations');
        Schema::dropIfExists('ingredient_supplier_policies');
    }
};
