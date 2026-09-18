<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deposits', function (Blueprint $table) {
            $table->string('reference', 255)->nullable()->after('method');
            $table->boolean('bank_verified')->default(false)->after('reference');
            $table->foreignId('verified_by_user_id')->nullable()->after('resolved_by_user_id')->constrained('users')->nullOnDelete();
            $table->dateTime('verified_at')->nullable()->after('verified_by_user_id');
            $table->foreignId('shift_id')->nullable()->after('verified_at')->constrained('shifts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shift_id');
            $table->dropConstrainedForeignId('verified_by_user_id');
            $table->dropColumn(['verified_at', 'bank_verified', 'reference']);
        });
    }
};
