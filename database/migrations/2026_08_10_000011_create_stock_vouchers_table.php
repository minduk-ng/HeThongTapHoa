<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('voucher_code', 50)->unique();
            $table->enum('type', ['import', 'export']);
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->dateTime('transacted_at');
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('stock_voucher_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voucher_id')->constrained('stock_vouchers')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->restrictOnDelete();
            $table->decimal('quantity', 15, 2);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_voucher_items');
        Schema::dropIfExists('stock_vouchers');
    }
};
