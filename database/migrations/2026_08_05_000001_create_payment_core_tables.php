<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->enum('method', ['cash', 'bank_transfer', 'e_wallet']);
            $table->decimal('amount', 15, 2);
            $table->string('reference')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_payments_invoice');
        });

        Schema::create('invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->unsignedBigInteger('order_item_id')->nullable();
            $table->unsignedBigInteger('menu_item_id')->nullable();
            $table->string('name_snapshot', 255);
            $table->integer('quantity');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('subtotal', 15, 2);
            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_invoice_lines_invoice');
            $table->index(['menu_item_id'], 'idx_invoice_lines_menu_item');
        });

        Schema::create('invoice_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->string('discount_type', 30);
            $table->decimal('discount_value', 15, 2);
            $table->unsignedSmallInteger('stack_order')->default(0);
            $table->decimal('amount', 15, 2)->default(0);
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_invoice_promotions_invoice');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->decimal('subtotal_amount', 15, 2)->default(0)->after('deposit_amount');
            $table->decimal('vat_amount', 15, 2)->default(0)->after('subtotal_amount');
            $table->decimal('discount_amount', 15, 2)->default(0)->after('vat_amount');
            $table->string('external_no')->nullable()->after('discount_amount');
            $table->string('external_ref')->nullable()->after('external_no');
        });

        Schema::table('deposits', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->after('resolved_at')->constrained('payments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropForeign(['payment_id']);
            $table->dropColumn('payment_id');
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['subtotal_amount', 'vat_amount', 'discount_amount', 'external_no', 'external_ref']);
        });
        Schema::dropIfExists('invoice_promotions');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('payments');
    }
};
