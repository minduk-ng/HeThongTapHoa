<?php

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Services\Checkout\CheckoutService;
use App\Services\Manager\DashboardService;
use App\Services\Manager\PaidProductRankingService;
use Illuminate\Support\Facades\Cache;

it('separates cache by date, source revision and K', function () {
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

    // Initial request with top_k=5 returns sales_count = 4
    $this->actingAs(posAdmin())->get('/?top_k=5')->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('analytics.top_products.0.sales_count', 4)
            ->where('analytics.top_products_meta.source', PaidProductRankingService::SOURCE)
            ->where('filters.top_k', 5)
        );

    // Direct DB update without cache bump returns cached data (sales_count still 4)
    $line->update(['refunded_qty' => 1]);
    $this->actingAs(posAdmin())->get('/?top_k=5')->assertOk()
        ->assertInertia(fn ($page) => $page->where('analytics.top_products.0.sales_count', 4));

    // Request with different K (top_k=10) evaluates independently (cache separated by K)
    $this->actingAs(posAdmin())->get('/?top_k=10')->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('analytics.top_products.0.sales_count', 3)
            ->where('filters.top_k', 10)
        );

    // Source revision bump invalidates cache; top_k=5 now reflects sales_count = 3
    DashboardService::bumpSourceRevision();
    $this->actingAs(posAdmin())->get('/?top_k=5')->assertOk()
        ->assertInertia(fn ($page) => $page->where('analytics.top_products.0.sales_count', 3));
});

it('rejects invalid K', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->get('/?top_k=7')->assertStatus(422);
    $this->actingAs($admin)->get('/?top_k=0')->assertStatus(422);
    $this->actingAs($admin)->get('/?top_k=-1')->assertStatus(422);
    $this->actingAs($admin)->get('/?top_k=abc')->assertStatus(422);
    $this->actingAs($admin)->get('/?top_k=5.5')->assertStatus(422);
});

it('accepts valid K values and defaults absent K to 5', function () {
    $admin = posAdmin();

    foreach ([5, 10, 20] as $validK) {
        $this->actingAs($admin)->get("/?top_k={$validK}")->assertOk()
            ->assertInertia(fn ($page) => $page->where('filters.top_k', $validK));
    }

    $this->actingAs($admin)->get('/')->assertOk()
        ->assertInertia(fn ($page) => $page->where('filters.top_k', 5));
});

it('advances dashboard source revision on refund mutation path', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 3, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 150000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $revBefore = (int) Cache::get('dashboard_source_revision', 1);

    $this->actingAs($admin)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
        'reason' => 'Khach doi y',
    ])->assertOk();

    $revAfter = (int) Cache::get('dashboard_source_revision', 1);
    expect($revAfter)->toBeGreaterThan($revBefore);
});

it('advances dashboard source revision on checkout mutation path', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    $revBefore = (int) Cache::get('dashboard_source_revision', 1);

    CheckoutService::run($order, [['method' => 'cash', 'amount' => 40000]], [], $admin->id);

    $revAfter = (int) Cache::get('dashboard_source_revision', 1);
    expect($revAfter)->toBeGreaterThan($revBefore);
});
