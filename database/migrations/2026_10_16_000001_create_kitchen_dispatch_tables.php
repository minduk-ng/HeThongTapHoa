<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_stations', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Seed one general station
        DB::table('kitchen_stations')->insert([
            'code' => 'general',
            'name' => 'General',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::table('menu_categories', function (Blueprint $table) {
            $table->foreignId('kitchen_station_id')->nullable()->constrained('kitchen_stations')->nullOnDelete();
        });

        Schema::create('kitchen_send_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->timestamp('sent_at');
            $table->unsignedInteger('target_minutes')->default(15);
            $table->unsignedInteger('long_wait_minutes')->default(20);
            $table->enum('origin', ['send', 'legacy_item'])->default('send');
            $table->timestamps();
        });

        Schema::create('kitchen_work_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('kitchen_send_batches')->cascadeOnDelete();
            $table->foreignId('station_id')->constrained('kitchen_stations')->restrictOnDelete();
            $table->string('station_name');
            $table->timestamp('deadline_at');
            $table->unsignedInteger('version')->default(1);
            $table->unique(['batch_id', 'station_id']);
            $table->timestamps();
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('kitchen_work_group_id')->nullable()->constrained('kitchen_work_groups')->nullOnDelete();
        });

        Schema::create('kitchen_dispatch_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('target_minutes')->default(15);
            $table->unsignedInteger('long_wait_minutes')->default(20);
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Seed one default settings row
        DB::table('kitchen_dispatch_settings')->insert([
            'target_minutes' => 15,
            'long_wait_minutes' => 20,
            'version' => 1,
            'updated_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('kitchen_work_group_id');
        });

        Schema::table('menu_categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('kitchen_station_id');
        });

        Schema::dropIfExists('kitchen_dispatch_settings');
        Schema::dropIfExists('kitchen_work_groups');
        Schema::dropIfExists('kitchen_send_batches');
        Schema::dropIfExists('kitchen_stations');
    }
};
