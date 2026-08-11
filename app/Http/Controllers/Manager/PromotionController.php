<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Promotion;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PromotionController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Promotion::query();

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(fn ($q) => $q
                ->where('code', 'like', "%{$search}%")
                ->orWhere('name', 'like', "%{$search}%"));
        }

        return Inertia::render('manager/promotions/PromotionsManager', [
            'promotions' => $query->with(['conditions', 'actions'])->latest('id')->get(),
            'filters' => $request->only(['search']),
            'menu_items' => MenuItem::orderBy('name')->get(['id', 'name']),
            'menu_categories' => MenuCategory::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated) {
            $promotion = Promotion::create([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : mb_strtoupper(trim($validated['code'] ?? '')),
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $validated['max_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
            ]);

            foreach ($validated['conditions'] ?? [] as $cond) {
                $promotion->conditions()->create($cond);
            }
            foreach ($validated['actions'] as $action) {
                $promotion->actions()->create([
                    'action_type' => $action['action_type'],
                    'action_value' => $action['action_value'],
                    'max_discount_amount' => $action['max_discount_amount'] ?? null,
                ]);
            }
        });

        return back()->with('success', 'Thêm khuyến mãi thành công!');
    }

    public function update(Request $request, Promotion $promotion): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated, $promotion) {
            $promotion->update([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : mb_strtoupper(trim($validated['code'] ?? '')),
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $validated['max_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
            ]);

            // Xoá conditions/actions cũ rồi tạo lại (update đơn giản, ít data)
            $promotion->conditions()->delete();
            $promotion->actions()->delete();
            foreach ($validated['conditions'] ?? [] as $cond) {
                $promotion->conditions()->create($cond);
            }
            foreach ($validated['actions'] as $action) {
                $promotion->actions()->create([
                    'action_type' => $action['action_type'],
                    'action_value' => $action['action_value'],
                    'max_discount_amount' => $action['max_discount_amount'] ?? null,
                ]);
            }
        });

        return back()->with('success', 'Cập nhật khuyến mãi thành công!');
    }

    public function destroy(Request $request, Promotion $promotion): RedirectResponse
    {
        $request->validate(['password' => 'required|string']);

        if (! Hash::check((string) $request->input('password'), (string) $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $promotion->delete();

        return back()->with('success', 'Xóa khuyến mãi thành công!');
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::in(['promotion', 'coupon', 'voucher'])],
            'code' => ['nullable', 'string', 'max:50'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'boolean'],
            'max_usage' => ['nullable', 'integer', 'min:1'],
            'exclusive' => ['sometimes', 'boolean'],
            'stackable' => ['sometimes', 'boolean'],
            'conditions' => ['nullable', 'array'],
            'conditions.*.cond_type' => ['required', Rule::in(['min_order_value', 'min_quantity', 'specific_product'])],
            'conditions.*.cond_value' => ['required', 'string'],
            'actions' => ['required', 'array', 'min:1'],
            'actions.*.action_type' => ['required', Rule::in(['discount_percent', 'discount_amount', 'free_product'])],
            'actions.*.action_value' => ['required', 'numeric', 'min:0'],
            'actions.*.max_discount_amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
