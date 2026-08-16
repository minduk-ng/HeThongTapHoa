<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotion_codes', function (Blueprint $table) {
            $table->enum('status', ['unused', 'used', 'disabled'])->default('unused')->change();
        });
    }

    public function down(): void
    {
        Schema::table('promotion_codes', function (Blueprint $table) {
            $table->enum('status', ['unused', 'used'])->default('unused')->change();
        });
    }
};
