<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->after('type')->constrained('suppliers')->nullOnDelete();
            $table->boolean('is_paid')->default(false)->after('supplier_id');
        });
    }

    public function down(): void
    {
        Schema::table('stock_vouchers', function (Blueprint $table) {
            $table->dropForeign(['supplier_id']);
            $table->dropColumn(['supplier_id', 'is_paid']);
        });
    }
};
