<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->date('expiry_date')->nullable()->after('quantity');
            $table->decimal('quantity_remaining', 15, 2)->nullable()->after('expiry_date');
        });

        // Backfill: các phiếu nhập cũ (trước khi có cột) coi toàn bộ quantity là tồn còn lại.
        DB::table('stock_voucher_items')
            ->join('stock_vouchers', 'stock_vouchers.id', '=', 'stock_voucher_items.voucher_id')
            ->where('stock_vouchers.type', 'import')
            ->whereNull('stock_voucher_items.quantity_remaining')
            ->update(['stock_voucher_items.quantity_remaining' => DB::raw('stock_voucher_items.quantity')]);
    }

    public function down(): void
    {
        Schema::table('stock_voucher_items', function (Blueprint $table) {
            $table->dropColumn(['expiry_date', 'quantity_remaining']);
        });
    }
};
