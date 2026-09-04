<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shift_id')->constrained('shifts')->cascadeOnDelete();
            $table->enum('type', ['expense', 'income']);
            $table->string('category', 30);
            $table->decimal('amount', 15, 2);
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('shift_id', 'idx_cash_movements_shift');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
    }
};
