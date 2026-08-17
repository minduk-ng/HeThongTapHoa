<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->decimal('stock_quantity', 12, 2)->default(0)->change();
            $table->decimal('min_stock_alert', 12, 2)->default(50)->change();
        });

        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->decimal('quantity', 12, 2)->change();
            $table->decimal('unit_price', 12, 2)->nullable()->change();
            $table->decimal('quantity_remaining', 12, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->decimal('stock_quantity', 10, 2)->default(0)->change();
            $table->decimal('min_stock_alert', 10, 2)->default(50)->change();
        });

        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->decimal('quantity', 15, 2)->change();
            $table->decimal('unit_price', 15, 2)->nullable()->change();
            $table->decimal('quantity_remaining', 15, 2)->nullable()->change();
        });
    }
};
