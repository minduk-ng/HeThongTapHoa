<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PromotionController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Promotion::with(['conditions', 'actions']);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('code', 'like', "%{$search}%"));
        }

        $statusFilter = $request->input('status', 'all');
        $now = now();
        if ($statusFilter === 'running') {
            $query->where('status', true)
                ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $now));
        } elseif ($statusFilter === 'ended') {
            $query->where(fn ($q) => $q->whereNotNull('end_date')->where('end_date', '<', $now));
        }

        $promotions = $query->latest('id')->get()->map(fn ($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'type' => $p->type,
            'code' => $p->code,
            'start_date' => $p->start_date?->format('d/m/Y'),
            'end_date' => $p->end_date?->format('d/m/Y'),
            'status' => $p->status,
            'used_count' => $p->used_count,
            'max_usage' => $p->max_usage,
            'exclusive' => $p->exclusive,
            'stackable' => $p->stackable,
            'conditions' => $p->conditions->map(fn ($c) => [
                'cond_type' => $c->cond_type, 'cond_value' => $c->cond_value,
            ])->values(),
            'actions' => $p->actions->map(fn ($a) => [
                'action_type' => $a->action_type,
                'action_value' => (float) $a->action_value,
                'max_discount_amount' => $a->max_discount_amount,
            ])->values(),
        ]);

        $stats = [
            'total_campaigns' => Promotion::count(),
            'total_orders' => 0, 'total_revenue' => 0,
            'total_discount' => 0, 'avg_discount' => 0, 'roi' => 0,
        ];

        return Inertia::render('manager/promotions/PromotionsManager', [
            'promotions' => $promotions,
            'stats' => $stats,
            'filters' => $request->only(['search', 'status']),
            'menu_items' => MenuItem::orderBy('name')->get(['id', 'name']),
            'menu_categories' => MenuCategory::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function analytics(Request $request): JsonResponse
    {
        $from = $request->input('from');
        $to = $request->input('to');

        $statsQuery = DB::table('daily_promotion_stats')
            ->join('promotions', 'promotions.id', '=', 'daily_promotion_stats.promotion_id')
            ->select(
                'promotions.id', 'promotions.name', 'promotions.type', 'promotions.code',
                DB::raw('SUM(daily_promotion_stats.order_count) as order_count'),
                DB::raw('SUM(daily_promotion_stats.revenue) as revenue'),
                DB::raw('SUM(daily_promotion_stats.discount_total) as discount_total'),
            );
        if ($from) {
            $statsQuery->where('daily_promotion_stats.stat_date', '>=', $from);
        }
        if ($to) {
            $statsQuery->where('daily_promotion_stats.stat_date', '<=', $to);
        }
        $statsQuery->groupBy('promotions.id', 'promotions.name', 'promotions.type', 'promotions.code');

        $campaigns = $statsQuery->get()->map(function ($row) {
            $revenue = (float) $row->revenue;
            $discount = (float) $row->discount_total;
            $roi = $discount > 0 ? ($revenue - $discount) / $discount : null;
            return [
                'id' => $row->id, 'name' => $row->name, 'type' => $row->type, 'code' => $row->code,
                'order_count' => (int) $row->order_count,
                'revenue' => $revenue,
                'discount_total' => $discount,
                'roi' => $roi,
                'roi_percent' => $roi === null ? null : round($roi * 100, 1),
            ];
        });

        $kpis = [
            'total_revenue' => (float) $campaigns->sum('revenue'),
            'total_orders' => (int) $campaigns->sum('order_count'),
            'total_discount' => (float) $campaigns->sum('discount_total'),
            'avg_discount' => $campaigns->sum('order_count') > 0
                ? round($campaigns->sum('discount_total') / $campaigns->sum('order_count'), 2) : 0,
            'roi' => (float) $campaigns->sum('discount_total') > 0
                ? round(($campaigns->sum('revenue') - $campaigns->sum('discount_total')) / $campaigns->sum('discount_total'), 2) : 0,
        ];

        $dailyQuery = DB::table('daily_promotion_stats');
        if ($from) $dailyQuery->where('stat_date', '>=', $from);
        if ($to) $dailyQuery->where('stat_date', '<=', $to);
        $daily = $dailyQuery->select('stat_date',
            DB::raw('SUM(order_count) as usage_count'),
            DB::raw('SUM(revenue) as revenue'))
            ->groupBy('stat_date')->orderBy('stat_date')->get()
            ->map(fn ($r) => ['date' => $r->stat_date, 'usage_count' => (int) $r->usage_count, 'revenue' => (float) $r->revenue])->values();

        $typeBreakdown = collect($campaigns)->groupBy('type')->map(function ($g, $type) {
            $total = (int) $g->sum('order_count');
            return ['type' => $type, 'count' => $total];
        })->values();
        $allCount = (int) $typeBreakdown->sum('count');
        $typeBreakdown = $typeBreakdown->map(fn ($t) => ['type' => $t['type'], 'count' => $t['count'], 'percent' => $allCount > 0 ? round($t['count'] / $allCount * 100, 1) : 0]);

        return response()->json([
            'kpis' => $kpis,
            'daily_chart' => $daily,
            'type_breakdown' => $typeBreakdown,
            'campaigns' => $campaigns,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated) {
            $promotion = Promotion::create([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
                'start_date' => ($validated['start_date'] ?? null) ? Carbon::parse($validated['start_date'])->startOfDay() : null,
                'end_date' => ($validated['end_date'] ?? null) ? Carbon::parse($validated['end_date'])->endOfDay() : null,
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
        $validated = $request->validate($this->rules($promotion));

        DB::transaction(function () use ($validated, $promotion) {
            $promotion->update([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
                'start_date' => ($validated['start_date'] ?? null) ? Carbon::parse($validated['start_date'])->startOfDay() : null,
                'end_date' => ($validated['end_date'] ?? null) ? Carbon::parse($validated['end_date'])->endOfDay() : null,
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
    private function rules(?Promotion $promotion = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::in(['promotion', 'coupon', 'voucher'])],
            'code' => ['nullable', 'string', 'max:50', Rule::requiredIf(fn () => in_array((string) request('type'), ['coupon', 'voucher'], true)), Rule::unique('promotions', 'code')->ignore($promotion?->id)],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'boolean'],
            'max_usage' => ['nullable', 'integer', 'min:1'],
            'exclusive' => ['sometimes', 'boolean'],
            'stackable' => ['sometimes', 'boolean'],
            'conditions' => ['nullable', 'array'],
            'conditions.*.cond_type' => ['required', Rule::in(['min_order_value', 'min_quantity', 'specific_product', 'specific_category'])],
            'conditions.*.cond_value' => ['required', 'string'],
            'actions' => ['required', 'array', 'min:1'],
            'actions.*.action_type' => ['required', Rule::in(['discount_percent', 'discount_amount', 'free_product'])],
            'actions.*.action_value' => ['required', 'numeric', 'min:0'],
            'actions.*.max_discount_amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
