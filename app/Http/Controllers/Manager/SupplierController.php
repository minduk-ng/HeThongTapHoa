<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\StockVoucher;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Supplier::query()->with('vouchers.items');

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
                ->filter(fn ($v) => $v->type === 'import' && ! $v->is_paid)
                ->map(fn ($v) => [
                    'id' => $v->id,
                    'voucher_code' => $v->voucher_code,
                    'total' => (float) $v->items->sum(fn ($i) => (float) $i->quantity * (float) $i->unit_price),
                    'transacted_at' => $v->transacted_at->format('d/m/Y H:i'),
                ])
                ->values(),
        ]);

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

    public function storePayment(Request $request, Supplier $supplier): RedirectResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|gt:0',
            'note' => 'nullable|string|max:255',
            'voucher_ids' => 'required|array|min:1',
            'voucher_ids.*' => 'exists:stock_vouchers,id',
        ]);

        DB::transaction(function () use ($validated, $supplier, $request) {
            SupplierPayment::create([
                'supplier_id' => $supplier->id,
                'amount' => $validated['amount'],
                'paid_at' => now(),
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            StockVoucher::whereIn('id', $validated['voucher_ids'])
                ->where('supplier_id', $supplier->id)
                ->update(['is_paid' => true]);
        });

        return back()->with('success', 'Đã ghi nhận thanh toán công nợ!');
    }
}
