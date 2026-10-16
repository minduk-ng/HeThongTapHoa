<?php

use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\SyntheticDataset;
use App\Services\Manager\PaidProductRankingService;
use Carbon\Carbon;

it('ranks by stable product id with refund and tie rules', function () {
    $a = posMenuItem(['name' => 'Chung']);
    $b = posMenuItem(['name' => 'Chung']);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => now(),
        'total_amount' => 80000,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $a->id,
        'name_snapshot' => 'Chung',
        'quantity' => 5,
        'unit_price' => 10000,
        'subtotal' => 50000,
        'refunded_qty' => 2,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $b->id,
        'name_snapshot' => 'Chung',
        'quantity' => 3,
        'unit_price' => 10000,
        'subtotal' => 30000,
        'refunded_qty' => 0,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    // net: A=3, B=3 -> tie broken by smaller id first; separate rows despite same name
    expect($result['items'])->toHaveCount(2);
    expect($result['items'][0]['product_id'])->toBe(min($a->id, $b->id));
    expect($result['items'][0]['sales_count'])->toBe(3);
    expect($result['items'][1]['product_id'])->toBe(max($a->id, $b->id));
    expect($result['items'][1]['sales_count'])->toBe(3);
    expect($result['metadata']['source'])->toBe('paid_invoice_lines_net_v1');
    expect($result['metadata']['refund_basis'])->toBe('invoice_line_refunded_qty');
});

it('tracks unidentified lines in metadata without polluting rankings', function () {
    $item = posMenuItem(['name' => 'Mon Ro Rang']);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'card',
        'issued_at' => now(),
        'total_amount' => 100000,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Mon Ro Rang',
        'quantity' => 4,
        'unit_price' => 20000,
        'subtotal' => 80000,
        'refunded_qty' => 1,
    ]);

    // Unidentified line with null menu_item_id
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => null,
        'name_snapshot' => 'Khong Ro ID',
        'quantity' => 5,
        'unit_price' => 10000,
        'subtotal' => 50000,
        'refunded_qty' => 2,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    expect($result['items'])->toHaveCount(1);
    expect($result['items'][0]['product_id'])->toBe($item->id);
    expect($result['items'][0]['sales_count'])->toBe(3);
    expect($result['metadata']['unidentified_line_count'])->toBe(1);
    expect($result['metadata']['unidentified_net_quantity'])->toBe(3);
});

it('excludes synthetic invoices', function () {
    $item = posMenuItem(['name' => 'Mon Synthetic']);

    $dataset = SyntheticDataset::create([
        'name' => 'Test Dataset',
        'seed' => 42,
        'configuration' => [],
        'configuration_hash' => 'config-hash',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'data-hash',
    ]);

    $syntheticInvoice = Invoice::create([
        'invoice_code' => 'INV-SYN-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => now(),
        'total_amount' => 50000,
        'synthetic_dataset_id' => $dataset->id,
    ]);

    InvoiceLine::create([
        'invoice_id' => $syntheticInvoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Mon Synthetic',
        'quantity' => 10,
        'unit_price' => 5000,
        'subtotal' => 50000,
        'refunded_qty' => 0,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    expect($result['items'])->toBeEmpty();
    expect($result['metadata']['unidentified_line_count'])->toBe(0);
});

it('excludes invoices without valid payment method', function () {
    $item = posMenuItem(['name' => 'Chua Thanh Toan']);

    $invoiceNullMethod = Invoice::create([
        'invoice_code' => 'INV-NULL-'.uniqid(),
        'payment_method' => '',
        'issued_at' => now(),
        'total_amount' => 50000,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoiceNullMethod->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Chua Thanh Toan',
        'quantity' => 5,
        'unit_price' => 10000,
        'subtotal' => 50000,
        'refunded_qty' => 0,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    expect($result['items'])->toBeEmpty();
});

it('does not reduce units for amount-only refunds where refunded_qty is zero', function () {
    $item = posMenuItem(['name' => 'Mon Refund Tien']);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'transfer',
        'issued_at' => now(),
        'total_amount' => 50000,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Mon Refund Tien',
        'quantity' => 6,
        'unit_price' => 10000,
        'subtotal' => 60000,
        'refunded_qty' => 0, // amount-only refund keeps refunded_qty = 0
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    expect($result['items'][0]['sales_count'])->toBe(6);
});

it('tracks invalid lines with negative quantity or excessive refund in metadata and omits zero-net lines', function () {
    $validItem = posMenuItem(['name' => 'Hop Le']);
    $zeroNetItem = posMenuItem(['name' => 'Net Zero']);
    $brokenItem = posMenuItem(['name' => 'Hong']);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => now(),
        'total_amount' => 100000,
    ]);

    // Valid line
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $validItem->id,
        'name_snapshot' => 'Hop Le',
        'quantity' => 5,
        'unit_price' => 10000,
        'subtotal' => 50000,
        'refunded_qty' => 1,
    ]);

    // Zero-net line: qty 2, refunded 2 -> net 0, omitted
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $zeroNetItem->id,
        'name_snapshot' => 'Net Zero',
        'quantity' => 2,
        'unit_price' => 10000,
        'subtotal' => 20000,
        'refunded_qty' => 2,
    ]);

    // Invalid line 1: negative quantity
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $brokenItem->id,
        'name_snapshot' => 'Am',
        'quantity' => -2,
        'unit_price' => 10000,
        'subtotal' => -20000,
        'refunded_qty' => 0,
    ]);

    // Invalid line 2: refund > quantity
    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $brokenItem->id,
        'name_snapshot' => 'Qua Refund',
        'quantity' => 3,
        'unit_price' => 10000,
        'subtotal' => 30000,
        'refunded_qty' => 5,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        now()->startOfDay(),
        now()->addDay()->startOfDay(),
        5
    );

    expect($result['items'])->toHaveCount(1);
    expect($result['items'][0]['product_id'])->toBe($validItem->id);
    expect($result['items'][0]['sales_count'])->toBe(4);
    expect($result['metadata']['invalid_line_count'])->toBe(2);
});

it('uses latest snapshot name by issued_at and line_id with fallback to Mon #id', function () {
    $item1 = posMenuItem();
    $item2 = posMenuItem();

    $inv1 = Invoice::create([
        'invoice_code' => 'INV-1-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 10:00:00'),
        'total_amount' => 50000,
    ]);

    $inv2 = Invoice::create([
        'invoice_code' => 'INV-2-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 14:00:00'),
        'total_amount' => 50000,
    ]);

    // Older line with old name
    InvoiceLine::create([
        'invoice_id' => $inv1->id,
        'menu_item_id' => $item1->id,
        'name_snapshot' => 'Tra Dao Cu',
        'quantity' => 2,
        'unit_price' => 20000,
        'subtotal' => 40000,
        'refunded_qty' => 0,
    ]);

    // Newer line with new name
    InvoiceLine::create([
        'invoice_id' => $inv2->id,
        'menu_item_id' => $item1->id,
        'name_snapshot' => 'Tra Dao Moi',
        'quantity' => 3,
        'unit_price' => 20000,
        'subtotal' => 60000,
        'refunded_qty' => 0,
    ]);

    // Item 2 has empty name_snapshot
    InvoiceLine::create([
        'invoice_id' => $inv2->id,
        'menu_item_id' => $item2->id,
        'name_snapshot' => '   ',
        'quantity' => 1,
        'unit_price' => 20000,
        'subtotal' => 20000,
        'refunded_qty' => 0,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        5
    );

    $item1Row = collect($result['items'])->firstWhere('product_id', $item1->id);
    $item2Row = collect($result['items'])->firstWhere('product_id', $item2->id);

    expect($item1Row['name'])->toBe('Tra Dao Moi');
    expect($item2Row['name'])->toBe('Món #'.$item2->id);
});

it('respects half-open interval [startInclusive, endExclusive)', function () {
    $item = posMenuItem();

    $invBefore = Invoice::create([
        'invoice_code' => 'INV-B-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-15 23:59:59'),
        'total_amount' => 10000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invBefore->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Before',
        'quantity' => 1,
        'unit_price' => 10000,
        'subtotal' => 10000,
        'refunded_qty' => 0,
    ]);

    $invStart = Invoice::create([
        'invoice_code' => 'INV-S-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 00:00:00'),
        'total_amount' => 10000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invStart->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'At Start',
        'quantity' => 2,
        'unit_price' => 10000,
        'subtotal' => 20000,
        'refunded_qty' => 0,
    ]);

    $invEnd = Invoice::create([
        'invoice_code' => 'INV-E-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-17 00:00:00'),
        'total_amount' => 10000,
    ]);
    InvoiceLine::create([
        'invoice_id' => $invEnd->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'At End',
        'quantity' => 4,
        'unit_price' => 10000,
        'subtotal' => 40000,
        'refunded_qty' => 0,
    ]);

    $result = app(PaidProductRankingService::class)->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        5
    );

    expect($result['items'])->toHaveCount(1);
    expect($result['items'][0]['sales_count'])->toBe(2);
});

it('matches full-sort oracle exactly for top-k selection with tie-breakers and chunks', function () {
    $invoice = Invoice::create([
        'invoice_code' => 'INV-ORACLE-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 12:00:00'),
        'total_amount' => 1000000,
    ]);

    // Create 15 products with predefined sales counts, including intentional ties
    $salesDistribution = [
        1 => 10,
        2 => 25,
        3 => 5,
        4 => 25, // tie with 2, product_id 2 < 4 so 2 should rank ahead
        5 => 12,
        6 => 18,
        7 => 18, // tie with 6, product_id 6 < 7
        8 => 2,
        9 => 30,
        10 => 30, // tie with 9, product_id 9 < 10
        11 => 15,
        12 => 8,
        13 => 22,
        14 => 1,
        15 => 25, // 3-way tie: 2, 4, 15
    ];

    $items = [];
    foreach ($salesDistribution as $idx => $sales) {
        $menuItem = posMenuItem(['name' => "Product {$idx}"]);
        $items[$idx] = $menuItem;

        // Split into two invoice lines: one with initial qty, one with refund
        InvoiceLine::create([
            'invoice_id' => $invoice->id,
            'menu_item_id' => $menuItem->id,
            'name_snapshot' => "Product {$idx}",
            'quantity' => $sales + 2,
            'unit_price' => 10000,
            'subtotal' => ($sales + 2) * 10000,
            'refunded_qty' => 2,
        ]);
    }

    // Build the oracle full-sort expectation
    $expectedSorted = collect($salesDistribution)->map(function ($count, $idx) use ($items) {
        return [
            'product_id' => $items[$idx]->id,
            'name' => "Product {$idx}",
            'sales_count' => $count,
        ];
    })->sort(function ($a, $b) {
        if ($a['sales_count'] !== $b['sales_count']) {
            return $b['sales_count'] <=> $a['sales_count'];
        }

        return $a['product_id'] <=> $b['product_id'];
    })->values();

    $service = app(PaidProductRankingService::class);

    // Test different K values: 5, 10, 20
    foreach ([5, 10, 20] as $k) {
        $result = $service->rank(
            Carbon::parse('2026-10-16 00:00:00'),
            Carbon::parse('2026-10-17 00:00:00'),
            $k
        );

        $expectedK = $expectedSorted->take($k)->values()->all();
        expect($result['items'])->toEqual($expectedK);
    }
});

it('handles bounded K edge cases including zero K and fewer than K products', function () {
    $item = posMenuItem(['name' => 'Duy Nhat']);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-K-'.uniqid(),
        'payment_method' => 'cash',
        'issued_at' => Carbon::parse('2026-10-16 12:00:00'),
        'total_amount' => 20000,
    ]);

    InvoiceLine::create([
        'invoice_id' => $invoice->id,
        'menu_item_id' => $item->id,
        'name_snapshot' => 'Duy Nhat',
        'quantity' => 2,
        'unit_price' => 10000,
        'subtotal' => 20000,
        'refunded_qty' => 0,
    ]);

    $service = app(PaidProductRankingService::class);

    // K = 0 -> empty items
    $resZero = $service->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        0
    );
    expect($resZero['items'])->toBeEmpty();
    expect($resZero['metadata']['source'])->toBe('paid_invoice_lines_net_v1');

    // K = 5 with only 1 eligible item -> returns 1 item
    $resFive = $service->rank(
        Carbon::parse('2026-10-16 00:00:00'),
        Carbon::parse('2026-10-17 00:00:00'),
        5
    );
    expect($resFive['items'])->toHaveCount(1);
    expect($resFive['items'][0]['product_id'])->toBe($item->id);
    expect($resFive['metadata']['generated_at'])->not->toBeEmpty();
});
