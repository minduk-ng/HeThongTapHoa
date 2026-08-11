# Promotion v2 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay UI quản lý khuyến mãi hiện tại bằng trang mới theo mẫu HTML: tổng quan (KPI cards + campaign list) và form thêm/sửa promotion v2 (conditions/actions/exclusive/stackable + preview).

**Architecture:** Frontend React/TSX theo mẫu `tong_quan_khuyen_mai.html` + `them_moi_khuyen_mai.html`. `PromotionController::index` trả shape v2 + stats sơ bộ. Form gửi payload v2 (khớp spec 1 controller). KHÔNG đổi backend logic (spec 1 đã xong).

**Tech Stack:** Laravel 13 + Inertia + React + TypeScript + Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-10-promotion-v2-frontend-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`.
- `npm run types:check` + `npm run build` pass sau mỗi task.
- Props từ controller (spec 1): `promotions` (kèm conditions/actions), `menu_items`, `menu_categories`, `filters`, `stats`.
- Payload gửi lên (khớp spec 1): `{name, type, code?, start_date?, end_date?, status, max_usage?, exclusive, stackable, conditions:[{cond_type, cond_value}], actions:[{action_type, action_value, max_discount_amount?}]}`.
- Spec 2 KHÔNG nối analytics thật (spec 3); stats sơ bộ từ controller.
- Dùng component có sẵn: `DatePicker`, `ManagerPageLayout`, `DashboardLayout`.
- KHÔNG đổi route.

---

## File Structure

**Sửa:**
- `resources/js/pages/manager/promotions/PromotionsManager.tsx`
- `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`
- `app/Http/Controllers/Manager/PromotionController.php` (index shape + stats sơ bộ)

**Tạo mới:**
- `resources/js/pages/manager/promotions/components/PromotionActionsEditor.tsx`
- `resources/js/pages/manager/promotions/components/PromotionConditionsEditor.tsx`
- `resources/js/pages/manager/promotions/components/PromotionPreview.tsx`
- `resources/js/pages/manager/promotions/components/PromotionStatsCards.tsx`

**Xoá nếu không còn dùng:** `PromotionTable.tsx`

---

## Task 1: Controller index — shape v2 + stats sơ bộ

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`

**Interfaces:**
- Produces: `index` trả `promotions` (map shape v2 + conditions/actions), `stats`, `menu_items`, `menu_categories`, `filters`. Task 2-3 tiêu thụ.

- [ ] **Step 1: Sửa index**

`app/Http/Controllers/Manager/PromotionController.php::index`:

```php
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
```

- [ ] **Step 2: Backend verify**

Run: `php artisan test` — PASS (spec 1 đã chuyển đổi test).

- [ ] **Step 3: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php
git commit -m "feat: PromotionController index tra shape v2 + stats so bo"
```

---

## Task 2: Stats cards + Campaign list (PromotionsManager rewrite)

**Files:**
- Create: `PromotionStatsCards.tsx`
- Modify: `PromotionsManager.tsx`

**Interfaces:**
- Consumes: props Task 1.
- Produces: trang tổng quan; nút mở form (Task 3).

- [ ] **Step 1: Tạo PromotionStatsCards**

`resources/js/pages/manager/promotions/components/PromotionStatsCards.tsx`:

```tsx
import React from 'react';
import { TrendingUp, LocalActivity, Sell, TrendingDown } from 'lucide-react';

interface Stats { total_campaigns: number; total_orders: number; total_revenue: number; total_discount: number; avg_discount: number; roi: number; }

const fmt = (v: number) => Number(v || 0).toLocaleString('vi-VN') + ' đ';

export default function PromotionStatsCards({ stats }: { stats: Stats }) {
    const cards = [
        { label: 'Tổng doanh thu từ KM', value: fmt(stats.total_revenue), icon: TrendingUp, color: 'text-sky-600' },
        { label: 'Tổng lượt đã dùng', value: `${stats.total_orders} lượt`, icon: LocalActivity, color: 'text-emerald-600' },
        { label: 'Giá trị giảm trung bình', value: fmt(stats.avg_discount), icon: Sell, color: 'text-amber-600' },
        { label: 'Chi phí khuyến mãi', value: fmt(stats.total_discount), icon: TrendingDown, color: 'text-rose-600' },
    ];
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
                <div key={c.label} className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm text-zinc-500 dark:text-zinc-400">{c.label}</h3>
                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <c.icon className={`w-4 h-4 ${c.color}`} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{c.value}</div>
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Rewrite PromotionsManager**

`resources/js/pages/manager/promotions/PromotionsManager.tsx` — thay toàn bộ (pattern các Manager khác):

```tsx
import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, SlidersHorizontal, Ticket } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import PromotionStatsCards from './components/PromotionStatsCards';
import PromotionFormDrawer from './components/PromotionFormDrawer';

export interface PromotionData {
    id: number; name: string; type: 'promotion' | 'coupon' | 'voucher';
    code: string | null; start_date: string | null; end_date: string | null;
    status: boolean; used_count: number; max_usage: number | null;
    exclusive: boolean; stackable: boolean;
    conditions: { cond_type: string; cond_value: string }[];
    actions: { action_type: string; action_value: number; max_discount_amount: number | null }[];
}

interface Props {
    promotions: PromotionData[];
    stats: { total_campaigns: number; total_orders: number; total_revenue: number; total_discount: number; avg_discount: number; roi: number };
    filters: { search?: string; status?: string };
    menu_items: { id: number; name: string }[];
    menu_categories: { id: number; name: string }[];
}

const TYPE_LABEL: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };
const TYPE_CLASS: Record<string, string> = {
    promotion: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    coupon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    voucher: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function PromotionsManager({ promotions, stats, filters, menu_items, menu_categories }: Props) {
    const [search, setSearch] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<PromotionData | null>(null);

    const applyFilters = () => {
        router.get('/manager/promotions', {
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
        }, { preserveState: true });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Khuyến mãi" />
            <ManagerPageLayout
                sidebar={
                    <>
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <Ticket className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">Khuyến mãi</h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Quản lý chiến dịch ưu đãi cho thanh toán POS</p>
                        </div>
                        <button type="button" onClick={() => { setEditing(null); setDrawerOpen(true); }}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">
                            <Plus className="w-4 h-4" /><span>Chiến dịch mới</span>
                        </button>
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5" /><span>Bộ lọc</span>
                            </label>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm chiến dịch..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500" />
                            </div>
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Trạng thái</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700">
                                    <option value="all">Tất cả</option>
                                    <option value="running">Đang chạy</option>
                                    <option value="ended">Đã kết thúc</option>
                                </select>
                            </div>
                            <button type="button" onClick={applyFilters}
                                className="w-full px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">Lọc</button>
                        </div>
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-auto">
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                <div className="text-[11px] text-zinc-500">Tổng chiến dịch</div>
                                <div className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100">{stats?.total_campaigns ?? 0}</div>
                            </div>
                        </div>
                    </>
                }
            >
                <div className="space-y-4">
                    <PromotionStatsCards stats={stats} />
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
                        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Campaign Performance</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Mã / Tên chiến dịch</th>
                                        <th className="px-4 py-3">Loại</th>
                                        <th className="px-4 py-3 text-right">Số đơn</th>
                                        <th className="px-4 py-3 text-right">Hiệu suất</th>
                                        <th className="px-4 py-3 text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {promotions.length === 0 ? (
                                        <tr><td colSpan={5} className="py-12 px-6 text-center text-zinc-500">Chưa có chiến dịch nào</td></tr>
                                    ) : promotions.map((p) => {
                                        const perf = p.max_usage ? Math.min(100, Math.round((p.used_count / p.max_usage) * 100)) : null;
                                        return (
                                            <tr key={p.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer"
                                                onClick={() => { setEditing(p); setDrawerOpen(true); }}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.code || `KM_${p.id}`}</div>
                                                    <div className="text-xs text-zinc-500">{p.name}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${TYPE_CLASS[p.type]}`}>{TYPE_LABEL[p.type]}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums">{p.used_count}</td>
                                                <td className="px-4 py-3">
                                                    {perf === null ? (
                                                        <span className="text-xs text-zinc-400">—</span>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                                                <div className="bg-sky-600 h-full rounded-full" style={{ width: `${perf}%` }} />
                                                            </div>
                                                            <span className="text-xs font-medium text-sky-600 w-8 text-right">{perf}%</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs text-blue-600">Sửa</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </ManagerPageLayout>

            <PromotionFormDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                promotionToEdit={editing}
                menuItems={menu_items}
                menuCategories={menu_categories}
            />
        </DashboardLayout>
    );
}
```

- [ ] **Step 3: Types + build**

Run: `npm run types:check` + `npm run build` — PASS. (FormDrawer chưa tồn tại interface `PromotionData` export? — Task 3 rewrite sẽ khớp. Nếu build fail vì FormDrawer cũ dùng PromotionData từ PromotionTable, tạm để Task 3 xử lý; ghi nhận.)

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/promotions/PromotionsManager.tsx resources/js/pages/manager/promotions/components/PromotionStatsCards.tsx
git commit -m "feat: PromotionsManager tong quan (KPI cards + campaign list)"
```

---

## Task 3: Form promotion v2 + editors + preview

**Files:**
- Create: `PromotionActionsEditor.tsx`, `PromotionConditionsEditor.tsx`, `PromotionPreview.tsx`
- Modify: `PromotionFormDrawer.tsx` (rewrite)
- Delete: `PromotionTable.tsx` nếu không còn dùng

**Interfaces:**
- Consumes: props `menu_items` (Task 1), `PromotionData` (Task 2 export).
- Produces: form gửi payload v2.

- [ ] **Step 1: Tạo PromotionActionsEditor**

`resources/js/pages/manager/promotions/components/PromotionActionsEditor.tsx`:

```tsx
import React from 'react';
import { Plus, X } from 'lucide-react';

export interface ActionRow { action_type: string; action_value: string; max_discount_amount: string; }

interface Props {
    actions: ActionRow[];
    onChange: (actions: ActionRow[]) => void;
    menuItems: { id: number; name: string }[];
}

const TYPES = [['discount_percent', 'Giảm theo phần trăm (%)'], ['discount_amount', 'Giảm theo số tiền (đ)'], ['free_product', 'Tặng món']] as const;

export default function PromotionActionsEditor({ actions, onChange, menuItems }: Props) {
    const update = (i: number, key: keyof ActionRow, value: string) =>
        onChange(actions.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)));
    const add = () => onChange([...actions, { action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
    const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-3">
            {actions.map((a, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <select value={a.action_type} onChange={(e) => update(i, 'action_type', e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {a.action_type === 'free_product' ? (
                        <select value={a.action_value} onChange={(e) => update(i, 'action_value', e.target.value)}
                            className="flex-1 min-w-[180px] px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                            <option value="">Chọn món tặng...</option>
                            {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    ) : (
                        <div className="relative">
                            <input type="number" value={a.action_value} onChange={(e) => update(i, 'action_value', e.target.value)}
                                placeholder={a.action_type === 'discount_percent' ? '10' : '50000'}
                                className="w-28 px-3 py-2 pr-7 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{a.action_type === 'discount_percent' ? '%' : 'đ'}</span>
                        </div>
                    )}
                    {a.action_type === 'discount_percent' && (
                        <div className="relative">
                            <input type="number" value={a.max_discount_amount} onChange={(e) => update(i, 'max_discount_amount', e.target.value)}
                                placeholder="Mức tối đa" className="w-28 px-3 py-2 pr-7 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">đ</span>
                        </div>
                    )}
                    <button type="button" onClick={() => remove(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button type="button" onClick={add}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm hành động
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Tạo PromotionConditionsEditor**

`resources/js/pages/manager/promotions/components/PromotionConditionsEditor.tsx` (pattern tương tự):

```tsx
import React from 'react';
import { Plus, X } from 'lucide-react';

export interface ConditionRow { cond_type: string; cond_value: string; }

interface Props {
    conditions: ConditionRow[];
    onChange: (conditions: ConditionRow[]) => void;
    menuItems: { id: number; name: string }[];
}

const TYPES = [['min_order_value', 'Giá trị đơn tối thiểu (đ)'], ['min_quantity', 'Số lượng món tối thiểu'], ['specific_product', 'Món cụ thể']] as const;

export default function PromotionConditionsEditor({ conditions, onChange, menuItems }: Props) {
    const update = (i: number, key: keyof ConditionRow, value: string) =>
        onChange(conditions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
    const add = () => onChange([...conditions, { cond_type: 'min_order_value', cond_value: '' }]);
    const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-3">
            {conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <select value={c.cond_type} onChange={(e) => update(i, 'cond_type', e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {c.cond_type === 'specific_product' ? (
                        <select value={c.cond_value} onChange={(e) => update(i, 'cond_value', e.target.value)}
                            className="flex-1 min-w-[180px] px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                            <option value="">Chọn món...</option>
                            {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    ) : (
                        <input type="number" value={c.cond_value} onChange={(e) => update(i, 'cond_value', e.target.value)}
                            placeholder={c.cond_type === 'min_order_value' ? '200000' : '3'}
                            className="w-28 px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                    )}
                    <button type="button" onClick={() => remove(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button type="button" onClick={add}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm điều kiện
            </button>
        </div>
    );
}
```

- [ ] **Step 3: Tạo PromotionPreview**

`resources/js/pages/manager/promotions/components/PromotionPreview.tsx`:

```tsx
import React from 'react';
import { ActionRow } from './PromotionActionsEditor';
import { ConditionRow } from './PromotionConditionsEditor';

interface Props {
    name: string;
    type: 'promotion' | 'coupon' | 'voucher';
    actions: ActionRow[];
    conditions: ConditionRow[];
    endDate: string;
    status: boolean;
}

const fmt = (v: string) => Number(v || 0).toLocaleString('vi-VN');

export default function PromotionPreview({ name, type, actions, conditions, endDate, status }: Props) {
    const first = actions[0];
    let discountText = '—';
    if (first) {
        if (first.action_type === 'discount_percent') discountText = `Giảm ${first.action_value}%`;
        if (first.action_type === 'discount_amount') discountText = `Giảm ${fmt(first.action_value)}đ`;
        if (first.action_type === 'free_product') discountText = 'Tặng món';
    }
    const minOrder = conditions.find((c) => c.cond_type === 'min_order_value');
    const typeLabel: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 w-full overflow-hidden flex">
            <div className="bg-sky-600 w-3 flex-shrink-0" />
            <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{typeLabel[type]}</span>
                    <span className={`text-[10px] font-bold px-2 rounded ${status ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{status ? 'Active' : 'Paused'}</span>
                </div>
                <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight mb-1">{name || 'Tên chương trình'}</h4>
                <p className="text-sm text-sky-600 font-semibold mb-3">{discountText}</p>
                <div className="mt-auto border-t border-dashed border-zinc-200 dark:border-zinc-700 pt-2 space-y-1">
                    {minOrder && <p className="text-[11px] text-zinc-500">Đơn tối thiểu: {fmt(minOrder.cond_value)}đ</p>}
                    {endDate && <p className="text-[11px] text-zinc-500">HSD: {endDate}</p>}
                    {actions.length === 0 && <p className="text-[11px] text-zinc-400">Chưa cấu hình giảm giá</p>}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Rewrite PromotionFormDrawer**

`resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx` — thay toàn bộ (mẫu `them_moi_khuyen_mai.html`, 2 cột: form trái + preview phải sticky). Skeleton + logic:

```tsx
import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { X, Shuffle } from 'lucide-react';
import DatePicker from '../../../../components/DatePicker';
import PromotionActionsEditor, { ActionRow } from './PromotionActionsEditor';
import PromotionConditionsEditor, { ConditionRow } from './PromotionConditionsEditor';
import PromotionPreview from './PromotionPreview';
import { PromotionData } from '../PromotionsManager';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionToEdit: PromotionData | null;
    menuItems: { id: number; name: string }[];
    menuCategories: { id: number; name: string }[];
}

const randomCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export default function PromotionFormDrawer({ isOpen, onClose, promotionToEdit, menuItems }: Props) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'promotion' | 'coupon' | 'voucher'>('promotion');
    const [code, setCode] = useState('');
    const [startDate, setStartDate] = useState<string | null>(null);
    const [endDate, setEndDate] = useState<string | null>(null);
    const [status, setStatus] = useState(true);
    const [maxUsage, setMaxUsage] = useState('');
    const [exclusive, setExclusive] = useState(false);
    const [stackable, setStackable] = useState(true);
    const [actions, setActions] = useState<ActionRow[]>([{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setErrors({});
        if (promotionToEdit) {
            setName(promotionToEdit.name); setType(promotionToEdit.type); setCode(promotionToEdit.code || '');
            setStartDate(promotionToEdit.start_date || null); setEndDate(promotionToEdit.end_date || null);
            setStatus(promotionToEdit.status);
            setMaxUsage(promotionToEdit.max_usage === null ? '' : String(promotionToEdit.max_usage));
            setExclusive(promotionToEdit.exclusive); setStackable(promotionToEdit.stackable);
            setActions(promotionToEdit.actions.length ? promotionToEdit.actions.map((a) => ({
                action_type: a.action_type, action_value: String(a.action_value),
                max_discount_amount: a.max_discount_amount === null ? '' : String(a.max_discount_amount),
            })) : [{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
            setConditions(promotionToEdit.conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value })));
        } else {
            setName(''); setType('promotion'); setCode(''); setStartDate(null); setEndDate(null);
            setStatus(true); setMaxUsage(''); setExclusive(false); setStackable(true);
            setActions([{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
            setConditions([]);
        }
    }, [promotionToEdit, isOpen]);

    if (!isOpen) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        const payload = {
            name, type,
            code: type === 'promotion' ? null : (code.toUpperCase() || null),
            start_date: startDate || null, end_date: endDate || null,
            status, max_usage: maxUsage === '' ? null : Number(maxUsage),
            exclusive, stackable,
            conditions: conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value })),
            actions: actions.map((a) => ({
                action_type: a.action_type,
                action_value: Number(a.action_value) || 0,
                max_discount_amount: a.action_type === 'discount_percent' && a.max_discount_amount !== '' ? Number(a.max_discount_amount) : null,
            })),
        };
        router.post(promotionToEdit ? `/manager/promotions/${promotionToEdit.id}` : '/manager/promotions', payload, {
            onSuccess: onClose,
            onError: (v) => setErrors(v as Record<string, string>),
            onFinish: () => setSubmitting(false),
        });
    };

    const inputCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto p-6">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-5">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {promotionToEdit ? 'Cập nhật khuyến mãi' : 'Thêm mới chương trình khuyến mãi'}
                    </h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left: form fields */}
                    <div className="lg:col-span-8 space-y-5">
                        {/* Thông tin chung */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Thông tin chung</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tên chương trình <span className="text-rose-500">*</span></label>
                                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Khai xuân đón lộc" className={inputCls} />
                                    {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Loại hình <span className="text-rose-500">*</span></label>
                                        <select value={type} onChange={(e) => setType(e.target.value as any)} className={inputCls}>
                                            <option value="promotion">Khuyến mãi tự động (Promotion)</option>
                                            <option value="coupon">Mã giảm giá (Coupon)</option>
                                            <option value="voucher">Mã quà tặng (Voucher)</option>
                                        </select>
                                    </div>
                                    {type !== 'promotion' && (
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mã Code <span className="text-rose-500">*</span></label>
                                            <div className="flex gap-2">
                                                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Nhập mã hoặc tạo ngẫu nhiên" className={inputCls} />
                                                <button type="button" onClick={() => setCode(randomCode())} title="Tạo mã ngẫu nhiên"
                                                    className="px-3 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                                    <Shuffle className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {errors.code && <p className="text-xs text-rose-500 mt-1">{errors.code}</p>}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Từ ngày</label>
                                        <DatePicker mode="single" className="w-full justify-start" value={startDate ? startDate.slice(0, 10) : null} onChange={(v) => setStartDate(v ?? '')} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Đến ngày</label>
                                        <DatePicker mode="single" className="w-full justify-start" value={endDate ? endDate.slice(0, 10) : null} onChange={(v) => setEndDate(v ?? '')} />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Cấu hình giảm giá */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Cấu hình giảm giá</h4>
                            <PromotionActionsEditor actions={actions} onChange={setActions} menuItems={menuItems} />
                            {errors.actions && <p className="text-xs text-rose-500 mt-1">{errors.actions}</p>}
                        </section>

                        {/* Điều kiện & Giới hạn */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Điều kiện &amp; Giới hạn</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tổng số lượt sử dụng tối đa</label>
                                    <input type="number" value={maxUsage} onChange={(e) => setMaxUsage(e.target.value)} placeholder="Không giới hạn" className={inputCls} />
                                </div>
                                <PromotionConditionsEditor conditions={conditions} onChange={setConditions} menuItems={menuItems} />
                            </div>
                        </section>

                        {/* Toggles */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Độc quyền</label>
                                    <p className="text-xs text-zinc-500">Không áp dụng chung với bất kỳ chương trình hoặc mã giảm giá nào khác.</p>
                                </div>
                                <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Áp dụng đồng thời</label>
                                    <p className="text-xs text-zinc-500">Cho phép áp dụng đè lên các chương trình giảm giá tự động.</p>
                                </div>
                                <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                            </div>
                        </section>
                    </div>

                    {/* Right: preview */}
                    <div className="lg:col-span-4 lg:sticky lg:top-4 space-y-4">
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Xem trước (Preview)</h4>
                            <PromotionPreview name={name} type={type} actions={actions} conditions={conditions} endDate={endDate || ''} status={status} />
                        </section>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700">Hủy bỏ</button>
                            <button type="submit" disabled={submitting}
                                className="px-5 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50">
                                {submitting ? 'Đang lưu...' : 'Lưu & Kích hoạt'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Xoá PromotionTable nếu không dùng**

Grep `PromotionTable` trong `resources/js` — nếu chỉ `PromotionsManager` cũ import (đã rewrite) thì xoá file `PromotionTable.tsx`.

- [ ] **Step 6: Types + build**

Run: `npm run types:check` + `npm run build` — PASS. Fix mọi TS error (interface PromotionData export từ PromotionsManager — FormDrawer import đúng).

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/manager/promotions/
git commit -m "feat: form promotion v2 (actions/conditions editors + preview) theo mau them_moi"
```

---

## Task 4: Final verification

**Files:** không code — verify.

- [ ] **Step 1: Backend full suite**

Run: `php artisan test` — PASS.

- [ ] **Step 2: Frontend**

Run: `npm run types:check` + `npm run build` — PASS.

- [ ] **Step 3: Smoke**

- Mở `/manager/promotions` — KPI cards + campaign list render.
- Nút "Chiến dịch mới" → form: chọn loại Coupon → ô code + nút shuffle hiện; thêm/xoá action/condition dòng; preview cập nhật realtime.
- Lưu promotion v2 → POST đúng shape → redirect, list hiện mới.

- [ ] **Step 4: Commit fix phát sinh nếu có**

---

## Final verification checklist

- [ ] `php artisan test` — pass
- [ ] `npm run types:check` + `npm run build` — pass
- [ ] Smoke: list + form + preview + submit hoạt động
- [ ] `git status` — tree sạch
