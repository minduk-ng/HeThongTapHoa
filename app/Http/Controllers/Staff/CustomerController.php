<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
        ]);

        $query = Customer::query()->orderBy('id', 'desc')->limit(20);

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where(function ($w) use ($q) {
                $w->where('phone', 'like', "%{$q}%")->orWhere('full_name', 'like', "%{$q}%");
            });
        }

        return response()->json([
            'ok' => true,
            'customers' => $query->get(['id', 'full_name', 'phone', 'note']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'full_name' => 'required|string|max:100',
            'phone' => 'required|string|max:15',
            'note' => 'nullable|string|max:255',
        ]);

        $existing = Customer::where('phone', $validated['phone'])->first();
        if ($existing) {
            return response()->json([
                'ok' => false,
                'error' => 'Số điện thoại đã tồn tại cho khách: '.$existing->full_name,
                'customer' => $existing->only(['id', 'full_name', 'phone', 'note']),
            ], 422);
        }

        $customer = Customer::create($validated + ['created_by' => $request->user()?->id]);

        return response()->json([
            'ok' => true,
            'customer' => $customer->only(['id', 'full_name', 'phone', 'note']),
        ]);
    }
}
