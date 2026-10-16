<?php

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Services\Manager\DashboardService;
use App\Services\Manager\PaidProductRankingService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

it('uses latest eligible label even when newest line is fully refunded', function () {
    $item = posMenuItem();

    $invOld = Invoice::create([
        'invoice_code' => 'INV-OLD-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 10:00:00'),
        'total_amount' => 50000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invOld->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Ten Cu',
        'quantity' => 5,
        'unit_price' => 10000,
        'subtotal' => 50000,
        'refunded_qty' => 0,
    ]);

    $invNew = Invoice::create([
        'invoice_code' => 'INV-NEW-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 14:00:00'),
        'total_amount' => 50000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invNew->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Ten Moi Da Hoan Het',
        'quantity' => 2,
        'unit_price' => 10000,
        'subtotal' => 20000,
        'refunded_qty' => 2, // net 0, fully refunded newer row
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        5
    );

    $row = collect($result['items'])->firstWhere('product_id', $item->id);
    expect($row)->not->toBeNull();
    expect($row['sales_count'])->toBe(5);
    // Label must come from most recent eligible line even though its net is 0
    expect($row['name'])->toBe('Ten Moi Da Hoan Het');
});

it('preserves microsecond precision when choosing latest label', function () {
    $item = posMenuItem();

    // Insert newer-micros row FIRST so it has smaller line_id.
    // Old ms-only logic ties on ms then picks larger line_id (older micros) -> wrong.
    // Fixed micros logic must pick later micros despite smaller line_id.
    $invNewer = Invoice::create([
        'invoice_code' => 'INV-US2-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 12:00:00'),
        'total_amount' => 20000,
    ]);
    $lineNewer = InvoiceLine::create([
        'invoice_id' => $invNewer->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Us Newer',
        'quantity' => 1,
        'unit_price' => 10000,
        'subtotal' => 10000,
        'refunded_qty' => 0,
    ]);

    $invOlder = Invoice::create([
        'invoice_code' => 'INV-US1-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 12:00:00'),
        'total_amount' => 20000,
    ]);
    $lineOlder = InvoiceLine::create([
        'invoice_id' => $invOlder->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Ms Older',
        'quantity' => 1,
        'unit_price' => 10000,
        'subtotal' => 10000,
        'refunded_qty' => 0,
    ]);

    // Force raw microsecond timestamps (bypass Eloquent second truncation)
    DB::table('invoices')->where('id', $invNewer->id)->update(['issued_at' => '2026-10-16 12:00:00.123456']);
    DB::table('invoices')->where('id', $invOlder->id)->update(['issued_at' => '2026-10-16 12:00:00.123400']);

    expect($lineNewer->id)->toBeLessThan($lineOlder->id);

    $result = app(PaidProductRankingService::class)->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        5
    );

    $row = collect($result['items'])->firstWhere('product_id', $item->id);
    expect($row['name'])->toBe('Us Newer');
});

it('serializes product_id as decimal string beyond JS safe integer', function () {
    // Safe IDs stay integers for BC
    expect(PaidProductRankingService::serializeProductId(123))->toBe(123);
    expect(PaidProductRankingService::serializeProductId(9007199254740991))->toBe(9007199254740991);

    // Beyond safe integer must be decimal string, exact, no precision loss
    $big = 9007199254740993;
    $serialized = PaidProductRankingService::serializeProductId($big);
    expect($serialized)->toBeString();
    expect($serialized)->toBe('9007199254740993');

    // Ranking output uses serializer (unit check via helper keeps numeric tie order)
    expect(is_numeric((string) $serialized))->toBeTrue();
});

it('initializes dashboard source revision atomically via Cache::add', function () {
    Cache::forget('dashboard_source_revision');

    $first = DashboardService::bumpSourceRevision();
    expect($first)->toBe(1);

    $second = DashboardService::bumpSourceRevision();
    expect($second)->toBe(2);
});

it('explicit refresh bypasses cached ranking and echoes fresh revision', function () {
    $item = posMenuItem();
    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => now(),
        'total_amount' => 20000,
    ]);
    $line = InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => $item->name,
        'quantity' => 4,
        'unit_price' => 20000,
        'subtotal' => 80000,
        'refunded_qty' => 0,
    ]);

    $service = app(DashboardService::class);
    [$start, $end] = [$service->getDateBounds('today')[0], $service->getDateBounds('today')[1]];

    Cache::forget('dashboard_source_revision');
    DashboardService::bumpSourceRevision(); // rev 1, fills cache on first read
    $cached = $service->topProducts($start, $end, 5);
    expect($cached['items'][0]['sales_count'])->toBe(4);
    expect($cached['metadata'])->toHaveKey('revision');

    // Direct DB change without bump stays cached
    $line->update(['refunded_qty' => 1]);
    $stale = $service->topProducts($start, $end, 5);
    expect($stale['items'][0]['sales_count'])->toBe(4);

    // Explicit refresh bypasses cache and returns fresh data with fresh revision
    DashboardService::bumpSourceRevision(); // rev 2
    $fresh = $service->topProducts($start, $end, 5, true);
    expect($fresh['items'][0]['sales_count'])->toBe(3);
    expect($fresh['metadata']['revision'])->toBeGreaterThan($stale['metadata']['revision']);
});

it('uses start-of-next-day as endExclusive (no endOfDay+1s microsecond leak)', function () {
    // Direct contract: endExclusive passed to rank must be start-of-next-day with 0 micros,
    // not endOfDay+1s (= next-day 00:00:00.999999 which leaks micros after midnight).
    $service = app(DashboardService::class);
    [$start, $end] = [$service->getDateBounds('today')[0], $service->getDateBounds('today')[1]];

    $capturedEnd = null;
    $mock = Mockery::mock(PaidProductRankingService::class);
    $mock->shouldReceive('rank')->once()->andReturnUsing(function ($s, $e, $k) use (&$capturedEnd) {
        $capturedEnd = $e->copy();

        return [
            'items' => [],
            'metadata' => [
                'source' => PaidProductRankingService::SOURCE,
                'refund_basis' => PaidProductRankingService::REFUND_BASIS,
                'unidentified_line_count' => 0,
                'unidentified_net_quantity' => 0,
                'invalid_line_count' => 0,
                'generated_at' => now()->toIso8601String(),
                'revision' => null,
                'k' => $k,
            ],
        ];
    });
    $svc = new DashboardService($mock);
    $svc->topProducts($start, $end, 5, true);

    $expected = $end->copy()->startOfDay()->addDay();
    expect($capturedEnd->format('Y-m-d H:i:s.u'))->toBe($expected->format('Y-m-d H:i:s.u'));
    expect($capturedEnd->microsecond)->toBe(0);

    // Functional half-open check with seconds precision (both impls agree here,
    // micros leak covered by contract assertion above)
    $item = posMenuItem();
    $nextDayMidnight = $start->copy()->addDay()->startOfDay();
    $invNext = Invoice::create([
        'invoice_code' => 'INV-NEXT-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => $nextDayMidnight,
        'total_amount' => 10000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invNext->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Next Day',
        'quantity' => 9,
        'unit_price' => 10000,
        'subtotal' => 90000,
        'refunded_qty' => 0,
    ]);

    $invToday = Invoice::create([
        'invoice_code' => 'INV-TODAY-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => $start->copy()->addHours(12),
        'total_amount' => 10000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invToday->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Today',
        'quantity' => 2,
        'unit_price' => 10000,
        'subtotal' => 20000,
        'refunded_qty' => 0,
    ]);

    Cache::forget('dashboard_source_revision');
    $real = app(DashboardService::class);
    $result = $real->topProducts($start, $end, 5, true);
    $row = collect($result['items'])->firstWhere('product_id', $item->id);
    expect($row['sales_count'])->toBe(2);
});

it('bypasses cache when revision is unavailable instead of guessing freshness', function () {
    $item = posMenuItem();
    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => now(),
        'total_amount' => 20000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'NoRev',
        'quantity' => 3,
        'unit_price' => 20000,
        'subtotal' => 60000,
        'refunded_qty' => 0,
    ]);

    Cache::forget('dashboard_source_revision');

    $service = app(DashboardService::class);
    [$start, $end] = [$service->getDateBounds('today')[0], $service->getDateBounds('today')[1]];
    $result = $service->topProducts($start, $end, 5);

    expect($result['items'][0]['sales_count'])->toBe(3);
    // Honest echo: revision null when unavailable, never guessed as 1
    expect(array_key_exists('revision', $result['metadata']))->toBeTrue();
    expect($result['metadata']['revision'])->toBeNull();
});
