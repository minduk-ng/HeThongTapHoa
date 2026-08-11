# Promotion v2 â€” Analytics & Daily Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Báº£ng tá»•ng há»£p `daily_promotion_stats` + command cron + API analytics + frontend chart â€” trÃ¡nh quÃ©t `orders`/`invoice_lines` trá»±c tiáº¿p.

**Architecture:** Upsert realtime trong CheckoutService (CÃ¡ch A) + command rebuild Ä‘Ãªm (CÃ¡ch B). `analytics()` Ä‘á»c tá»« `daily_promotion_stats` JOIN promotions. Frontend PromotionsManager (spec 2) ná»‘i analytics + recharts line/pie.

**Tech Stack:** Laravel 13 + PHP + Pest + recharts (Ä‘Ã£ cÃ³).

**Spec:** `docs/superpowers/specs/2026-08-10-promotion-v2-analytics-design.md`

## Global Constraints

- PowerShell Windows: KHÃ”NG dÃ¹ng `&&`.
- ROI = (Î£ revenue âˆ’ Î£ discount_total) / Î£ discount_total; discount_total = 0 â†’ "â€”".
- "Doanh thu mang láº¡i" = Î£ invoices.total_amount cá»§a hoÃ¡ Ä‘Æ¡n Ã¡p mÃ£ (KHÃ”NG pháº£i tiá»n giáº£m).
- Upsert realtime TRONG transaction checkout (khÃ´ng lá»‡ch náº¿u rollback).
- Command cron rebuild ngÃ y hÃ´m qua tá»« order_promotions + invoices (nguá»“n sáº¡ch).
- `php artisan test` + `npm run types:check` + `npm run build` pass.

---

## File Structure

**Migration:** `database/migrations/2026_08_10_000015_create_daily_promotion_stats_table.php`

**Backend:**
- `app/Console/Commands/AggregateDailyPromotionStats.php`
- `app/Http/Controllers/Manager/PromotionController.php` (thÃªm `analytics`)
- `routes/web.php` (route analytics)
- `app/Services/Checkout/CheckoutService.php` (upsert stats)
- `routes/console.php` (schedule)

**Frontend:**
- `PromotionsManager.tsx` (ná»‘i analytics props)
- `PromotionAnalyticsCharts.tsx` (line + pie recharts)
- `PromotionStatsCards.tsx` (nháº­n sá»‘ tháº­t)

**Tests:** `PromotionAnalyticsTest.php`

---

## Task 1: Migration + upsert realtime trong checkout

**Files:**
- Create: `database/migrations/2026_08_10_000015_create_daily_promotion_stats_table.php`
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/PromotionAnalyticsTest.php` (pháº§n realtime)

**Interfaces:**
- Produces: báº£ng stats + má»—i checkout upsert stats. Task 2 (analytics API) Ä‘á»c báº£ng nÃ y.

- [ ] **Step 1: Viáº¿t test fail**

Táº¡o `tests/Feature/PromotionAnalyticsTest.php`:

```php
<?php

use App\Models\Promotion;
use App\Models\PromotionAction;
use App\Models\DailyPromotionStat;

function promoStat(array $attrs = []): Promotion
{
    return Promotion::create(array_merge([
        'name' => 'Promo '.uniqid(), 'type' => 'coupon', 'code' => 'STAT'.uniqid(),
        'status' => true, 'max_usage' => null, 'used_count' => 0,
        'exclusive' => false, 'stackable' => true,
    ], $attrs));
}

test('checkout upsert daily_promotion_stats', function () {
    $admin = posAdmin();
    $coupon = promoStat();
    $coupon->actions()->create(['action_type' => 'discount_amount', 'action_value' => 10000, 'max_discount_amount' => null]);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $stat = DailyPromotionStat::where('promotion_id', $coupon->id)->where('stat_date', now()->toDateString())->first();
    expect($stat)->not->toBeNull();
    expect($stat->order_count)->toBe(1);
    expect((float) $stat->revenue)->toBe(50000.0);      // tá»•ng tiá»n hoÃ¡ Ä‘Æ¡n (KHÃ”NG pháº£i tiá»n giáº£m)
    expect((float) $stat->discount_total)->toBe(10000.0); // tiá»n giáº£m thá»±c táº¿
});
```

- [ ] **Step 2: Cháº¡y test fail**

Run: `php artisan test tests\Feature\PromotionAnalyticsTest.php`
Expected: FAIL â€” chÆ°a cÃ³ báº£ng/model/upsert.

- [ ] **Step 3: Migration**

`database/migrations/2026_08_10_000015_create_daily_promotion_stats_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_promotion_stats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->date('stat_date');
            $table->integer('order_count')->default(0);
            $table->decimal('revenue', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->integer('unique_orders')->default(0);
            $table->timestamps();
            $table->unique(['promotion_id', 'stat_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_promotion_stats');
    }
};
```

- [ ] **Step 4: Model**

`app/Models/DailyPromotionStat.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailyPromotionStat extends Model
{
    protected $fillable = ['promotion_id', 'stat_date', 'order_count', 'revenue', 'discount_total', 'unique_orders'];

    protected $casts = [
        'stat_date' => 'date',
        'order_count' => 'int',
        'revenue' => 'float',
        'discount_total' => 'float',
        'unique_orders' => 'int',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

- [ ] **Step 5: Upsert trong CheckoutService**

`app/Services/Checkout/CheckoutService.php` â€” trong transaction, SAU khi ghi order_promotions (spec 1 Task 4), thÃªm:

```php
            // 7d. Upsert daily_promotion_stats (realtime)
            foreach ($appliedPromotions as $pr) {
                $promo = $pr['promotion'];
                $statDate = now()->toDateString();
                $promo->dailyStats()->updateOrInsert(
                    ['promotion_id' => $promo->id, 'stat_date' => $statDate],
                    [
                        'order_count' => DB::raw('order_count + 1'),
                        'unique_orders' => DB::raw('unique_orders + 1'),
                        'revenue' => DB::raw('revenue + '.round($total, 2)),
                        'discount_total' => DB::raw('discount_total + '.round($pr['amount'], 2)),
                        'updated_at' => now(),
                    ]
                );
            }
```

**LÆ°u Ã½:** `$total` = `invoices.total_amount` (biáº¿n `$total` trong closure â€” kiá»ƒm tra tÃªn biáº¿n thá»±c; spec 1 dÃ¹ng `$total` cho subtotal-discount). `DB::raw` cáº§n `use Illuminate\Support\Facades\DB;` (Ä‘Ã£ cÃ³). Model `DailyPromotionStat` cáº§n thÃªm relation `dailyStats()` trÃªn `Promotion` model (hasMany). **Hoáº·c** dÃ¹ng `DB::table('daily_promotion_stats')->updateOrInsert(...)` trá»±c tiáº¿p (trÃ¡nh thÃªm relation). **Quyáº¿t Ä‘á»‹nh:** dÃ¹ng `DB::table(...)->updateOrInsert` trá»±c tiáº¿p trong CheckoutService â€” Ä‘Æ¡n giáº£n, khÃ´ng Ä‘á»¥ng model relation.

```php
            foreach ($appliedPromotions as $pr) {
                $promo = $pr['promotion'];
                $statDate = now()->toDateString();
                DB::table('daily_promotion_stats')
                    ->updateOrInsert(
                        ['promotion_id' => $promo->id, 'stat_date' => $statDate],
                        [
                            'order_count' => DB::raw('order_count + 1'),
                            'unique_orders' => DB::raw('unique_orders + 1'),
                            'revenue' => DB::raw('revenue + '.round($invoiceTotal, 2)),
                            'discount_total' => DB::raw('discount_total + '.round($pr['amount'], 2)),
                            'updated_at' => now(),
                        ]
                    );
            }
```
(`$invoiceTotal` = `(float) $invoice->total_amount` â€” dÃ¹ng `$invoice` Ä‘Ã£ táº¡o trong closure.)

- [ ] **Step 6: Test pass + full suite**

Run: `php artisan test tests\Feature\PromotionAnalyticsTest.php` â€” PASS.
Run: `php artisan test` â€” PASS (spec 1 xanh + test má»›i).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_10_000015_create_daily_promotion_stats_table.php app/Models/DailyPromotionStat.php app/Services/Checkout/CheckoutService.php tests/Feature/PromotionAnalyticsTest.php
git commit -m "feat: daily_promotion_stats + upsert realtime khi checkout"
```

---

## Task 2: Command cron rebuild Ä‘Ãªm

**Files:**
- Create: `app/Console/Commands/AggregateDailyPromotionStats.php`
- Modify: `routes/console.php`

**Interfaces:**
- Consumes: báº£ng stats + order_promotions + invoices (Task 1).
- Produces: `php artisan promotions:aggregate-daily` rebuild stats ngÃ y hÃ´m qua.

- [ ] **Step 1: Táº¡o command**

`app/Console/Commands/AggregateDailyPromotionStats.php`:

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AggregateDailyPromotionStats extends Command
{
    protected $signature = 'promotions:aggregate-daily';

    protected $description = 'Rebuild daily_promotion_stats cho ngÃ y hÃ´m qua tá»« order_promotions + invoices';

    public function handle(): int
    {
        $yesterday = now()->subDay()->toDateString();

        DB::table('daily_promotion_stats')->where('stat_date', $yesterday)->delete();

        DB::table('order_promotions')
            ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
            ->whereDate('order_promotions.created_at', $yesterday)
            ->whereNotNull('order_promotions.promotion_id')
            ->select(
                'order_promotions.promotion_id',
                DB::raw('COUNT(DISTINCT order_promotions.invoice_id) as order_count'),
                DB::raw('COUNT(DISTINCT order_promotions.order_id) as unique_orders'),
                DB::raw('SUM(invoices.total_amount) as revenue'),
                DB::raw('SUM(order_promotions.discount_applied) as discount_total')
            )
            ->groupBy('order_promotions.promotion_id')
            ->get()
            ->each(function ($row) use ($yesterday) {
                DB::table('daily_promotion_stats')->insert([
                    'promotion_id' => $row->promotion_id,
                    'stat_date' => $yesterday,
                    'order_count' => $row->order_count,
                    'unique_orders' => $row->unique_orders,
                    'revenue' => $row->revenue,
                    'discount_total' => $row->discount_total,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });

        $this->info("ÄÃ£ rebuild daily_promotion_stats cho {$yesterday}");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 2: Schedule**

`routes/console.php` â€” thÃªm:
```php
Schedule::command('promotions:aggregate-daily')->dailyAt('03:00');
```
(kiá»ƒm tra `Schedule::command` import `Illuminate\Support\Facades\Schedule` Ä‘Ã£ cÃ³ chÆ°a â€” file nÃ y thÆ°á»ng cÃ³ sáºµn.)

- [ ] **Step 3: Test command**

ThÃªm vÃ o `tests/Feature/PromotionAnalyticsTest.php`:

```php
test('command rebuild daily stats cho hom qua', function () {
    // Táº¡o order_promotions cho hÃ´m qua (dÃ¹ng created_at hÃ´m qua)
    $admin = posAdmin();
    $coupon = promoStat();
    $coupon->actions()->create(['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]);
    $item = posMenuItem(['price' => 40000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 40000, 'status' => 'completed']], ['status' => 'pending']);

    // Checkout nhÆ°ng giáº£ láº­p created_at hÃ´m qua
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash',
        'amount_received' => 40000, 'promotion_code' => $coupon->code,
    ])->assertOk();

    $op = \App\Models\OrderPromotion::where('promotion_id', $coupon->id)->first();
    $op->update(['created_at' => now()->subDay()]);

    $this->artisan('promotions:aggregate-daily')->assertSuccessful();

    $stat = \App\Models\DailyPromotionStat::where('promotion_id', $coupon->id)->where('stat_date', now()->subDay()->toDateString())->first();
    expect($stat)->not->toBeNull();
    expect((float) $stat->revenue)->toBe(40000.0);
    expect((float) $stat->discount_total)->toBe(5000.0);
});
```

- [ ] **Step 4: Test pass**

Run: `php artisan test tests\Feature\PromotionAnalyticsTest.php` â€” PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Console/Commands/AggregateDailyPromotionStats.php routes/console.php tests/Feature/PromotionAnalyticsTest.php
git commit -m "feat: command promotions:aggregate-daily rebuild stats dem + schedule 03:00"
```

---

## Task 3: Analytics API

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php` (thÃªm `analytics`)
- Modify: `routes/web.php`

**Interfaces:**
- Consumes: báº£ng stats (Task 1).
- Produces: `GET /manager/promotions/analytics` tráº£ kpis/daily_chart/type_breakdown/campaigns. Task 4 (frontend) tiÃªu thá»¥.

- [ ] **Step 1: ThÃªm analytics()**

`app/Http/Controllers/Manager/PromotionController.php` â€” thÃªm method:

```php
    public function analytics(Request $request): \Illuminate\Http\JsonResponse
    {
        $from = $request->input('from');
        $to = $request->input('to');

        $statsQuery = DB::table('daily_promotion_stats')
            ->join('promotions', 'promotions.id', '=', 'daily_promotion_stats.promotion_id')
            ->select(
                'promotions.id', 'promotions.name', 'promotions.type', 'promotions.code',
                DB::raw('SUM(daily_promotion_stats.order_count) as order_count'),
                DB::raw('SUM(daily_promotion_stats.revenue) as revenue'),
                DB::raw('SUM(daily_promotion_stats.discount_total) as discount_total'),
            );
        if ($from) {
            $statsQuery->where('daily_promotion_stats.stat_date', '>=', $from);
        }
        if ($to) {
            $statsQuery->where('daily_promotion_stats.stat_date', '<=', $to);
        }
        $statsQuery->groupBy('promotions.id', 'promotions.name', 'promotions.type', 'promotions.code');

        $campaigns = $statsQuery->get()->map(function ($row) {
            $revenue = (float) $row->revenue;
            $discount = (float) $row->discount_total;
            $roi = $discount > 0 ? ($revenue - $discount) / $discount : null;
            return [
                'id' => $row->id, 'name' => $row->name, 'type' => $row->type, 'code' => $row->code,
                'order_count' => (int) $row->order_count,
                'revenue' => $revenue,
                'discount_total' => $discount,
                'roi' => $roi,
                'roi_percent' => $roi === null ? null : round($roi * 100, 1),
            ];
        });

        $kpis = [
            'total_revenue' => (float) $campaigns->sum('revenue'),
            'total_orders' => (int) $campaigns->sum('order_count'),
            'total_discount' => (float) $campaigns->sum('discount_total'),
            'avg_discount' => $campaigns->sum('order_count') > 0
                ? round($campaigns->sum('discount_total') / $campaigns->sum('order_count'), 2) : 0,
            'roi' => (float) $campaigns->sum('discount_total') > 0
                ? round(($campaigns->sum('revenue') - $campaigns->sum('discount_total')) / $campaigns->sum('discount_total'), 2) : 0,
        ];

        $dailyQuery = DB::table('daily_promotion_stats');
        if ($from) $dailyQuery->where('stat_date', '>=', $from);
        if ($to) $dailyQuery->where('stat_date', '<=', $to);
        $daily = $dailyQuery->select('stat_date',
            DB::raw('SUM(order_count) as usage_count'),
            DB::raw('SUM(revenue) as revenue'))
            ->groupBy('stat_date')->orderBy('stat_date')->get()
            ->map(fn ($r) => ['date' => $r->stat_date, 'usage_count' => (int) $r->usage_count, 'revenue' => (float) $r->revenue])->values();

        $typeBreakdown = collect($campaigns)->groupBy('type')->map(function ($g, $type) {
            $total = (int) $g->sum('order_count');
            return ['type' => $type, 'count' => $total];
        })->values();
        $allCount = (int) $typeBreakdown->sum('count');
        $typeBreakdown = $typeBreakdown->map(fn ($t) => ['type' => $t['type'], 'count' => $t['count'], 'percent' => $allCount > 0 ? round($t['count'] / $allCount * 100, 1) : 0]);

        return response()->json([
            'kpis' => $kpis,
            'daily_chart' => $daily,
            'type_breakdown' => $typeBreakdown,
            'campaigns' => $campaigns,
        ]);
    }
```

**LÆ°u Ã½:** thÃªm `use Illuminate\Support\Facades\DB;` náº¿u chÆ°a cÃ³. KPI `total_campaigns` khÃ´ng á»Ÿ Ä‘Ã¢y (index Ä‘Ã£ cÃ³).

- [ ] **Step 2: Route**

`routes/web.php` â€” group `/manager`, sau route promotions:
```php
Route::get('/promotions/analytics', [PromotionController::class, 'analytics'])->middleware('permission:promotions.view');
```
**LÆ°u Ã½:** route nÃ y pháº£i Ä‘áº·t TRÆ¯á»šC `Route::get('/promotions', ...)`? KhÃ´ng â€” `/promotions/analytics` khÃ¡c `/promotions`, khÃ´ng conflict. NhÆ°ng Ä‘áº·t TRÆ¯á»šC `POST /promotions/{promotion}` Ä‘á»ƒ trÃ¡nh `{promotion}` match 'analytics'. XÃ¡c nháº­n: `GET /promotions/analytics` vs `POST /promotions/{promotion}` â€” method khÃ¡c (GET vs POST) nÃªn khÃ´ng conflict. Äáº·t sau index lÃ  Ä‘Æ°á»£c.

- [ ] **Step 3: Test API**

ThÃªm vÃ o `tests/Feature/PromotionAnalyticsTest.php`:

```php
test('analytics api tra kpis va campaigns', function () {
    $admin = posAdmin();
    $coupon = promoStat();
    $coupon->actions()->create(['action_type' => 'discount_amount', 'action_value' => 10000, 'max_discount_amount' => null]);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash',
        'amount_received' => 50000, 'promotion_code' => $coupon->code,
    ])->assertOk();

    $this->actingAs($admin)->getJson('/manager/promotions/analytics')
        ->assertOk()
        ->assertJsonStructure(['kpis' => ['total_revenue', 'total_orders', 'total_discount', 'avg_discount', 'roi'], 'daily_chart', 'type_breakdown', 'campaigns'])
        ->assertJsonPath('kpis.total_revenue', 50000)
        ->assertJsonPath('kpis.total_discount', 10000)
        ->assertJsonPath('kpis.roi', (50000 - 10000) / 10000);
});
```

- [ ] **Step 4: Test pass + full suite**

Run: `php artisan test tests\Feature\PromotionAnalyticsTest.php` â€” PASS.
Run: `php artisan test` â€” PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php routes/web.php tests/Feature/PromotionAnalyticsTest.php
git commit -m "feat: analytics API promotion (kpis/daily/type/campaigns) tu daily_promotion_stats"
```

---

## Task 4: Frontend charts + ná»‘i analytics

**Files:**
- Create: `resources/js/pages/manager/promotions/components/PromotionAnalyticsCharts.tsx`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx`
- Modify: `resources/js/pages/manager/promotions/components/PromotionStatsCards.tsx`

**Interfaces:**
- Consumes: `analytics()` API (Task 3), PromotionsManager (spec 2).
- Produces: KPI cards sá»‘ tháº­t + line chart + pie chart.

- [ ] **Step 1: Táº¡o PromotionAnalyticsCharts**

`resources/js/pages/manager/promotions/components/PromotionAnalyticsCharts.tsx`:

```tsx
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

interface Daily { date: string; usage_count: number; revenue: number; }
interface TypeItem { type: string; count: number; percent: number; }

const COLORS = ['#0059bb', '#008730', '#e6a700'];

export default function PromotionAnalyticsCharts({ daily, types }: { daily: Daily[]; types: TypeItem[] }) {
    const typeLabels: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Doanh thu &amp; Sá»‘ lÆ°á»£t dÃ¹ng theo ngÃ y</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={daily}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#0059bb" fill="#0059bb" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="usage_count" name="LÆ°á»£t dÃ¹ng" stroke="#008730" fill="#008730" fillOpacity={0.15} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="lg:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Tá»· lá»‡ sá»­ dá»¥ng</h3>
                <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={types} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                                {types.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend formatter={(value) => typeLabels[value] || value} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Ná»‘i analytics vÃ o PromotionsManager**

`PromotionsManager.tsx` â€” thÃªm: import `useEffect`, `PromotionAnalyticsCharts`; thÃªm state analytics; fetch khi mount; truyá»n sá»‘ tháº­t vÃ o StatsCards; render charts giá»¯a stats cards vÃ  campaign list:

```tsx
import { useEffect, useState } from 'react';
import PromotionAnalyticsCharts from './components/PromotionAnalyticsCharts';

// trong component:
const [analytics, setAnalytics] = useState<any>(null);

useEffect(() => {
    fetch('/manager/promotions/analytics', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((data) => setAnalytics(data))
        .catch(() => {});
}, []);
```

Render:
```tsx
<div className="space-y-4">
    <PromotionStatsCards stats={analytics?.kpis ?? stats} />
    {analytics && <PromotionAnalyticsCharts daily={analytics.daily_chart} types={analytics.type_breakdown} />}
    {/* ...campaign list (spec 2) â€” cÃ³ thá»ƒ thÃªm revenue/discount/roi cá»™t tá»« analytics.campaigns náº¿u muá»‘n */}
</div>
```

**LÆ°u Ã½:** `PromotionStatsCards` props hiá»‡n lÃ  `stats` shape spec 2 â€” `analytics.kpis` cÃ³ `total_revenue/total_orders/total_discount/avg_discount/roi` (thiáº¿u `total_campaigns`) â€” component spec 2 Ä‘á»c `stats.total_campaigns` â†’ dÃ¹ng fallback `stats?.total_campaigns ?? 0`. Kiá»ƒm tra build.

**LÆ°u Ã½ auth:** fetch `/manager/promotions/analytics` â€” route cÃ³ middleware `permission:promotions.view` + auth. Browser fetch sáº½ gá»­i session cookie (Inertia axios). DÃ¹ng `axios` (Ä‘Ã£ cÃ³ trong dá»± Ã¡n) thay `fetch` Ä‘á»ƒ báº¯t CSRF header? GET khÃ´ng cáº§n CSRF. `fetch` GET OK vá»›i cookie same-origin. Giá»¯ `fetch`.

- [ ] **Step 3: Types + build**

Run: `npm run types:check` + `npm run build` â€” PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/promotions/
git commit -m "feat: analytics charts (line/pie) + ná»‘i daily_promotion_stats vao trang tong quan"
```

---

## Task 5: Final verification

**Files:** khÃ´ng code â€” verify.

- [ ] **Step 1: Full suite**

Run: `php artisan test` â€” PASS.

- [ ] **Step 2: Pint**

Run: `vendor/bin/pint --dirty --test` â€” sáº¡ch.

- [ ] **Step 3: Frontend**

Run: `npm run types:check` + `npm run build` â€” PASS.

- [ ] **Step 4: Smoke**

- Checkout 1 Ä‘Æ¡n cÃ³ mÃ£ â†’ `daily_promotion_stats` cÃ³ dÃ²ng (tinker).
- `/manager/promotions/analytics` tráº£ kpis Ä‘Ãºng.
- Má»Ÿ `/manager/promotions` â†’ KPI sá»‘ tháº­t + line/pie chart render.
- Cháº¡y `php artisan promotions:aggregate-daily` â†’ stats hÃ´m qua Ä‘Ãºng.

- [ ] **Step 5: Fix phÃ¡t sinh + commit náº¿u cáº§n**

---

## Final verification checklist

- [ ] `php artisan test` â€” pass
- [ ] `vendor/bin/pint --dirty --test` â€” sáº¡ch
- [ ] `npm run types:check` + `npm run build` â€” pass
- [ ] Smoke: checkout â†’ stats â†’ analytics API â†’ charts
- [ ] `git status` â€” tree sáº¡ch
