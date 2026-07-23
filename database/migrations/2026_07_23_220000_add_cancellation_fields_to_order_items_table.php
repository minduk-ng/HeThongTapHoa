<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->string('status')->default('pending')->after('unit_price');
            $table->string('cancellation_reason')->nullable()->after('note');
            $table->foreignId('cancelled_by_user_id')->nullable()->after('cancellation_reason')->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['cancelled_by_user_id']);
            $table->dropColumn(['status', 'cancellation_reason', 'cancelled_by_user_id', 'cancelled_at']);
        });
    }
};
