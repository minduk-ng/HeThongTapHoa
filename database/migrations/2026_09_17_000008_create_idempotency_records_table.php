<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('idempotency_records', function (Blueprint $table) {
            $table->id();
            $table->string('action', 50);
            $table->string('idempotency_key', 100);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('resource_fingerprint', 64)->nullable();
            $table->string('status', 20); // processing, succeeded, failed
            $table->smallInteger('response_code')->nullable();
            $table->mediumText('response_body')->nullable();
            $table->timestamps();

            $table->unique(['action', 'idempotency_key']);
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('idempotency_records');
    }
};
