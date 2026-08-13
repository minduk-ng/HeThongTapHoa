<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotion_conditions', function (Blueprint $table) {
            $table->enum('cond_type', ['min_order_value', 'min_quantity', 'specific_product', 'specific_category'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('promotion_conditions', function (Blueprint $table) {
            $table->enum('cond_type', ['min_order_value', 'min_quantity', 'specific_product'])->change();
        });
    }
};
