<?php

use App\Services\Checkout\CheckoutService;
use App\Services\Manager\DashboardService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

test('dashboard kpis duoc cache theo ngay', function () {
    $service = new DashboardService;
    [$start, $end, $prevStart, $prevEnd] = $service->getDateBounds('today');

    // Lần 1: chạy logic, ghi cache
    $r1 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_'.$start->toDateString().'_'.$end->toDateString()))->toBeTrue();

    // Lần 2: dùng cached (cùng kết quả)
    $r2 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect($r2)->toBe($r1);
});

test('dashboard kpis ghi key rieng khi cung ngay bat dau nhung khac end', function () {
    $service = new DashboardService;
    $start = Carbon::parse('2026-08-01');

    // Hai range cùng start 2026-08-01, end khác nhau (7 vs 31) — như last_7_days vs this_month
    $service->kpis($start, Carbon::parse('2026-08-07'), Carbon::parse('2026-07-01'), Carbon::parse('2026-07-07'));
    $service->kpis($start, Carbon::parse('2026-08-31'), Carbon::parse('2026-07-01'), Carbon::parse('2026-07-31'));

    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-08-01_2026-08-07'))->toBeTrue();
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-08-01_2026-08-31'))->toBeTrue();
});

test('dashboard lowStock duoc cache', function () {
    $service = new DashboardService;
    $r1 = $service->lowStock();
    expect(Cache::tags(['dashboard'])->has('dashboard_low_stock'))->toBeTrue();
    expect($service->lowStock())->toBe($r1);
});

test('checkout flush dashboard cache', function () {
    // Ghi cache giả
    Cache::tags(['dashboard'])->put('dashboard_kpis_2026-01-01', 'stale', 300);
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-01-01'))->toBeTrue();

    // Chạy 1 checkout
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    CheckoutService::run($order, [['method' => 'cash', 'amount' => 100000]], [], auth()->id());

    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-01-01'))->toBeFalse();
});
