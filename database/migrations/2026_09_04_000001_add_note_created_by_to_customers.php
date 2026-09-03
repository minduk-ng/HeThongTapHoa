<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('note', 255)->nullable()->after('phone');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unique('phone');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique(['phone']);
            $table->dropForeign(['created_by']);
            $table->dropColumn(['note', 'created_by']);
        });
    }
};
