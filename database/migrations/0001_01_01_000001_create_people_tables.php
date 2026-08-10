<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('employee_code', 20)->unique();
            $table->string('full_name', 100);
            $table->string('position', 50)->nullable();
            $table->decimal('base_salary', 15, 2)->default(0);
            $table->date('hire_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('customer_code', 20)->unique()->nullable();
            $table->string('full_name', 100);
            $table->string('phone', 15)->nullable();
            $table->integer('loyalty_points')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
        Schema::dropIfExists('employees');
    }
};
