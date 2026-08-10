<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_code', 50)->unique();
            $table->string('table_name')->nullable();
            // ponytail: plain string (old sqlite schema lost the enum CHECK via ALTER rebuilds;
            // CheckoutService writes 'mixed' for split payments)
            $table->string('payment_method');
            $table->decimal('amount_received', 15, 2)->default(0);
            $table->decimal('change_amount', 15, 2)->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->decimal('deposit_amount', 12, 2)->default(0);
            $table->decimal('subtotal_amount', 15, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->string('external_no')->nullable();
            $table->string('external_ref')->nullable();
            $table->dateTime('issued_at')->useCurrent();
            $table->timestamps();
            $table->index('issued_at', 'invoices_issued_at_index');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('invoice_id')->nullable()->after('status');
            $table->index('invoice_id', 'orders_invoice_id_index');
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropIndex('orders_invoice_id_index');
            $table->dropColumn('invoice_id');
        });
        Schema::dropIfExists('invoices');
    }
};
