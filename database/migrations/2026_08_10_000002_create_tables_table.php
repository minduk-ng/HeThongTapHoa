<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->string('table_number', 10)->unique();
            $table->integer('capacity')->default(4);
            $table->string('area', 50)->nullable();
            // ponytail: plain string (old sqlite schema lost the enum CHECK via ALTER rebuilds;
            // app/tests use values like 'empty')
            $table->string('status')->default('available');
            $table->string('reservation_name')->nullable();
            $table->string('reservation_phone', 20)->nullable();
            $table->dateTime('reservation_time')->nullable();
            $table->text('reservation_note')->nullable();
            $table->foreignId('merged_into_table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tables');
    }
};
