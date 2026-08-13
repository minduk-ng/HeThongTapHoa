<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\InvoicePromotion;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Promotion;
use App\Models\PromotionCode;
use App\Services\Promotions\PromotionCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
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

        $query->withCount(['codes as codes_count', 'codes as codes_used' => fn ($q) => $q->where('status', 'used')]);

        $promotions = $query->latest('id')->get()->map(fn ($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'type' => $p->type,
            'code' => $p->code,
            'code_prefix' => $p->code_prefix,
            'code_quantity' => $p->code_quantity,
            'code_random' => (bool) $p->code_random,
            'codes_count' => $p->codes_count ?? 0,
            'codes_used' => $p->codes_used ?? 0,
            'start_date' => $p->start_date?->format('d/m/Y'),
            'end_date' => $p->end_date?->format('d/m/Y'),
            'status' => $p->status,
            'used_count' => $p->used_count,
            'max_usage' => $p->max_usage,
            'target_usage' => $p->target_usage,
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

        // Doanh thu campaign = full doanh thu hoá đơn distinct có dùng mã đó (không phân bổ theo discount,
        // dù 1 hoá đơn dùng nhiều mã vẫn gán full cho mỗi mã — overlap có chủ đích để xem theo từng campaign).
        // discount_total vẫn lấy từ daily_promotion_stats (tổng giảm thật của mã).
        $revenueAgg = DB::table(DB::raw('(SELECT DISTINCT ip.promotion_id, ip.invoice_id, invoices.total_amount
                FROM invoice_promotions ip
                JOIN invoices ON invoices.id = ip.invoice_id
                WHERE ip.promotion_id IS NOT NULL) as t'))
            ->select('promotion_id', DB::raw('SUM(total_amount) as revenue'))
            ->groupBy('promotion_id')
            ->get()
            ->keyBy('promotion_id');

        $discountAgg = DB::table('daily_promotion_stats')
            ->select('promotion_id', DB::raw('SUM(discount_total) as discount_total'))
            ->groupBy('promotion_id')
            ->get()
            ->keyBy('promotion_id');

        $promotions = $promotions->map(function ($p) use ($revenueAgg, $discountAgg) {
            $rev = $revenueAgg->get($p['id']);
            $disc = $discountAgg->get($p['id']);
            $p['revenue'] = $rev ? (float) $rev->revenue : 0.0;
            $p['discount_total'] = $disc ? (float) $disc->discount_total : 0.0;

            return $p;
        });

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
        $search = $request->input('search');
        $status = $request->input('status', 'all');

        // Lọc cùng tập campaign như bảng Campaign Performance (search + status)
        $promotionIds = $this->filteredPromotionIds($search, $status);

        $statsQuery = DB::table('daily_promotion_stats')
            ->join('promotions', 'promotions.id', '=', 'daily_promotion_stats.promotion_id')
            ->select(
                'promotions.id', 'promotions.name', 'promotions.type', 'promotions.code',
                DB::raw('SUM(daily_promotion_stats.order_count) as order_count'),
                DB::raw('SUM(daily_promotion_stats.revenue) as revenue'),
                DB::raw('SUM(daily_promotion_stats.discount_total) as discount_total'),
            )
            ->whereNull('promotions.deleted_at')
            ->whereIn('daily_promotion_stats.promotion_id', $promotionIds);
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
            // Doanh thu = tổng HOÁ ĐƠN DISTINCT có dùng ít nhất 1 KM (1 hoá đơn nhiều mã vẫn tính 1 lần).
            // Lượt dùng = tổng lượt áp dụng KM (mỗi mã trên 1 hoá đơn tính 1 lượt) — khớp biểu đồ daily/pie.
            'total_revenue' => $this->distinctInvoiceRevenue($from, $to, $promotionIds),
            'total_orders' => (int) $campaigns->sum('order_count'),
            'total_discount' => (float) $campaigns->sum('discount_total'),
            'avg_discount' => $campaigns->sum('order_count') > 0
                ? round($campaigns->sum('discount_total') / $campaigns->sum('order_count'), 2) : 0,
            'roi' => (float) $campaigns->sum('discount_total') > 0
                ? round(($this->distinctInvoiceRevenue($from, $to, $promotionIds) - $campaigns->sum('discount_total')) / $campaigns->sum('discount_total'), 2) : 0,
        ];

        $dailyQuery = DB::table('daily_promotion_stats')->whereIn('promotion_id', $promotionIds);
        if ($from) {
            $dailyQuery->where('stat_date', '>=', $from);
        }
        if ($to) {
            $dailyQuery->where('stat_date', '<=', $to);
        }
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

    /**
     * Danh sách promotion id khớp bộ lọc search + status — cùng logic như index().
     *
     * @return array<int>
     */
    private function filteredPromotionIds(?string $search, ?string $status): array
    {
        $query = Promotion::query();

        if ($search) {
            $s = trim($search);
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$s}%")
                ->orWhere('code', 'like', "%{$s}%"));
        }

        $now = now();
        if ($status === 'running') {
            $query->where('status', true)
                ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $now));
        } elseif ($status === 'ended') {
            $query->where(fn ($q) => $q->whereNotNull('end_date')->where('end_date', '<', $now));
        }

        return $query->pluck('id')->all();
    }

    public function invoices(Request $request, Promotion $promotion): JsonResponse
    {
        $perPage = min(max((int) $request->input('per_page', 50), 1), 200);

        $query = InvoicePromotion::query()
            ->where('promotion_id', $promotion->id)
            ->join('invoices', 'invoices.id', '=', 'invoice_promotions.invoice_id')
            ->select('invoices.id', 'invoices.invoice_code', 'invoices.issued_at', 'invoices.table_name',
                'invoices.subtotal_amount', 'invoices.discount_amount', 'invoices.total_amount', 'invoices.payment_method')
            ->orderBy('invoices.issued_at', 'desc')
            ->orderBy('invoices.id', 'desc');

        $paginator = $query->simplePaginate($perPage);

        return response()->json([
            'invoices' => $paginator->items(),
            'meta' => [
                'per_page' => $paginator->perPage(),
                'has_more' => $paginator->hasMorePages(),
                'next_page' => $paginator->nextPageUrl(),
            ],
        ]);
    }

    public function codes(Request $request, Promotion $promotion): JsonResponse
    {
        $query = PromotionCode::query()
            ->where('promotion_id', $promotion->id)
            ->leftJoin('invoices', 'invoices.id', '=', 'promotion_codes.used_invoice_id')
            ->select('promotion_codes.id', 'promotion_codes.code', 'promotion_codes.status', 'promotion_codes.used_at', 'invoices.invoice_code')
            ->orderBy('promotion_codes.id', 'desc');

        if ($request->boolean('export')) {
            return response()->json(['codes' => $query->get()]);
        }

        $perPage = min(max((int) $request->input('per_page', 50), 1), 200);
        $paginator = $query->simplePaginate($perPage);

        return response()->json([
            'codes' => $paginator->items(),
            'meta' => [
                'per_page' => $paginator->perPage(),
                'has_more' => $paginator->hasMorePages(),
                'next_page' => $paginator->nextPageUrl(),
            ],
        ]);
    }

    /**
     * Tổng giá trị các HOÁ ĐƠN distinct có dùng ít nhất 1 promotion/coupon/voucher.
     * 1 hoá đơn áp dụng nhiều KM vẫn chỉ tính 1 lần (invoice_promotions distinct theo invoice_id).
     *
     * @param  array<int>|null  $promotionIds  lọc theo tập campaign (null = tất cả)
     */
    private function distinctInvoiceRevenue(?string $from, ?string $to, ?array $promotionIds = null): float
    {
        $ids = $this->distinctInvoiceIds($from, $to, $promotionIds);
        if ($ids->isEmpty()) {
            return 0.0;
        }

        return (float) DB::table('invoices')->whereIn('id', $ids)->sum('total_amount');
    }

    /**
     * @param  array<int>|null  $promotionIds
     * @return Collection<int, int>
     */
    private function distinctInvoiceIds(?string $from, ?string $to, ?array $promotionIds = null)
    {
        $query = DB::table('invoice_promotions')->whereNotNull('promotion_id');
        if ($promotionIds !== null) {
            $query->whereIn('promotion_id', $promotionIds);
        }
        if ($from) {
            $query->whereDate('invoice_promotions.created_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('invoice_promotions.created_at', '<=', $to);
        }

        return $query->distinct()->pluck('invoice_id');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated) {
            // Batch (code_prefix) và mã lẻ (code) loại trừ lẫn nhau — chọn 1 trong 2
            $isBatch = ! empty($validated['code_prefix'] ?? null);
            $promotion = Promotion::create([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' || $isBatch ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
                'start_date' => ($validated['start_date'] ?? null) ? Carbon::parse($validated['start_date'])->startOfDay() : null,
                'end_date' => ($validated['end_date'] ?? null) ? Carbon::parse($validated['end_date'])->endOfDay() : null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $isBatch ? null : ($validated['max_usage'] ?? null),
                'target_usage' => $validated['target_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
                'code_prefix' => $isBatch ? $validated['code_prefix'] : null,
                'code_quantity' => $isBatch ? $validated['code_quantity'] : null,
                'code_random' => $isBatch ? ($validated['code_random'] ?? false) : false,
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

            // Sinh mã con hàng loạt (nếu có prefix + quantity)
            if ($validated['code_prefix'] ?? null) {
                try {
                    PromotionCodeService::generate($promotion);
                } catch (\InvalidArgumentException $e) {
                    throw ValidationException::withMessages([
                        'code_prefix' => $e->getMessage(),
                    ]);
                }
            }
        });

        $this->flushPosPromotionsCache();

        return back()->with('success', 'Thêm khuyến mãi thành công!');
    }

    public function update(Request $request, Promotion $promotion): RedirectResponse
    {
        $validated = $request->validate($this->rules($promotion));

        DB::transaction(function () use ($validated, $promotion) {
            // Batch (code_prefix) và mã lẻ (code) loại trừ lẫn nhau — chọn 1 trong 2
            $isBatch = ! empty($validated['code_prefix'] ?? null);
            $promotion->update([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' || $isBatch ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
                'start_date' => ($validated['start_date'] ?? null) ? Carbon::parse($validated['start_date'])->startOfDay() : null,
                'end_date' => ($validated['end_date'] ?? null) ? Carbon::parse($validated['end_date'])->endOfDay() : null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $isBatch ? null : ($validated['max_usage'] ?? null),
                'target_usage' => $validated['target_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
                'code_prefix' => $isBatch ? $validated['code_prefix'] : null,
                'code_quantity' => $isBatch ? $validated['code_quantity'] : null,
                'code_random' => $isBatch ? ($validated['code_random'] ?? false) : false,
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

        $this->flushPosPromotionsCache();

        return back()->with('success', 'Cập nhật khuyến mãi thành công!');
    }

    public function destroy(Request $request, Promotion $promotion): RedirectResponse
    {
        $request->validate(['password' => 'required|string']);

        if (! Hash::check((string) $request->input('password'), (string) $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $promotion->delete();

        $this->flushPosPromotionsCache();

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
            'code' => ['nullable', 'string', 'max:50', Rule::requiredIf(fn () => in_array((string) request('type'), ['coupon', 'voucher'], true) && ! request('code_prefix')), Rule::unique('promotions', 'code')->ignore($promotion?->id)],
            'code_prefix' => ['nullable', 'string', 'max:30', 'required_with:code_quantity'],
            'code_quantity' => ['nullable', 'integer', 'min:1', 'max:100000', 'required_with:code_prefix'],
            'code_random' => ['sometimes', 'boolean'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'boolean'],
            'max_usage' => ['nullable', 'integer', 'min:1'],
            'target_usage' => ['nullable', 'integer', 'min:1'],
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

    private function flushPosPromotionsCache(): void
    {
        try {
            Cache::tags(['pos_promotions'])->flush();
        } catch (\Throwable $e) {
            Log::warning('pos_promotions cache flush failed: '.$e->getMessage());
        }
    }
}
