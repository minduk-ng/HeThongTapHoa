<?php

use App\Services\Manager\DashboardService;
use Illuminate\Support\Facades\Cache;

test('dashboard kpis duoc cache theo ngay', function () {
    $service = new DashboardService;
    [$start, $end, $prevStart, $prevEnd] = $service->getDateBounds('today');

    // Lần 1: chạy logic, ghi cache
    $r1 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_'.$start->toDateString()))->toBeTrue();

    // Lần 2: dùng cached (cùng kết quả)
    $r2 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect($r2)->toBe($r1);
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
    \App\Services\Checkout\CheckoutService::run($order, [['method' => 'cash', 'amount' => 100000]], [], auth()->id());

    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-01-01'))->toBeFalse();
});
