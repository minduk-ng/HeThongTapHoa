<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Update ingredients table with code, min_stock_alert, cost_price
        Schema::table('ingredients', function (Blueprint $table) {
            if (!Schema::hasColumn('ingredients', 'code')) {
                $table->string('code', 50)->nullable()->unique()->after('id');
            }
            if (!Schema::hasColumn('ingredients', 'min_stock_alert')) {
                $table->decimal('min_stock_alert', 10, 2)->default(50)->after('stock_quantity');
            }
            if (!Schema::hasColumn('ingredients', 'cost_price')) {
                $table->decimal('cost_price', 12, 2)->default(0)->after('min_stock_alert');
            }
        });

        // Create product_recipes table
        if (!Schema::hasTable('product_recipes')) {
            Schema::create('product_recipes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
                $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
                $table->decimal('amount', 10, 2);
                $table->string('unit', 20);
                $table->timestamps();

                $table->unique(['menu_item_id', 'ingredient_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('product_recipes');

        Schema::table('ingredients', function (Blueprint $table) {
            if (Schema::hasColumn('ingredients', 'code')) {
                $table->dropColumn('code');
            }
            if (Schema::hasColumn('ingredients', 'min_stock_alert')) {
                $table->dropColumn('min_stock_alert');
            }
            if (Schema::hasColumn('ingredients', 'cost_price')) {
                $table->dropColumn('cost_price');
            }
        });
    }
};
