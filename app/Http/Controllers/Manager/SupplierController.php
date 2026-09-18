<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\StockVoucher;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use App\Models\SupplierPaymentAllocation;
use App\Services\IdempotencyGuard;
use App\Services\MoneyLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Supplier::query()->with('vouchers.items', 'vouchers.paymentAllocations');

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%"));
        }

        $suppliers = $query->orderBy('name')->get()->map(fn ($s) => [
            'id' => $s->id,
            'name' => $s->name,
            'phone' => $s->phone,
            'address' => $s->address,
            'note' => $s->note,
            'is_active' => $s->is_active,
            'debt' => $s->debt(),
            'unpaid_vouchers' => $s->vouchers
                ->filter(fn ($v) => $v->type === 'import' && $v->outstandingAmount() > 0)
                ->map(fn (StockVoucher $v) => [
                    'id' => $v->id,
                    'voucher_code' => $v->voucher_code,
                    'total' => $v->totalAmount(),
                    'outstanding' => $v->outstandingAmount(),
                    'transacted_at' => $v->transacted_at->format('d/m/Y H:i'),
                ])
                ->values()
                ->all(),
        ])->values();

        return Inertia::render('manager/suppliers/SuppliersManager', [
            'suppliers' => $suppliers,
            'filters' => $request->only(['search']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        Supplier::create($validated + ['is_active' => true]);

        return back()->with('success', 'Thêm nhà cung cấp thành công!');
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        $supplier->update($validated);

        return back()->with('success', 'Cập nhật nhà cung cấp thành công!');
    }

    public function destroy(Request $request, Supplier $supplier): RedirectResponse
    {
        $request->validate(['password' => 'required|string']);
        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $supplier->delete();

        return back()->with('success', 'Xóa nhà cung cấp thành công!');
    }

    public function storePayment(Request $request, Supplier $supplier): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|gt:0',
            'note' => 'nullable|string|max:255',
            'allocations' => 'required_without:voucher_ids|prohibits:voucher_ids|array|min:1',
            'allocations.*.voucher_id' => 'required|exists:stock_vouchers,id',
            'allocations.*.amount' => 'required|numeric|gt:0',
            'voucher_ids' => 'required_without:allocations|prohibits:allocations|array|min:1',
            'voucher_ids.*' => 'exists:stock_vouchers,id',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        $fp = [
            'supplier_id' => $supplier->id,
            'amount' => $validated['amount'],
        ];

        if ($response = IdempotencyGuard::check($request, 'supplier_payment', $fp)) {
            return $response;
        }

        try {
            DB::transaction(function () use ($validated, $supplier, $request) {
                // Chuẩn hoá về allocations[voucher_id => amount]; voucher_ids cũ = tất toán toàn phần.
                $raw = $validated['allocations'] ?? array_map(
                    fn ($id) => ['voucher_id' => $id], $validated['voucher_ids']
                );
                $allocInput = [];
                foreach ($raw as $row) {
                    $vid = (int) $row['voucher_id'];
                    if (isset($allocInput[$vid])) {
                        throw ValidationException::withMessages([
                            'allocations' => 'Mỗi phiếu chỉ được phân bổ một lần.',
                        ]);
                    }
                    $allocInput[$vid] = round((float) ($row['amount'] ?? 0), 2);
                }

                $vouchers = StockVoucher::whereIn('id', array_keys($allocInput))
                    ->lockForUpdate()->with('items')->get()->keyBy('id');
                // Khoá các dòng phân bổ hiện có để tổng allocated không race.
                $allocatedSoFar = SupplierPaymentAllocation::whereIn('voucher_id', array_keys($allocInput))
                    ->lockForUpdate()->get()->groupBy('voucher_id');

                // voucher_ids cũ: phân bổ = toàn bộ dư nợ còn lại.
                if (! isset($validated['allocations'])) {
                    foreach ($allocInput as $vid => $amount) {
                        $v = $vouchers->get($vid);
                        if (! $v || (int) $v->supplier_id !== (int) $supplier->id || $v->type !== 'import') {
                            throw ValidationException::withMessages([
                                'voucher_ids' => 'Phiếu nhập không thuộc nhà cung cấp này.',
                            ]);
                        }
                        $outstanding = round($v->totalAmount() - (float) ($allocatedSoFar->get($vid) ?? collect())->sum(fn ($a) => (float) $a->amount), 2);
                        if ($outstanding <= 0) {
                            throw ValidationException::withMessages([
                                'voucher_ids' => 'Phiếu đã được thanh toán hết.',
                            ]);
                        }
                        $allocInput[$vid] = $outstanding;
                    }
                }

                // So sánh theo cents (epsilon 0.005) thay vì === float để tránh lỗi làm tròn.
                if (abs(array_sum($allocInput) - (float) $validated['amount']) > 0.005) {
                    throw ValidationException::withMessages([
                        'amount' => 'Số tiền thanh toán phải bằng tổng phân bổ theo phiếu.',
                    ]);
                }

                $payment = SupplierPayment::create([
                    'supplier_id' => $supplier->id,
                    'amount' => $validated['amount'],
                    'paid_at' => now(),
                    'note' => $validated['note'] ?? null,
                    'created_by' => $request->user()?->id,
                ]);

                $allocMeta = [];
                foreach ($allocInput as $vid => $amount) {
                    $v = $vouchers->get($vid);
                    if (! $v || (int) $v->supplier_id !== (int) $supplier->id || $v->type !== 'import') {
                        throw ValidationException::withMessages([
                            'allocations' => 'Phiếu nhập không thuộc nhà cung cấp này.',
                        ]);
                    }
                    $outstanding = round($v->totalAmount() - (float) ($allocatedSoFar->get($vid) ?? collect())->sum(fn ($a) => (float) $a->amount), 2);
                    if ($amount > $outstanding) {
                        throw ValidationException::withMessages([
                            'allocations' => "Phân bổ vượt quá dư nợ còn lại của phiếu {$v->voucher_code} (còn ".number_format($outstanding, 0, ',', '.').' ₫).',
                        ]);
                    }

                    $payment->allocations()->create(['voucher_id' => $vid, 'amount' => $amount]);
                    $allocMeta[] = ['voucher_id' => $vid, 'amount' => $amount];

                    if (round($outstanding - $amount, 2) <= 0) {
                        $v->update(['is_paid' => true]);
                    }
                }

                app(MoneyLedgerService::class)->recordOut(
                    'supplier_payment', (float) $validated['amount'], 'cash', $request->user(),
                    ['supplier_id' => $supplier->id],
                    array_filter(['note' => $validated['note'] ?? null, 'allocations' => $allocMeta])
                );
            });

            $response = back()->with('success', 'Đã ghi nhận thanh toán công nợ!');

            return IdempotencyGuard::recordSuccess($request, 'supplier_payment', $response);
        } catch (\Throwable $e) {
            IdempotencyGuard::release($request, 'supplier_payment', $fp);
            throw $e;
        }
    }
}
