<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Backfill task-6: phiếu nhập is_paid=true từ code cũ không có dòng phân bổ nào
// (storePayment cũ chỉ set flag). Tạo 1 SupplierPayment + 1 allocation = full total
// cho mỗi phiếu để outstandingAmount() về 0, tránh nợ "sống lại" thành phải trả 2 lần.
// Idempotent: chỉ chạm phiếu chưa có allocation nào (chạy lại = no-op).
return new class extends Migration
{
    public const NOTE = 'Backfill cong no da tra (task-6)';

    public function up(): void
    {
        $voucherIds = DB::table('stock_vouchers as v')
            ->where('v.type', 'import')
            ->where('v.is_paid', true)
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('supplier_payment_allocations as a')
                    ->whereColumn('a.voucher_id', 'v.id');
            })
            ->pluck('v.id');

        foreach ($voucherIds as $id) {
            $voucher = DB::table('stock_vouchers')->where('id', $id)->first();
            if (! $voucher || ! $voucher->supplier_id) {
                continue;
            }

            $total = round((float) DB::table('stock_voucher_items')
                ->where('voucher_id', $id)
                ->sum(DB::raw('quantity * unit_price')), 2);

            $paidAt = $voucher->transacted_at ?? now()->toDateTimeString();
            $paymentId = DB::table('supplier_payments')->insertGetId([
                'supplier_id' => $voucher->supplier_id,
                'amount' => $total,
                'paid_at' => $paidAt,
                'note' => self::NOTE,
                'created_by' => null,
                'is_migration_backfill' => true,
                'created_at' => $paidAt,
                'updated_at' => $paidAt,
            ]);

            DB::table('supplier_payment_allocations')->insert([
                'payment_id' => $paymentId,
                'voucher_id' => $id,
                'amount' => $total,
                'created_at' => $paidAt,
                'updated_at' => $paidAt,
            ]);
        }
    }

    public function down(): void
    {
        // Chỉ xoá đúng các header backfill (allocations cascade theo payment).
        DB::table('supplier_payments')->where('is_migration_backfill', true)->where('note', self::NOTE)->delete();
    }
};
