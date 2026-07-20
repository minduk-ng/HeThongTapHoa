<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'has_additional_items')) {
                $table->boolean('has_additional_items')->default(false)->after('status');
            }
            if (!Schema::hasColumn('orders', 'vat_amount')) {
                $table->decimal('vat_amount', 15, 2)->default(0)->after('subtotal');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'has_additional_items')) {
                $table->dropColumn('has_additional_items');
            }
            if (Schema::hasColumn('orders', 'vat_amount')) {
                $table->dropColumn('vat_amount');
            }
        });
    }
};
