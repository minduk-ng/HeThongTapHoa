<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\Shift;
use App\Models\StockVoucher;
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

    public function test_command_fresh_mock_cleans_transactional_data(): void
    {
        $this->artisan('data:generate-mock', ['--days' => 1, '--orders-per-day' => 2])
            ->assertSuccessful();

        $initialOrders = Order::count();
        $this->assertGreaterThan(0, $initialOrders);

        // Chạy lại với --fresh-mock
        $this->artisan('data:generate-mock', ['--days' => 1, '--orders-per-day' => 2, '--fresh-mock' => true])
            ->assertSuccessful();

        $this->assertGreaterThan(0, Order::count());
        $this->assertGreaterThan(0, Invoice::count());
    }
}
