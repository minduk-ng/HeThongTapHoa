<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deposits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->decimal('amount', 12, 0);
            $table->string('method', 20); // cash | bank_transfer
            $table->string('status', 20)->default('held'); // held | applied | refunded | forfeited
            $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('resolved_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('reservation_name', 100)->nullable()->after('note');
            $table->string('reservation_phone', 20)->nullable()->after('reservation_name');
            $table->dateTime('reservation_time')->nullable()->after('reservation_phone');
            $table->text('reservation_note')->nullable()->after('reservation_time');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->decimal('deposit_amount', 12, 0)->default(0)->after('total_amount');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn('deposit_amount');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['reservation_name', 'reservation_phone', 'reservation_time', 'reservation_note']);
        });
        Schema::dropIfExists('deposits');
    }
};