<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Customer::query();

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $customers = $query
            ->withCount(['orders' => fn ($q) => $q->where('status', 'paid')])
            ->withSum(['orders' => fn ($q) => $q->where('status', 'paid')], 'total')
            ->orderBy('id', 'desc')
            ->get(['id', 'full_name', 'phone', 'note'])
            ->map(fn ($c) => [
                'id' => $c->id,
                'full_name' => $c->full_name,
                'phone' => $c->phone,
                'note' => $c->note,
                'orders_count' => (int) $c->orders_count,
                'total_spent' => (float) ($c->orders_sum_total ?? 0),
            ]);

        return Inertia::render('manager/customers/CustomersManager', [
            'customers' => $customers,
            'filters' => $request->only(['search']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => 'required|string|max:100',
            'phone' => 'required|string|max:15|unique:customers,phone',
            'note' => 'nullable|string|max:255',
        ]);

        $validated['created_by'] = $request->user()?->id;

        Customer::create($validated);

        return back()->with('success', 'Thêm khách hàng thành công!');
    }

    public function update(Request $request, Customer $customer): RedirectResponse
    {
        $validated = $request->validate([
            'full_name' => 'required|string|max:100',
            'phone' => 'required|string|max:15|unique:customers,phone,'.$customer->id,
            'note' => 'nullable|string|max:255',
        ]);

        $customer->update($validated);

        return back()->with('success', 'Cập nhật khách hàng thành công!');
    }

    public function destroy(Request $request, Customer $customer): RedirectResponse
    {
        $request->validate(['password' => 'required|string']);
        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $customer->delete();

        return back()->with('success', 'Xóa khách hàng thành công!');
    }
}
