<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->enum('type', ['import', 'export', 'adjustment'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->enum('type', ['import', 'export'])->change();
        });
    }
};
