<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forecast_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('synthetic_dataset_id')->nullable()->constrained('synthetic_datasets')->nullOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained('menu_items')->nullOnDelete();
            $table->string('submission_token', 64);
            $table->string('request_hash', 64);
            $table->string('dataset_label', 150);
            $table->string('item_label', 150);
            $table->date('start_date');
            $table->date('end_date');
            $table->date('cutoff');
            $table->json('input_snapshot');
            $table->json('result')->nullable();
            $table->string('status', 20)->default('queued')->index();
            $table->text('error_message')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['created_by', 'submission_token'], 'forecast_checks_user_token_unique');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forecast_checks');
    }
};
