<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->nullable()->unique();
            $table->string('name', 100)->unique();
            $table->string('unit', 20);
            $table->decimal('stock_quantity', 10, 2)->default(0);
            $table->decimal('min_stock_alert', 10, 2)->default(50);
            $table->decimal('cost_price', 12, 2)->default(0);
            $table->date('expiry_date')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredients');
    }
};
