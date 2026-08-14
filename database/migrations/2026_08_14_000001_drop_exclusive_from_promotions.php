<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('promotions')->where('exclusive', true)->update(['stackable' => false]);
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn('exclusive');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->boolean('exclusive')->default(false)->after('stackable');
        });
    }
};
