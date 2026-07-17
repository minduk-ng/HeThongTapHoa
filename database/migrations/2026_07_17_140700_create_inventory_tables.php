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
            $table->string('name', 100)->unique();
            $table->string('unit', 20);
            $table->decimal('stock_quantity', 10, 2)->default(0);
            $table->date('expiry_date')->nullable();
            $table->timestamps();
        });

        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->enum('type', ['import', 'export', 'disposal']);
            $table->decimal('quantity', 10, 2);
            $table->string('reason', 255)->nullable();
            $table->dateTime('transacted_at')->useCurrent();
            $table->timestamps();
        });

        Schema::create('stock_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->dateTime('checked_at')->useCurrent();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('stock_check_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_check_id')->constrained('stock_checks')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->cascadeOnDelete();
            $table->decimal('system_quantity', 10, 2);
            $table->decimal('actual_quantity', 10, 2);
            $table->decimal('difference', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_check_items');
        Schema::dropIfExists('stock_checks');
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('ingredients');
    }
};
