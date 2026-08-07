# Design — Hiệu năng reports + dashboard (index date + cache DashboardService)

**Date:** 2026-08-07
**Branch:** main (head fdfe265, sau merge controllers)

## Mục tiêu

Giảm rủi ro hiệu năng khi nhiều người dùng truy cập reports/dashboard: (1) thêm index cho cột date thiếu giúp `whereBetween` scan theo range, (2) cache DashboardService (TTL ngắn) để KPI không chạy lại toàn bộ query mỗi lần load. Không đổi logic KPI/report.

## Khảo sát hiện trạng (đã xác minh)

**Đã có caching tốt:**
- POS tables/categories/products: `Cache::tags` (TTL 1800/86400s) + flush khi mutate.
- Sirv token, user permissions: `Cache::remember`.

**RỦI RO CHÍNH — Reports + Dashboard KHÔNG cache:**
- `DashboardService` chạy 5 nhóm query (kpis, liveOperations, chartData, topProducts, lowStock) mỗi lần load.
- 6 report controllers đọc `whereBetween(issued_at/created_at/updated_at/cancelled_at)` + `->get()` toàn bộ rồi aggregate PHP-side: ProductDetails, InvoiceItems, Payments, Profit, Cancelled, SalesInvoice.

**Thiếu index cột date (điểm nghẽn thực):**
- `invoices.issued_at` — KHÔNG có index (report + dashboard chart filter theo nó).
- `orders.created_at` — KHÔNG có index (OrderList, dashboard orders count).
- `order_items.cancelled_at` — KHÔNG có index (CancelledReport).
- `deposits.created_at` — KHÔNG có index (PaymentsReport held, ShiftService).

**Đã có index FK (KHÔNG cần thêm):**
- `invoice_lines.invoice_id` → `idx_invoice_lines_invoice` (Task 1).
- `invoice_lines.menu_item_id` → `idx_invoice_lines_menu_item` (Task 1).
- `payments.invoice_id` → `idx_payments_invoice` (Task 1).
- `invoice_promotions.invoice_id` → `idx_invoice_promotions_invoice` (Task 1).
- `orders.invoice_id` → `orders_invoice_id_index`.

**Hướng join report:** `WHERE invoices.issued_at BETWEEN ?` + `JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id`. Driving table = invoices (nếu issued_at index giúp lọc nhỏ) → lookup invoice_lines theo invoice_id (index có) → nhanh. Thiếu `invoices.issued_at` index = phải scan toàn bộ invoices. **Điểm nghẽn là thiếu index date, KHÔNG phải thiếu index invoice_lines.**

## Phần 1 — Migration thêm 4 index cột date

Migration mới `database/migrations/2026_08_07_000001_add_report_performance_indexes.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->index('issued_at', 'invoices_issued_at_index');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->index('created_at', 'orders_created_at_index');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->index('cancelled_at', 'order_items_cancelled_at_index');
        });

        Schema::table('deposits', function (Blueprint $table) {
            $table->index('created_at', 'deposits_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('invoices_issued_at_index');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_created_at_index');
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex('order_items_cancelled_at_index');
        });
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropIndex('deposits_created_at_index');
        });
    }
};
```

**KHÔNG thêm index mới cho invoice_lines/payments/invoice_promotions** — đã có từ Task 1.

**Lưu ý môi trường:** default DB = `sqlite` (dev/test). SQLite FK không tự index nhưng index tường minh đã có cho FK từ Task 1. Production nếu dùng MySQL — FK tự index, index tường minh vẫn dùng được. Index cột date hoạt động cả 2.

## Phần 2 — Cache DashboardService (tag + TTL ngắn)

**Vấn đề:** DashboardService chạy 5 nhóm query mỗi lần load; dashboard là tổng quan gần-thời-gian-thực → TTL ngắn (60-300s) chấp nhận được.

**Giải pháp:** cache TỪNG nhóm riêng, tag `dashboard`, key gồm range + ngày bắt đầu:

Thêm private helper trong `DashboardService`:
```php
private function cached(string $key, int $ttl, callable $loader): mixed
{
    try {
        return Cache::tags(['dashboard'])->remember($key, $ttl, $loader);
    } catch (\Exception $e) {
        Log::warning("Redis failed in dashboard {$key}: ".$e->getMessage());

        return $loader();
    }
}
```

Bọc từng method (giữ signature hiện tại — thêm tính key bên trong):
- `kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd)`: `$this->cached("dashboard_kpis_{$start->toDateString()}", 120, fn () => [...logic hiện tại...])`
- `chartData(string $range, Carbon $start, Carbon $end)`: `$this->cached("dashboard_chart_{$range}_{$start->toDateString()}", 120, ...)`
- `topProducts(Carbon $start, Carbon $end)`: `$this->cached("dashboard_top_products_{$start->toDateString()}", 300, ...)` (thay đổi chậm hơn)
- `lowStock()`: `$this->cached("dashboard_low_stock", 300, ...)` (thay đổi chậm)
- `liveOperations(string $range)`: **KHÔNG cache** — thao tác thời gian thực (KDS pending/completed, serving queue, tables_map); các count query đều có index → nhanh.
- `getDateBounds`: thuần tính, không cache.

**Quan trọng — bọc đúng:** để tránh lồng closure lộn xộn, refactor nhẹ: mỗi method đổi body thành `return $this->cached($key, $ttl, fn () => <logic cũ>);`. Giữ nguyên logic, chỉ thêm lớp cache.

**Invalidate:** TTL ngắn tự cũ đi. Để KPI tiền nhanh nhạy sau checkout, thêm `Cache::tags(['dashboard'])->flush()` trong `CheckoutService::runBulk` (sau khi ghi invoice, cùng nơi ghi data). Tần suất checkout thấp → flush hiếm, không phá cache.

**Bất biến:** số liệu dashboard có thể lệch tối đa TTL (1-5 phút) so với real-time — chấp nhận cho trang tổng quan. `liveOperations` giữ real-time (không cache).

## Phần 3 — KHÔNG cache 6 report controller

Bỏ qua cache riêng cho reports vì:
- Sau khi có index `invoices.issued_at` + các index date khác, `whereBetween` scan theo range nhanh.
- Reports thường filter theo khoảng ngày cố định (start/end) — cache theo ngày cần invalidate phức tạp khi checkout (rủi ro stale số liệu tài chính).
- Dashboard (đã cache) là nơi tần suất truy cập cao nhất + aggregate nhiều bảng nhất.

## Phần 4 — Kiểm thử

- **Index:** test schema — sau migration, `Schema::hasIndex` (hoặc `Schema::getIndexes`) cho 4 index tồn tại; `down()` xóa được.
- **Dashboard cache:** test DashboardService — lần gọi đầu chạy logic, lần gọi thứ 2 (cùng key/ngày) dùng cached (giảm query — dùng `DB::enableQueryLog` đếm hoặc `Cache::tags(['dashboard'])->has` sau lần 1). Hoặc test đơn giản: gọi method 2 lần, assert kết quả giống nhau + cache tag có key.
- **Regression:** full suite (kpis/topProducts/chart/liveOperations không đổi kết quả — chỉ thêm cache).
- **Final:** `php artisan test` + `npm run types:check` + `npm run build` + `vendor/bin/pint --dirty`.

## Ngoài phạm vi

- Không cache 6 report controller (lý do Phần 3).
- Không thêm index mới cho invoice_lines/payments/invoice_promotions (đã có từ Task 1).
- Không đổi logic KPI/report.
- POS index cache giữ nguyên (đã có flush từ mutate).
