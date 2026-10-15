# Planning Information and Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa phát hiện #1/#2/#7/#8/#10, diễn giải trung thực và đưa nhu cầu nhập hàng lên trước phân tích kỹ thuật.

**Architecture:** Giữ các trang/controller hiện có. Thêm helper thuần chọn mô hình hiển thị và metadata đọc-only về trạng thái kết quả; không chạy lại thuật toán để quyết định empty state. Overview sở hữu khung biểu đồ.

**Tech Stack:** Laravel 13/PHP 8.3, Inertia 3, React 19, TypeScript, Tailwind 4, Recharts, Pest, Node 24 `node:test`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-14-planning-information-layout-design.md`, đã duyệt.
- Thứ tự 1/3. Không đổi thuật toán, quyền, routes, stock hoặc lịch sử forecast.
- Trước sửa mỗi symbol: GitNexus impact upstream bằng MCP hoặc CLI. Ví dụ `node .gitnexus/run.cjs impact index --direction upstream --file app/Http/Controllers/Planning/ProductForecastController.php` và `node .gitnexus/run.cjs impact ModelEvaluation --direction upstream`. Dùng context/file để phân biệt tên trùng. Báo blast radius và HIGH/CRITICAL trước sửa.
- Trước commit (chỉ khi có yêu cầu commit): xem status/diff/log, stage đúng file, `node .gitnexus/run.cjs detect-changes --scope staged`, `git diff --cached --check`.
- PowerShell 5.1: mỗi command chạy riêng; không dùng `&&`. Sửa file bằng apply_patch.
- Test PHP chỉ sqlite `:memory:`; kiểm tra `phpunit.xml` và biến môi trường DB trước test, không chạy migration/seed trên DB thật.
- Test logic mới theo red/green; thay đổi copy/CSS nhỏ kiểm tra trực quan, không tạo test snapshot phản chiếu JSX.
- Nghiệm thu browser 320/375/414/768 và 1280×800, light/dark. Thiếu browser/test account thì báo blocker, chưa đánh dấu visual pass.

## File map

Create `resources/js/components/planning/modelRecommendation.ts` và `.test.ts`: lựa chọn hiển thị, không thay selection backend.
Create `app/Services/Forecasting/PlanningResultSummary.php`: metadata đọc-only dùng chung cho Overview/Products/Procurement.
Create `tests/Feature/Planning/PlanningResultSummaryTest.php`: trạng thái/source/filter regression.
Modify ba controller `PlanningOverviewController.php`, `ProductForecastController.php`, `ProcurementRecommendationController.php`; các trang `Overview.tsx`, `ProductForecasts.tsx`, `ProcurementRecommendations.tsx`, `ModelEvaluation.tsx`; `ActualForecastChart.tsx`; `RunStatusBanner.tsx`, hai drawer và `planningFormatters.ts` khi chứa thuật ngữ trong spec.
Modify `resources/js/types/planning.ts`: contract metadata. Update `docs/PROJECT_CONTEXT_AND_ROUTING.md`.

## Task 1 — Mô hình khuyến nghị đúng tiêu chí

**Interfaces:** helper không import TSX; input structural để nhận `ModelMetricPoint[]`:
```ts
export interface RecommendationCandidate {
    model_key: string;
    selected_count?: number;
    avg_wape: number | null;
}
export function recommendedModelKeys(rows: readonly RecommendationCandidate[]): string[];
```

- [ ] Impact `ModelEvaluation`, `handleOpenConfirm`, `handleConfirmApply`; đọc controller apply để xác nhận lời mô tả phạm vi.
- [ ] Tạo test red tại `modelRecommendation.test.ts`:
```ts
import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { recommendedModelKeys } from './modelRecommendation.ts';
test('count outranks WAPE without claiming lowest error', () => {
    deepEqual(recommendedModelKeys([
        { model_key: 'naive', selected_count: 5, avg_wape: 30 },
        { model_key: 'sma_7', selected_count: 2, avg_wape: 5 },
    ]), ['naive']);
});
test('no selections yields no recommendation', () => {
    deepEqual(recommendedModelKeys([{ model_key: 'naive', selected_count: 0, avg_wape: 0 }]), []);
});
test('finite WAPE beats missing WAPE, including values above 999', () => {
    deepEqual(recommendedModelKeys([
        { model_key: 'naive', selected_count: 2, avg_wape: null },
        { model_key: 'sma_7', selected_count: 2, avg_wape: 1200 },
    ]), ['sma_7']);
});
test('ties stay ties in original candidate order', () => {
    deepEqual(recommendedModelKeys([
        { model_key: 'naive', selected_count: 2, avg_wape: 10 },
        { model_key: 'sma_7', selected_count: 2, avg_wape: 10 },
    ]), ['naive', 'sma_7']);
});
```
- [ ] Run `node --test resources/js/components/planning/modelRecommendation.test.ts`; expected module missing before implementation.
- [ ] Implement helper: exclude count <=0; select max count; finite WAPE minimum, null/non-finite last; return all tied keys. Do not sort/mutate input. Core:
```ts
const selected = rows.filter((r) => (r.selected_count ?? 0) > 0);
if (!selected.length) return [];
const count = Math.max(...selected.map((r) => r.selected_count ?? 0));
const finalists = selected.filter((r) => r.selected_count === count);
const score = (r: RecommendationCandidate) =>
    r.avg_wape !== null && Number.isFinite(r.avg_wape) ? r.avg_wape : Infinity;
const best = Math.min(...finalists.map(score));
return finalists.filter((r) => score(r) === best).map((r) => r.model_key);
```
- [ ] Wire result into ModelEvaluation; find first key in original rows for primary CTA, list all tied names and state first listed is CTA target. Zero keys disables primary CTA. Copy exactly from spec; row badge uses selected_count, not global “Đang áp dụng”. Keep existing per-row permissions. Null MAE/RMSE/WAPE display missing, not proof of evaluation. Update modal copy to next eligible forecast run.
- [ ] Run helper test and `npm run types:check`; browser case A count 5/WAPE30 vs B count2/WAPE5, no selection, null WAPE and tie. Check no request fires when merely viewing candidate.
- [ ] Review diff; checkpoint message if commits requested: `fix(planning): clarify model recommendation scope`.

## Task 2 — Read-only result metadata and truthful empty states

**Interfaces:** append fields to existing `resources/js/types/planning.ts`:
```ts
export interface PlanningResultSummary {
    latest_run_status: string | null;
    matching_horizon: boolean;
    unfiltered_product_count: number;
    available_product_count: number;
    recommendation_count: number;
    positive_recommendation_count: number;
    empty_reason: 'no_run' | 'running' | 'failed' | 'horizon_mismatch'
        | 'missing_forecasts' | 'no_recommendation_evidence' | null;
}
```
PHP `PlanningResultSummary::forRun(?ForecastRun $run, ?ForecastRun $latestRun, ?int $requestedHorizon): array` returns this shape with explicit array-shape DocBlock. Both runs source-scoped by caller, same kind; latestRun also scopes requested horizon. No writes/calculator calls.

- [ ] Impact affected controller `index` symbols (use qualified context), existing model relation readers. Read builder skip paths: unavailable quantities, missing snapshot ingredients/recipes, lead_days > horizon. Never infer completeness from `count(forecasts)>0` alone.
- [ ] Add regression in new Feature test using `uses(RefreshDatabase::class)`; use local test setup pattern from PlanningPagesTest with `withoutVite`, authorization seeder and `posAdmin`, no real credentials. Initial test body:
```php
it('does not claim sufficient stock for a completed run with no evidence', function () {
    $run = \App\Models\ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(), 'status' => 'completed', 'is_active' => true,
    ]);
    $this->actingAs(posAdmin())->get('/planning/procurement')
        ->assertInertia(fn ($page) => $page
            ->where('resultSummary.empty_reason', 'missing_forecasts')
            ->where('resultSummary.recommendation_count', 0));
});
```
- [ ] Run `php artisan test tests/Feature/Planning/PlanningResultSummaryTest.php`; expected missing prop assertion.
- [ ] Implement summary using persisted facts only:
```php
$products = $run ? $run->productForecasts() : null;
$unfiltered = $products ? (clone $products)->distinct()->count('menu_item_id') : 0;
$available = $products ? (clone $products)->whereNotNull('forecast_quantity')
    ->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'unavailable'))
    ->distinct()->count('menu_item_id') : 0;
$recommendations = $run ? $run->recommendations()->count() : 0;
$positive = $run ? $run->recommendations()->where('suggested_quantity', '>', 0)->count() : 0;
```
Resolve reason: usable completed/stale run takes precedence over a newer failed/running attempt; expose attempt separately in latest_run_status. With no usable result, status queued/running/failed first, then no_run. Run horizon differs requested => horizon_mismatch. No available forecasts => missing_forecasts. Zero recommendation rows => no_recommendation_evidence. Otherwise null. Product page ignores procurement-only reason no_recommendation_evidence when products exist. Overview applies reasons separately to chart/products and urgent section, never hides forecast data merely because recommendations are absent. No `safe_stock` boolean: zero generated rows never proves safety. Positive=0 with persisted recommendations only supports “Không có đề xuất nhập thêm trong lượt này”, not all ingredients safe. Partial coverage remains explicitly limited to generated records.
- [ ] Inject service into three controller index methods; append `resultSummary` consistently including ProductForecastController early return. Query latest source/kind/horizon without publishing it as activeRun. Product counts are BEFORE search/category/quality filters; preserve pagination query parameters and existing response aliases.
- [ ] Extend Feature tests with fixture pattern in PlanningPagesTest: one ProductForecast, filter search unmatched => unfiltered_product_count 1 and products.total 0; page out of range => products.total >0 but data empty; simulated vs operational source isolation; active completed + latest failed; requested horizon mismatch. Use test-generated ForecastRun/MenuItem IDs.
- [ ] In Products show filter-empty only with total0 + unfiltered>0 + active filter; out-of-range uses “Trang này không có kết quả” and first-page link retaining filters. In Procurement derive filtered-empty from original array count >0 and filtered count0; clear local filters without clearing selected IDs. Other cases consume reason map; preserve stale banner and useful existing results.
- [ ] Empty UI pattern (inline or small shared component only if repeated three times):
```tsx
<div className="flex items-start gap-3 p-5">
    <Boxes aria-hidden="true" className="h-6 w-6 shrink-0" />
    <div><h3 className="font-display text-base font-semibold">Chưa có kết quả phù hợp</h3>
        <p className="mt-1 text-sm">Thử thay đổi điều kiện tìm kiếm.</p>
        <button type="button" onClick={handleResetFilters}>Xóa bộ lọc</button>
    </div>
</div>
```
Map each summary reason to its own wording in spec, not this sample universally. Run CTA only if existing permission allows; use existing RunStatusBanner to avoid duplicate submit ownership. Links maintain `synthetic_dataset_id` and effective horizon, no source mixing.
- [ ] Run Feature test plus `php artisan test tests/Feature/Planning/PlanningPagesTest.php`, `npm run types:check`, `composer types:check`. Inspect source/kỳ captions manually.
- [ ] Checkpoint if requested: `fix(planning): distinguish unavailable and filtered results`.

## Task 3 — Action-first overview and single chart surface

**Files:** `Overview.tsx`, `ActualForecastChart.tsx`, `ProductForecasts.tsx`, `ProcurementRecommendations.tsx`, `ModelEvaluation.tsx`, `RunStatusBanner.tsx`, `ForecastDetailDrawer.tsx`, `RecommendationDetailDrawer.tsx`.
**Interfaces:** add optional `embedded?: boolean` to ActualForecastChartProps, default false, only Overview passes true; data/tooltip API unchanged.

- [ ] Impact chart and page symbols, review every chart caller. Capture pre-change DOM order and data counts for same fixture.
- [ ] Update chart wrapper for both populated and empty states:
```tsx
const surface = embedded ? '' : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800/90';
// Wrapper class combines surface with existing className; preserve chart height.
```
Overview keeps its outer card and one content padding; render `<ActualForecastChart data={safeChartData} cutoffDate={cutoffDate} height={340} embedded />`.
- [ ] Move existing urgent section directly after KPI grid, before chart; remove old lg:col-span relationship to product table. DOM sequence exactly spec §3.2. Compact confirmed no-proposal message; metadata distinguishes unavailable. Rename “Tạo đơn” to “Xem đề xuất nhập hàng”, preserve dataset query.
- [ ] Replace visible terminology according to spec table without renaming identifiers or formula keys. Use text helpers when same phrase already lives in planningFormatters; do not blanket replace source strings. Keep weekly “Sai số thấp nhất trong khoảng này” and missing values `—`.
- [ ] Run `npm run types:check`, `npm run build`; browser verify one chart border, unchanged series totals, urgent content before chart and no double CTA. Check 320/375/414/768/1280 widths.
- [ ] Checkpoint if requested: `refactor(planning): prioritize replenishment decisions`.

## Task 4 — Integrated verification and documentation

- [ ] Run `node --test resources/js/components/planning/modelRecommendation.test.ts resources/js/components/planning/planningFormatters.test.ts resources/js/components/planning/forecastCheckView.test.ts resources/js/components/planning/forecastCheckRequests.test.ts`.
- [ ] Run `npm run types:check`, `npm run build`, `npx eslint resources/js/pages/planning resources/js/components/planning resources/js/types/planning.ts` separately. Report pre-existing failures distinctly, do not suppress them.
- [ ] Because controllers changed, run `composer types:check` and full `php artisan test` after verifying sqlite test environment. No suite skips.
- [ ] Update `docs/PROJECT_CONTEXT_AND_ROUTING.md`: resultSummary metadata, source/kỳ consistency, action-first layout, reference terminology, link to all three specs/plans.
- [ ] Record browser evidence (viewport/theme/state and actual observations) in `docs/superpowers/plans/2026-10-14-planning-ui-verification.md`, section Plan 1. Never fill “pass” from code inspection alone.
- [ ] Audit diff against approved spec and commit gate when requested. Stop for review checkpoint; plan 2 consumes these props and layout.
