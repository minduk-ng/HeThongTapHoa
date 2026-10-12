<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('synthetic_datasets', function (Blueprint $table) {
            $table->date('start_date')->nullable()->after('seed');
            $table->date('end_date')->nullable()->after('start_date');
            $table->string('status', 20)->default('completed')->after('end_date')->index();
            $table->text('error_message')->nullable()->after('status');
        });

        Schema::create('synthetic_observations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('synthetic_dataset_id')->constrained('synthetic_datasets')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->cascadeOnDelete();
            $table->date('date')->index();
            $table->decimal('latent_demand', 16, 6)->default(0);
            $table->decimal('observed_sales', 16, 6)->nullable();
            $table->boolean('is_open')->default(true);
            $table->boolean('is_missing')->default(false);
            $table->boolean('is_stockout')->default(false);
            $table->json('signals')->nullable();
            $table->timestamps();

            $table->unique(
                ['synthetic_dataset_id', 'menu_item_id', 'date'],
                'synthetic_obs_dataset_item_date_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('synthetic_observations');

        Schema::table('synthetic_datasets', function (Blueprint $table) {
            $table->dropColumn(['start_date', 'end_date', 'status', 'error_message']);
        });
    }
};
