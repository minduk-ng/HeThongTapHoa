<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Rename promotions cũ -> legacy (giữ FK orders nguyên vẹn tạm thời)
        Schema::rename('promotions', 'legacy_promotions');

        // 1b. Giải phóng tên index promotions_code_unique (SQLite: index name global trong DB,
        // rename giữ nguyên tên index trên legacy_promotions -> collide với unique mới)
        Schema::table('legacy_promotions', function (Blueprint $table) {
            $table->dropUnique('promotions_code_unique');
        });

        // 2. Tạo promotions v2
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['promotion', 'coupon', 'voucher'])->default('promotion');
            $table->string('code', 50)->nullable()->unique();
            $table->dateTime('start_date')->nullable();
            $table->dateTime('end_date')->nullable();
            $table->boolean('status')->default(true);
            $table->integer('max_usage')->nullable();
            $table->integer('used_count')->default(0);
            $table->boolean('exclusive')->default(false);
            $table->boolean('stackable')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // 3. Tạo promotion_conditions
        Schema::create('promotion_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('cond_type', ['min_order_value', 'min_quantity', 'specific_product']);
            $table->string('cond_value');
            $table->timestamps();
        });

        // 4. Tạo promotion_actions
        Schema::create('promotion_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('action_type', ['discount_percent', 'discount_amount', 'free_product']);
            $table->decimal('action_value', 15, 2);
            $table->decimal('max_discount_amount', 15, 2)->nullable();
            $table->timestamps();
        });

        // 5. Tạo order_promotions
        Schema::create('order_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('code_used')->nullable();
            $table->decimal('discount_applied', 15, 2);
            $table->timestamps();
        });

        // 6. Drop FK + column orders.promotion_id (an toàn: toàn null)
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['promotion_id']);
            $table->dropColumn('promotion_id');
        });

        // 6.5. Drop FK invoice_promotions.promotion_id -> promotions (empty table,
        // old 1-table schema superseded by order_promotions; blocks legacy drop on MySQL)
        Schema::table('invoice_promotions', function (Blueprint $table) {
            $table->dropForeign(['promotion_id']);
        });

        // 7. Drop legacy
        Schema::dropIfExists('legacy_promotions');
    }

    public function down(): void
    {
        // Bỏ FK v2 (promotion_actions/conditions/order_promotions đang reference promotions v2)
        Schema::dropIfExists('order_promotions');
        Schema::dropIfExists('promotion_actions');
        Schema::dropIfExists('promotion_conditions');
        // v2 promotions chưa có dữ liệu (empty) -> drop rồi tạo lại schema cũ
        Schema::dropIfExists('promotions');
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->enum('discount_type', ['percentage', 'fixed_amount']);
            $table->decimal('discount_value', 15, 2);
            $table->string('target_type', 20)->default('order');
            $table->unsignedBigInteger('target_value')->nullable();
            $table->decimal('min_order_amount', 15, 2)->default(0);
            $table->decimal('max_discount_amount', 15, 2)->nullable();
            $table->integer('max_uses')->nullable();
            $table->integer('used_count')->default(0);
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
        // legacy đã bị drop trong up() -> không còn gì để dọn
        Schema::dropIfExists('legacy_promotions');

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('promotion_id')->nullable();
            $table->foreign('promotion_id')->references('id')->on('promotions')->nullOnDelete();
        });
        Schema::table('invoice_promotions', function (Blueprint $table) {
            $table->foreign('promotion_id')->references('id')->on('promotions')->nullOnDelete();
        });
    }
};
