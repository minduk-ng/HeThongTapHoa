<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->string('purchase_unit', 20)->nullable()->after('unit');
            $table->decimal('unit_conversion', 12, 4)->default(1)->after('purchase_unit');
        });
    }

    public function down(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->dropColumn(['purchase_unit', 'unit_conversion']);
        });
    }
};
