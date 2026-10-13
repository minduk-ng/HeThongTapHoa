<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\MoneyLedgerEntry;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\StockVoucher;
use App\Models\SyntheticDataset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GenerateMockDataCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_generates_consistent_mock_data(): void
    {
        $this->artisan('data:generate-mock', ['--days' => 2, '--orders-per-day' => 3])
            ->assertSuccessful();

        $this->assertGreaterThan(0, Order::count());
        $this->assertGreaterThan(0, Invoice::count());
        $this->assertGreaterThan(0, StockVoucher::where('type', 'export')->count());
        $this->assertGreaterThan(0, StockVoucher::where('type', 'import')->count());
        $this->assertGreaterThan(0, Shift::count());

        // Kiểm tra khớp 1-1 giữa InvoiceLine và OrderItem của các đơn thành công
        $paidOrders = Order::where('status', 'paid')->get();
        foreach ($paidOrders as $order) {
            $invoice = $order->invoice;
            $this->assertNotNull($invoice);
            $activeItems = $order->items()->where('status', '!=', 'cancelled')->get();
            $this->assertEquals($activeItems->count(), $invoice->lines()->count());
        }

        // Kiểm tra phiếu xuất kho có định dạng PX- và note khớp invoice_code
        $exportVouchers = StockVoucher::where('type', 'export')->get();
        foreach ($exportVouchers as $voucher) {
            $this->assertStringStartsWith('PX-', $voucher->voucher_code);
            $this->assertStringContainsString('Xuất kho tự động cho Hoá đơn', (string) $voucher->note);
        }
    }

    public function test_fresh_mock_without_dataset_fails_with_nonzero_exit_code(): void
    {
        $this->artisan('data:generate-mock', ['--fresh-mock' => true])
            ->assertFailed();
    }

    public function test_fresh_mock_with_dataset_only_cleans_target_dataset_records(): void
    {
        // 1. Create a real invoice
        $real = Invoice::create([
            'invoice_code' => 'INV-REAL-MOCK',
            'table_name' => 'B01',
            'payment_method' => 'cash',
            'subtotal_amount' => 50000,
            'discount_amount' => 0,
            'vat_amount' => 0,
            'total_amount' => 50000,
            'amount_received' => 50000,
            'change_amount' => 0,
            'issued_at' => now(),
            'synthetic_dataset_id' => null,
        ]);

        // 2. Generate dataset 1
        $this->artisan('data:generate-mock', ['--dataset' => 'dataset-one', '--days' => 3, '--seed' => 42])
            ->assertSuccessful();

        $ds1 = SyntheticDataset::where('name', 'dataset-one')->firstOrFail();
        $ds1InvoicesCount = Invoice::where('synthetic_dataset_id', $ds1->id)->count();
        $this->assertGreaterThan(0, $ds1InvoicesCount);

        // 3. Generate dataset 2
        $this->artisan('data:generate-mock', ['--dataset' => 'dataset-two', '--days' => 3, '--seed' => 43])
            ->assertSuccessful();

        $ds2 = SyntheticDataset::where('name', 'dataset-two')->firstOrFail();
        $ds2InvoicesCount = Invoice::where('synthetic_dataset_id', $ds2->id)->count();
        $this->assertGreaterThan(0, $ds2InvoicesCount);

        // 4. Re-run dataset 1 with --fresh-mock
        $this->artisan('data:generate-mock', ['--dataset' => 'dataset-one', '--fresh-mock' => true, '--days' => 2, '--seed' => 42])
            ->assertSuccessful();

        // 5. Assert: real invoice untouched, dataset 2 untouched
        $this->assertNotNull(Invoice::find($real->id));
        $this->assertEquals($ds2InvoicesCount, Invoice::where('synthetic_dataset_id', $ds2->id)->count());
    }

    public function test_dataset_option_creates_synthetic_invoices_without_payments_or_money_ledger(): void
    {
        $this->artisan('data:generate-mock', ['--dataset' => 'analytical-demo', '--days' => 5, '--seed' => 100])
            ->assertSuccessful();

        $dataset = SyntheticDataset::where('name', 'analytical-demo')->firstOrFail();
        $invoices = Invoice::where('synthetic_dataset_id', $dataset->id)->get();

        $this->assertNotEmpty($invoices);
        foreach ($invoices as $invoice) {
            $this->assertStringStartsWith('SYN-', $invoice->invoice_code);
            $this->assertEquals(0, Payment::where('invoice_id', $invoice->id)->count());
            $this->assertEquals(0, MoneyLedgerEntry::where('invoice_id', $invoice->id)->count());
        }
    }
}
