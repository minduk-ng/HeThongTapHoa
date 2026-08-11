<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\MenuCategory;
use App\Services\Checkout\CheckoutService;

test('checkout 1 don: invoice + payments + lines + promotion snapshot, dung VAT trong gia', function () {
    $this->actingAs(posAdmin());
    $cat = MenuCategory::firstOrCreate(['name' => 'Cat CS', 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'name' => 'Cf den', 'price' => 50000, 'vat_rate' => 10]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'name' => 'Tra', 'price' => 20000, 'vat_rate' => 0]);
    $promo = promoV2(['type' => 'coupon', 'code' => 'CS10']);
    addAction($promo, 'discount_percent', 10);

    $table = posTable(['table_number' => 'B50']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 2, 'price' => 50000, 'status' => 'completed'],
        ['item' => $itemB, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'completed']);

    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 108000]],
        [$promo->code],
        auth()->id()
    );

    // subtotal = 120000; discount = 12000; total = 108000
    expect((float) $invoice->subtotal_amount)->toBe(120000.0);
    expect((float) $invoice->discount_amount)->toBe(12000.0);
    expect((float) $invoice->total_amount)->toBe(108000.0);

    // VAT trong gia: itemA 2*50000=100000, net=floor(100000/1.1)=90909, vat=9091
    expect((float) $invoice->vat_amount)->toBe(9091.0);

    // lines
    expect($invoice->fresh()->lines)->toHaveCount(2);
    $lineA = $invoice->lines->firstWhere('menu_item_id', $itemA->id);
    expect($lineA->name_snapshot)->toBe('Cf den');
    expect((float) $lineA->subtotal)->toBe(100000.0);
    expect((float) $lineA->vat_amount)->toBe(9091.0);

    // payments
    expect($invoice->payments)->toHaveCount(1);
    expect((float) $invoice->payments->first()->amount)->toBe(108000.0);

    // promotion snapshot
    expect($invoice->promotions)->toHaveCount(1);
    expect($invoice->promotions->first()->code)->toBe('CS10');
    expect((float) $invoice->promotions->first()->amount)->toBe(12000.0);

    // order updated
    expect($order->fresh()->status)->toBe('paid');
    expect((float) $order->fresh()->total)->toBe(108000.0);
});

test('checkout split payment nhieu phuong thuc', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 50000], ['method' => 'bank_transfer', 'amount' => 50000, 'reference' => 'FT12345']],
        [],
        auth()->id()
    );

    expect($invoice->payments)->toHaveCount(2);
    expect($invoice->payment_method)->toBe('mixed');
    expect((float) $invoice->total_amount)->toBe(100000.0);
});

test('checkout ap coc: deposit applied va link payment', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    // payable = 100k - 30k coc = 70k → chi can thu 70k
    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 70000]],
        [],
        auth()->id()
    );

    expect($deposit->fresh()->status)->toBe('applied');
    expect($invoice->payments()->where('method', 'cash')->count())->toBe(2); // coc 30k + thanh toan 70k
    $depositPayment = $invoice->payments->firstWhere('amount', 30000.0);
    expect($depositPayment)->not->toBeNull();
    expect($deposit->fresh()->payment_id)->toBe($depositPayment->id);
});

test('checkout refresh subtotal va vat_amount cho order (khong lech sau reduce)', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 10]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);

    // Giả lập: order subtotal snapshot cũ lệch (như sau reduce-items)
    $order->update(['subtotal' => 90000, 'vat_amount' => 0, 'total' => 90000]);

    $invoice = CheckoutService::run($order, [['method' => 'cash', 'amount' => 60000]], [], auth()->id());

    $fresh = $order->fresh();
    expect((float) $fresh->subtotal)->toBe(60000.0);       // 2 x 30000
    expect((float) $fresh->discount_amount)->toBe(0.0);
    expect((float) $fresh->total)->toBe(60000.0);
    // VAT trong giá: 60000 -> net=floor(60000/1.1)=54545, vat=5455
    expect((float) $fresh->vat_amount)->toBe(5455.0);
});

test('checkout coc du total ghi payment refund am va expectedCash giam', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    Deposit::create(['order_id' => $order->id, 'amount' => 150000, 'method' => 'cash', 'status' => 'held']);

    $invoice = CheckoutService::run($order, [['method' => 'cash', 'amount' => 0]], [], auth()->id());

    // payment refund row: amount = -(150000 - 100000) = -50000
    $refund = $invoice->payments()->where('amount', '<', 0)->first();
    expect($refund)->not->toBeNull();
    expect((float) $refund->amount)->toBe(-50000.0);
    expect($refund->note)->toBe('Hoàn tiền cọc thừa');
});

test('checkout rollback khi promotion khong con hop le', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'EXP', 'end_date' => now()->subDay()]);
    addAction($promo, 'discount_amount', 10000);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    try {
        CheckoutService::run($order, [['method' => 'cash', 'amount' => 90000]], [$promo->code], auth()->id());
        $this->fail('Phai nem exception');
    } catch (Exception $e) {
        expect(Invoice::count())->toBe(0);
        expect($order->fresh()->status)->toBe('completed');
    }
});
