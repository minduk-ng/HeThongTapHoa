<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->string('reservation_name')->nullable()->after('status');
            $table->string('reservation_phone', 20)->nullable()->after('reservation_name');
            $table->dateTime('reservation_time')->nullable()->after('reservation_phone');
            $table->text('reservation_note')->nullable()->after('reservation_time');
        });
    }

    public function down(): void
    {
        Schema::table('tables', function (Blueprint $table) {
            $table->dropColumn(['reservation_name', 'reservation_phone', 'reservation_time', 'reservation_note']);
        });
    }
};
