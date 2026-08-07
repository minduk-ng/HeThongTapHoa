<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Promotion;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
            'promotions' => $query->latest('id')->get(),
            'filters' => $request->only(['search']),
            'menu_items' => MenuItem::orderBy('name')->get(['id', 'name']),
            'menu_categories' => MenuCategory::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->merge($this->normalize($request->all()));

        Promotion::create($request->validate($this->rules()));

        return back()->with('success', 'Thêm khuyến mãi thành công!');
    }

    public function update(Request $request, Promotion $promotion): RedirectResponse
    {
        $request->merge($this->normalize($request->all()));

        $promotion->update($request->validate($this->rules($promotion)));

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
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalize(array $data): array
    {
        if (isset($data['code'])) {
            $data['code'] = mb_strtoupper(trim((string) $data['code']));
        }
        if (! empty($data['starts_at']) && strtotime((string) $data['starts_at']) !== false) {
            $data['starts_at'] = Carbon::parse($data['starts_at'])->startOfDay()->format('Y-m-d H:i:s');
        }
        if (! empty($data['expires_at']) && strtotime((string) $data['expires_at']) !== false) {
            $data['expires_at'] = Carbon::parse($data['expires_at'])->endOfDay()->format('Y-m-d H:i:s');
        }
        if (empty($data['target_type'])) {
            $data['target_type'] = 'order';
        }
        if ($data['target_type'] === 'order') {
            $data['target_value'] = null;
        }
        if (isset($data['target_value']) && $data['target_value'] !== '') {
            $data['target_value'] = (int) $data['target_value'];
        }
        return $data;
    }

    /**
     * @param Promotion|null $promotion
     * @return array<string, mixed>
     */
    private function rules(?Promotion $promotion = null): array
    {
        return [
            'code' => ['required', 'string', 'max:50', Rule::unique('promotions', 'code')->ignore($promotion?->id)],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'discount_type' => ['required', Rule::in(['percentage', 'fixed_amount'])],
            'discount_value' => ['required', 'numeric', 'min:0'],
            'target_type' => ['sometimes', 'string', Rule::in(['order', 'item', 'category'])],
            'target_value' => [Rule::requiredIf(fn () => in_array((string) request('target_type'), ['item', 'category'], true)), 'nullable', 'integer', 'min:1', function ($attribute, $value, $fail) {
                $type = request('target_type');
                if (in_array($type, ['item', 'category'], true) && ($value === null || $value === '')) {
                    $fail('Vui lòng chọn đối tượng áp dụng.');
                }
                if ($type === 'item' && $value !== null && ! MenuItem::whereKey($value)->exists()) {
                    $fail('Món được chọn không tồn tại.');
                }
                if ($type === 'category' && $value !== null && ! MenuCategory::whereKey($value)->exists()) {
                    $fail('Danh mục được chọn không tồn tại.');
                }
            }],
            'min_order_amount' => ['nullable', 'numeric', 'min:0'],
            'max_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'max_uses' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
