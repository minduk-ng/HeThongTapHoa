<?php

use App\Models\Ingredient;
use App\Models\InvoiceLine;
use App\Models\MoneyLedgerEntry;
use App\Models\Shift;
use App\Models\StockVoucher;
use App\Models\Supplier;
use App\Services\MoneyLedgerService;
use Illuminate\Support\Facades\Cache;

test('large cash out is append only and warned', function () {
    $admin = posAdmin();
    $entry = app(MoneyLedgerService::class)->recordOut(
        'order_refund', 1_000_000, 'cash', $admin, [], ['source_method' => 'bank_transfer']
    );

    expect($entry->direction)->toBe('out')
        ->and($entry->warning_flags)->toContain('large_cash_out')
        ->and($entry->warning_flags)->toContain('bank_to_cash_refund');
});

test('small bank sale has no warnings and links actor plus open shift', function () {
    $admin = posAdmin();
    $shift = Shift::create(['opened_at' => now(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => $admin->id]);

    $entry = app(MoneyLedgerService::class)->recordIn('sale', 50000, 'bank_transfer', $admin);

    expect($entry->direction)->toBe('in')
        ->and($entry->warning_flags)->toBe([])
        ->and($entry->actor_id)->toBe($admin->id)
        ->and($entry->shift_id)->toBe($shift->id);
});

test('ledger rejects non-positive amounts', function () {
    $admin = posAdmin();

    expect(fn () => app(MoneyLedgerService::class)->recordIn('sale', 0, 'cash', $admin))
        ->toThrow(InvalidArgumentException::class);
    expect(fn () => app(MoneyLedgerService::class)->recordOut('order_refund', -100, 'cash', $admin))
        ->toThrow(InvalidArgumentException::class);
});

test('ledger rejects unknown types', function () {
    $admin = posAdmin();

    expect(fn () => app(MoneyLedgerService::class)->recordIn('hack_money', 1000, 'cash', $admin))
        ->toThrow(InvalidArgumentException::class);
});

test('money ledger entries cannot be updated or deleted', function () {
    $admin = posAdmin();
    $entry = app(MoneyLedgerService::class)->recordIn('sale', 20000, 'cash', $admin);

    expect(fn () => $entry->update(['amount' => 1]))->toThrow(LogicException::class);
    expect(fn () => $entry->delete())->toThrow(LogicException::class);
    expect(MoneyLedgerEntry::count())->toBe(1);
});

test('cash-flow page requires cash-flow.view permission', function () {
    $staff = posStaff(['pos.view'], ['/staff/pos']);
    $this->actingAs($staff)->get('/manager/cash-flow')->assertForbidden();

    $viewer = posStaff(['cash-flow.view'], ['/manager/cash-flow']);
    Cache::forget('system_page_roles');
    $this->actingAs($viewer)->get('/manager/cash-flow')->assertOk();
    $this->actingAs($viewer)->get('/manager/cash-flow?only_warnings=1&type=order_refund&direction=out')->assertOk();

    $this->actingAs(posAdmin())->get('/manager/cash-flow')->assertOk();
});

test('checkout writes sale and cash_change ledger rows', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 60000,
    ])->assertOk();

    expect(MoneyLedgerEntry::where('type', 'sale')->where('direction', 'in')->count())->toBe(1)
        ->and(MoneyLedgerEntry::where('type', 'cash_change')->where('direction', 'out')->count())->toBe(1);
});

test('refund writes order_refund ledger row', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'payments.refund'], ['/staff/pos']);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 50000,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    $line = InvoiceLine::where('invoice_id', $invoice->id)->first();

    $this->actingAs($staff)->postJson('/staff/pos/refund', [
        'invoice_id' => $invoice->id,
        'items' => [['invoice_line_id' => $line->id, 'qty' => 1]],
        'reason' => 'Hàng lỗi',
    ])->assertOk();

    expect(MoneyLedgerEntry::where('type', 'order_refund')->where('direction', 'out')->count())->toBe(1);
});

test('deposit and supplier payment and shift movement write ledger rows', function () {
    $staff = posStaff(
        ['pos.view', 'pos.create', 'deposits.create', 'suppliers.view', 'suppliers.pay', 'shifts.view', 'shifts.movement'],
        ['/staff/pos', '/manager/suppliers', '/staff/shifts']
    );
    Shift::create(['opened_at' => now(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => $staff->id]);

    $order = posOrder(posTable(['status' => 'occupied']), [], ['status' => 'pending']);
    $this->actingAs($staff)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 50000, 'method' => 'cash',
    ])->assertOk();

    $this->actingAs($staff)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'khac', 'amount' => 10000,
    ])->assertOk();

    $supplier = Supplier::create(['name' => 'NCC '.uniqid()]);
    $ingredient = Ingredient::create(['name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0]);
    $voucher = StockVoucher::create([
        'voucher_code' => 'PN-'.uniqid(), 'type' => 'import',
        'supplier_id' => $supplier->id, 'is_paid' => false, 'transacted_at' => now(),
    ]);
    $voucher->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 2, 'unit_price' => 50000]);

    $this->actingAs($staff)->post("/manager/suppliers/{$supplier->id}/payments", [
        'amount' => 100000, 'voucher_ids' => [$voucher->id],
    ])->assertStatus(302);

    expect(MoneyLedgerEntry::where('type', 'deposit')->count())->toBe(1)
        ->and(MoneyLedgerEntry::where('type', 'shift_expense')->count())->toBe(1)
        ->and(MoneyLedgerEntry::where('type', 'supplier_payment')->count())->toBe(1);
});
