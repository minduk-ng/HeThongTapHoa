<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_promotion_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->date('stat_date');
            $table->integer('order_count')->default(0);
            $table->decimal('revenue', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->integer('unique_orders')->default(0);
            $table->timestamps();
            $table->unique(['promotion_id', 'stat_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_promotion_stats');
    }
};
