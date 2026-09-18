<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('idempotency_records', function (Blueprint $table) {
            $table->string('resource_type')->nullable()->after('resource_fingerprint');
            $table->unsignedBigInteger('resource_id')->nullable()->after('resource_type');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('session_version')->default(0)->after('remember_token');
        });
        Schema::table('money_ledger_entries', function (Blueprint $table) {
            $table->string('reference')->nullable()->after('supplier_id');
            $table->string('reason')->nullable()->after('reference');
            $table->dateTime('occurred_at')->nullable()->after('reason')->index();
        });
        DB::table('money_ledger_entries')->whereNull('occurred_at')->update(['occurred_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('money_ledger_entries', function (Blueprint $table) {
            $table->dropIndex(['occurred_at']);
            $table->dropColumn(['reference', 'reason', 'occurred_at']);
        });
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('session_version'));
        Schema::table('idempotency_records', fn (Blueprint $table) => $table->dropColumn(['resource_type', 'resource_id']));
    }
};
