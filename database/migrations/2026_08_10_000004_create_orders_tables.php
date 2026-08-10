<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code', 50)->unique();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->boolean('has_additional_items')->default(false);
            $table->string('status', 50)->default('pending');
            $table->string('reservation_name', 100)->nullable();
            $table->string('reservation_phone', 20)->nullable();
            $table->dateTime('reservation_time')->nullable();
            $table->text('reservation_note')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->index('created_at', 'orders_created_at_index');
            $table->index('updated_at', 'orders_updated_at_index');
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->restrictOnDelete();
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('subtotal', 15, 2);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->string('status', 50)->default('pending');
            $table->string('note', 255)->nullable();
            $table->string('cancellation_reason')->nullable();
            $table->foreignId('cancelled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('served_at')->nullable();
            $table->timestamps();
            $table->index('cancelled_at', 'order_items_cancelled_at_index');
        });

        Schema::create('order_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('action', 30);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['order_id', 'created_at'], 'idx_order_timeline');
            $table->index('action', 'idx_action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_activities');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
