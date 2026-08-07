<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->index('issued_at', 'invoices_issued_at_index');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->index('created_at', 'orders_created_at_index');
            $table->index('updated_at', 'orders_updated_at_index');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->index('cancelled_at', 'order_items_cancelled_at_index');
        });

        Schema::table('deposits', function (Blueprint $table) {
            $table->index('created_at', 'deposits_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('invoices_issued_at_index');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_created_at_index');
            $table->dropIndex('orders_updated_at_index');
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex('order_items_cancelled_at_index');
        });
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropIndex('deposits_created_at_index');
        });
    }
};
