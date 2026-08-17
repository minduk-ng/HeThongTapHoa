<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $map = [
            '/reports/sales-invoices' => 'Bán hàng',
            '/reports/invoice-items' => 'Bán hàng',
            '/reports/product-details' => 'Bán hàng',
            '/reports/profit' => 'Tài chính',
            '/reports/payments' => 'Tài chính',
            '/reports/cancelled' => 'Vận hành',
            '/reports/reservations' => 'Vận hành',
            '/reports/shifts' => 'Vận hành',
            '/reports/inventory-value' => 'Kho',
            '/reports/low-stock' => 'Kho',
            '/reports/expiring' => 'Kho',
            '/reports/stock-movement' => 'Kho',
            '/reports/consumption' => 'Kho',
        ];

        foreach ($map as $path => $subGroup) {
            DB::table('pages')
                ->where('route_path', $path)
                ->update(['sub_group' => $subGroup]);
        }
    }

    public function down(): void
    {
        $legacy = [
            '/reports/sales-invoices' => 'Doanh thu',
            '/reports/invoice-items' => 'Doanh thu',
            '/reports/product-details' => 'Doanh thu',
            '/reports/profit' => 'Doanh thu',
            '/reports/payments' => 'Doanh thu',
            '/reports/cancelled' => 'Hoạt động',
            '/reports/reservations' => 'Hoạt động',
            '/reports/shifts' => 'Hoạt động',
            '/reports/inventory-value' => 'Hoạt động',
            '/reports/low-stock' => 'Hoạt động',
            '/reports/expiring' => 'Hoạt động',
            '/reports/stock-movement' => 'Hoạt động',
            '/reports/consumption' => 'Hoạt động',
        ];

        foreach ($legacy as $path => $subGroup) {
            DB::table('pages')
                ->where('route_path', $path)
                ->update(['sub_group' => $subGroup]);
        }
    }
};
