<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('action', 30);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['order_id', 'created_at'], 'idx_order_timeline');
            $table->index('action', 'idx_action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_activities');
    }
};
