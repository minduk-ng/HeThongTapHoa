# Promotion v2 — Analytics & Daily Stats (Spec 3/3)

> Spec 3 của loạt 3 spec: báo cáo hiệu suất khuyến mãi + bảng tổng hợp theo ngày `daily_promotion_stats` + cronjob đêm. Spec 1 = DB + engine. Spec 2 = frontend quản lý.

**Goal:** Trả lời các chỉ số hiệu suất khuyến mãi (hiệu suất sử dụng, doanh thu mang lại, chi phí/ROI) qua bảng tổng hợp theo ngày — tránh quét trực tiếp `orders`/`invoice_lines` khi quán đông.

**Scope:** Backend (bảng stats + command cron + API trả số liệu) + frontend dashboard analytics (theo `tong_quan_khuyen_mai.html`). KHÔNG đổi engine/checkout (spec 1 đã ghi order_promotions).

---

## Phần 1 — Bảng `daily_promotion_stats`

**`daily_promotion_stats`** (1 dòng mỗi promotion mỗi ngày — tổng hợp, không quét bảng lớn):
```
id
promotion_id       FK promotions cascadeOnDelete
stat_date          date
order_count        int      // số hoá đơn áp dụng mã này trong ngày
revenue            decimal(15,2)  // TỔNG TIỀN hoá đơn có áp mã (doanh thu mang lại)
discount_total     decimal(15,2)  // tổng tiền giảm thực tế
unique_orders      int      // số đơn distinct
timestamps
UNIQUE(promotion_id, stat_date)
```

**Nguồn dữ liệu:** `order_promotions` (bảng fact spec 1) + `invoices.total_amount`/`discount_amount`:
- `revenue` = tổng `invoices.total_amount` của các invoice có trong `order_promotions` (nhóm theo promotion_id + ngày)
- `discount_total` = tổng `order_promotions.discount_applied`
- `order_count` = count distinct invoice

**Cập nhật — 2 cách (chọn 1 hoặc cả 2):**

**Cách A — Cộng dồn realtime (khuyến nghị):** Trong `CheckoutService::runBulk` (spec 1 đã ghi order_promotions), sau khi commit, upsert `daily_promotion_stats`:
```php
foreach ($appliedPromotions as $pr) {
    $statDate = now()->toDateString();
    DB::table('daily_promotion_stats')
        ->updateOrInsert(
            ['promotion_id' => $pr['promotion']->id, 'stat_date' => $statDate],
            [
                'order_count' => DB::raw('order_count + 1'),
                'revenue' => DB::raw('revenue + '.$invoiceTotal),
                'discount_total' => DB::raw('discount_total + '.$pr['amount']),
            ]
        );
}
```
→ Số liệu luôn mới, không cần cron. Rủi ro: nếu checkout rollback sau khi upsert — phải đặt upsert TRONG transaction (spec 1 đã có transaction) hoặc chấp nhận lệch nhỏ nếu ngoài.

**Cách B — Cron đêm (dự phòng):** Command `promotions:aggregate-daily` chạy `Schedule::dailyAt('03:00')`:
```php
// Rebuild stats cho hôm qua từ order_promotions + invoices
DB::table('daily_promotion_stats')
    ->where('stat_date', $yesterday)->delete();
DB::table('order_promotions')
    ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
    ->whereDate('order_promotions.created_at', $yesterday)
    ->select('order_promotions.promotion_id', DB::raw('COUNT(DISTINCT order_promotions.invoice_id) as order_count'),
             DB::raw('SUM(invoices.total_amount) as revenue'),
             DB::raw('SUM(order_promotions.discount_applied) as discount_total'))
    ->groupBy('order_promotions.promotion_id')
    ->get()
    ->each(fn ($row) => DB::table('daily_promotion_stats')->insert([
        'promotion_id' => $row->promotion_id, 'stat_date' => $yesterday,
        'order_count' => $row->order_count, 'revenue' => $row->revenue,
        'discount_total' => $row->discount_total, 'created_at' => now(), 'updated_at' => now(),
    ]));
```

**Quyết định:** dùng **Cả A + B** — A cộng dồn realtime (số liệu mới trong ngày), B rebuild đêm (sửa lệch do rollback bất đồng bộ). B rebuild ngày hôm qua từ nguồn sạch.

---

## Phần 2 — Chỉ số tính toán (chính xác theo yêu cầu bạn)

**1. Hiệu suất (performance %):**
- Coupon/Voucher: `used_count / max_usage × 100` (nếu max_usage; ngược lại "—")
- Promotion tự động: không có max_usage bắt buộc — dùng `order_count / (ngày active × trung bình đơn/ngày kỳ vọng)` hoặc hiển thị số đơn. **Quyết định:** Promotion hiệu suất = số đơn trong kỳ, hiển thị số tuyệt đối (không %) trừ khi cấu hình max_usage.

**2. Doanh thu mang lại từ KM (đúng công thức bạn nêu):**
> "Doanh thu mang lại từ khuyến mãi = tổng tiền của các hóa đơn có áp dụng mã đó, KHÔNG phải số tiền được giảm."

→ `SUM(daily_promotion_stats.revenue)` = tổng `invoices.total_amount` của hoá đơn áp mã. Báo cáo hiển thị cột "Tổng doanh thu" = revenue này (số lớn, thể hiện sức kéo chiến dịch), cột "Tổng giảm giá" = discount_total (chi phí).

**3. ROI (Hệ số sinh lời — đúng):**
```
ROI = (Doanh thu mang lại − Chi phí KM) / Chi phí KM
    = (Σ revenue − Σ discount_total) / Σ discount_total
```
- Chi phí KM = tổng tiền giảm (`discount_total`)
- ROI > 0 → chiến dịch sinh lời (doanh thu tăng thêm lớn hơn chi phí giảm giá)
- ROI = 0 → hoà vốn; < 0 → lỗ
- Hiển thị: nếu `discount_total = 0` → "—" (tránh chia 0)

**4. Tổng doanh thu từ KM (KPI card 1):** Σ revenue mọi promotion trong kỳ lọc.

**5. Giá trị giảm trung bình:** Σ discount_total / Σ order_count.

**6. Tỷ lệ sử dụng (pie):** % theo type (Promotion/Coupon/Voucher) = Σ order_count mỗi type / tổng.

---

## Phần 3 — API dashboard analytics

**`PromotionController::analytics(Request)`** (route mới `GET /manager/promotions/analytics`):
```php
// Trả cho trang tổng quan (spec 2) số liệu thật thay stats sơ bộ:
- kpis: {total_revenue, total_usage, avg_discount, roi, roi_percent}
- daily_chart: [{date, revenue, usage_count}]  // cho line chart
- type_breakdown: [{type, count, percent}]     // pie
- campaigns: [{id, name, type, order_count, revenue, discount_total, performance_percent, roi}]
- filter: search, status (running/ended/all), date_from, date_to
```
Query đọc từ `daily_promotion_stats` (JOIN promotions) — KHÔNG quét orders/invoice_lines. Filter theo `stat_date` range.

**Biểu đồ:** line chart (doanh thu & lượt dùng theo ngày) + pie (tỷ lệ sử dụng) — dùng Chart.js (kiểm tra repo đã có `chart.js` dependency — dự án đã dùng Chart.js ở DashboardManager).

**Frontend:** `PromotionsManager.tsx` (spec 2) nối `analytics` API → render 4 KPI cards + chart + bảng campaign performance số thật. "Xuất báo cáo" → `GET /manager/promotions/analytics/export` (CSV) — nếu muốn.

---

## Phần 4 — Cron scheduling

`routes/console.php`:
```php
Schedule::command('promotions:aggregate-daily')->dailyAt('03:00');
```
Command `php artisan promotions:aggregate-daily` — rebuild `daily_promotion_stats` cho ngày hôm qua (Cách B). Chạy được tay để verify.

---

## Chiến lược kiểm thử

- **Upsert realtime:** checkout áp mã → `daily_promotion_stats` có dòng đúng (order_count/revenue/discount_total).
- **Cron rebuild:** chạy command tay → stats hôm qua đúng theo order_promotions + invoices.
- **ROI/revenue công thức:** tạo 2 hoá đơn áp cùng mã (revenue 100k + 200k, discount 10k + 20k) → stats revenue=300k, discount=30k, ROI=(300-30)/30.
- **Analytics API:** trả đúng shape + filter date.
- **Frontend:** typecheck/build; chart render.

## File Structure

**Migration:** `database/migrations/2026_08_10_000013_create_daily_promotion_stats_table.php` (sau spec 1 — spec 1 dùng `000001`, các migration khác tới `000012`, dùng `000013` tránh trùng timestamp).

**Backend:**
- `app/Console/Commands/AggregateDailyPromotionStats.php` — command cron
- `app/Http/Controllers/Manager/PromotionController.php` — thêm `analytics()` + `export()`
- `routes/web.php` — 2 route mới
- `app/Services/Checkout/CheckoutService.php` — upsert stats (Cách A, trong transaction)

**Frontend:**
- `PromotionsManager.tsx` — nối analytics + chart (spec 2 đã có layout)
- `PromotionStatsCards.tsx` — nhận số thật
- Chart components (line + pie)

**Tests:** `PromotionAnalyticsTest.php` (realtime upsert + cron rebuild + ROI + API)
