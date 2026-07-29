<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add invoice_id to orders
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('invoice_id')->nullable()->after('status');
            $table->index('invoice_id', 'orders_invoice_id_index');
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });

        // 2. Migrate data: copy invoices.order_id → orders.invoice_id
        $invoices = DB::table('invoices')->whereNotNull('order_id')->get(['id', 'order_id']);

        foreach ($invoices as $invoice) {
            DB::table('orders')->where('id', $invoice->order_id)->update(['invoice_id' => $invoice->id]);
        }

        // 3. Drop order_id from invoices
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['order_id']);
            $table->dropUnique(['order_id']);
            $table->dropColumn('order_id');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->unsignedBigInteger('order_id')->nullable()->after('id');
        });

        // Restore data
        $orders = DB::table('orders')->whereNotNull('invoice_id')->get(['id', 'invoice_id']);

        foreach ($orders as $order) {
            DB::table('invoices')->where('id', $order->invoice_id)->update(['order_id' => $order->id]);
        }

        Schema::table('invoices', function (Blueprint $table) {
            $table->unique('order_id');
            $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropIndex('orders_invoice_id_index');
            $table->dropColumn('invoice_id');
        });
    }
};
