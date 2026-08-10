<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ponytail: indexes are now created inside the base table migrations (files 7/8/10).
        // Kept at its original path because tests/Feature/ReportPerformanceIndexesTest.php
        // requires it and calls up()/down() directly. All blocks are guarded so a fresh
        // migrate (where this file sorts before the base tables) is a safe no-op.
        $this->guard(fn () => $this->addIndex('invoices', 'issued_at', 'invoices_issued_at_index'));
        $this->guard(fn () => $this->addIndex('orders', 'created_at', 'orders_created_at_index'));
        $this->guard(fn () => $this->addIndex('orders', 'updated_at', 'orders_updated_at_index'));
        $this->guard(fn () => $this->addIndex('order_items', 'cancelled_at', 'order_items_cancelled_at_index'));
        $this->guard(fn () => $this->addIndex('deposits', 'created_at', 'deposits_created_at_index'));
    }

    public function down(): void
    {
        if (Schema::hasTable('invoices') && Schema::hasIndex('invoices', 'invoices_issued_at_index')) {
            Schema::table('invoices', fn (Blueprint $table) => $table->dropIndex('invoices_issued_at_index'));
        }
        if (Schema::hasTable('orders') && Schema::hasIndex('orders', 'orders_created_at_index')) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropIndex('orders_created_at_index'));
        }
        if (Schema::hasTable('orders') && Schema::hasIndex('orders', 'orders_updated_at_index')) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropIndex('orders_updated_at_index'));
        }
        if (Schema::hasTable('order_items') && Schema::hasIndex('order_items', 'order_items_cancelled_at_index')) {
            Schema::table('order_items', fn (Blueprint $table) => $table->dropIndex('order_items_cancelled_at_index'));
        }
        if (Schema::hasTable('deposits') && Schema::hasIndex('deposits', 'deposits_created_at_index')) {
            Schema::table('deposits', fn (Blueprint $table) => $table->dropIndex('deposits_created_at_index'));
        }
    }

    private function addIndex(string $table, string $column, string $name): void
    {
        if (Schema::hasTable($table) && ! Schema::hasIndex($table, $name)) {
            Schema::table($table, fn (Blueprint $table) => $table->index($column, $name));
        }
    }

    private function guard(callable $fn): void
    {
        try {
            $fn();
        } catch (Throwable) {
            // Table/column may not exist yet; safe to skip.
        }
    }
};
