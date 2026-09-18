<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('supplier_payments', 'is_migration_backfill')) {
            Schema::table('supplier_payments', fn (Blueprint $table) => $table->boolean('is_migration_backfill')->default(false));
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('supplier_payments', 'is_migration_backfill')) {
            Schema::table('supplier_payments', fn (Blueprint $table) => $table->dropColumn('is_migration_backfill'));
        }
    }
};
