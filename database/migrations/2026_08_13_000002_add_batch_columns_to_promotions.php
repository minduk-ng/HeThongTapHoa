<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->string('code_prefix', 30)->nullable()->after('code');
            $table->integer('code_quantity')->nullable()->after('code_prefix');
            $table->boolean('code_random')->default(false)->after('code_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['code_prefix', 'code_quantity', 'code_random']);
        });
    }
};
