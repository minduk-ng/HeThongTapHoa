<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('synthetic_dataset_id')
                ->nullable()
                ->after('customer_id')
                ->constrained('synthetic_datasets')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['synthetic_dataset_id']);
            $table->dropColumn('synthetic_dataset_id');
        });
    }
};
