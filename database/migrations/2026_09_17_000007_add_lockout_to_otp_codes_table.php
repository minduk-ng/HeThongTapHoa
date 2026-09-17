<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('otp_codes', function (Blueprint $table) {
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('locked_at')->nullable();
            $table->index(['email', 'type', 'expires_at'], 'otp_codes_email_type_expires_at_index');
        });

        // ponytail: bcrypt hashes (60 chars) don't fit code VARCHAR(6); widen without doctrine/dbal.
        // SQLite ignores VARCHAR width, so only widen where it is enforced.
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE `otp_codes` MODIFY `code` VARCHAR(255) NOT NULL');
        } elseif (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE "otp_codes" ALTER COLUMN "code" TYPE VARCHAR(255)');
        }
    }

    public function down(): void
    {
        Schema::table('otp_codes', function (Blueprint $table) {
            $table->dropIndex('otp_codes_email_type_expires_at_index');
            $table->dropColumn(['attempts', 'locked_at']);
        });
    }
};
