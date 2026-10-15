# Planning UI and Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa #3/#4/#5/#9, phần responsive planning của #6 và dùng DatePicker chung.

**Architecture:** Tiếp nối bố cục/metadata plan 1. Dùng token Tailwind theo vai trò; DatePicker controlled hiện có; overlay planning dùng dialog native để focus và nền inert có cùng cơ chế. Không thêm thư viện UI.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Recharts, HTML dialog, Node `node:test`, browser DevTools.

## Global Constraints

- Spec đã duyệt: `docs/superpowers/specs/2026-10-14-planning-ui-interactions-design.md`.
- Giữ nguyên `datetime-local` tại TableFormModal và ReservationFormDrawer. Không xây time picker.
- GitNexus impact upstream trước mỗi symbol edit; report callers/processes/risk, cảnh báo HIGH/CRITICAL.
- Chỉ commit khi được yêu cầu; trước commit inspect status/diff/log, stage đúng file, detect-changes staged và diff-check.
- UI: Plus Jakarta Sans headings, Inter body, Lucide, `tabular-nums`, native disabled, focus tức thời. Không đổi API request/nghiệp vụ.
- Chữ nhỏ >=4.5:1; large text/icon/focus >=3:1, light/dark. Vùng chạm chính 44 px.
- Browser là gate thật: 320/375/414/768/1280×800. Không có runner hiện cài; dùng browser được cấp hoặc manual DevTools; không tự cài dependency chỉ để chấm pass.
- Node tests cho logic hiện có; browser cho DOM/focus/responsive. Không viết test đọc chuỗi source thay cho interaction.

## File map

Modify `resources/css/app.css`: token chart và reduced motion scoped.
Modify `ActualForecastChart.tsx`, `ForecastCheckResults.tsx`, `ModelMetricChart.tsx`: màu/typography/reduced motion.
Modify năm trang planning, `ForecastDetailDrawer.tsx`, `RecommendationDetailDrawer.tsx`, `RecommendationReviewModal.tsx`, `RunStatusBanner.tsx`.
Create `resources/js/components/planning/PlanningDialog.tsx`: overlay chỉ sở hữu lifecycle native dialog, không submit nghiệp vụ.
Create `resources/js/hooks/usePrefersReducedMotion.ts`: một media-query hook nhỏ dùng cho chart animation.
Update `docs/PROJECT_CONTEXT_AND_ROUTING.md`, append verification ledger từ plan 1.

## Task 1 — DatePicker và label form

**Files:** `ForecastChecks.tsx`, `ProductForecasts.tsx`, `ProcurementRecommendations.tsx`, `RunStatusBanner.tsx`.
**Interfaces:** existing DatePicker `{mode:'single', value?:string|null, onChange?:(value:string|null)=>void, minDate?:string, maxDate?:string, disabled?:boolean, className?:string}`; reuse `checkDateBounds` và `shiftCheckDate` unchanged.

- [ ] Impact ForecastChecks/handlers; read DatePicker current implementation and test date helpers. Baseline run `node --test resources/js/components/planning/forecastCheckRequests.test.ts resources/js/components/planning/forecastCheckView.test.ts`.
- [ ] Replace native date input:
```tsx
<div role="group" aria-labelledby="forecast-start-date-label" className="min-w-0 flex-1">
    <DatePicker mode="single" value={startDate || null}
        onChange={(value) => setStartDate(value ?? '')}
        minDate={bounds?.min} maxDate={bounds?.max} disabled={!bounds}
        className="w-full min-w-0" />
</div>
```
Visible label uses `id="forecast-start-date-label"`. Keep date input area's previous/next buttons, give aria-label, 44px hit area, `disabled` with cursor/opacity. Ensure grouped accessible label does not replace DatePicker's internal day/month/year labels.
- [ ] Validate empty/out-of-bounds before submit using existing `validDate`; display formError with `role="alert"`; CTA disabled when invalid. Preserve start+6/end, start-1/cutoff and no auto-submit on select.
- [ ] Add htmlFor/id to dataset/item selects; aria-label to search and filter controls where no visible label; numbers/reason fields include product name. Use sample:
```tsx
<label htmlFor="forecast-dataset">Tập dữ liệu mô phỏng</label>
<select id="forecast-dataset" value={selectedDatasetId} onChange={(e) => handleDatasetChange(e.target.value)} />
```
Keep existing options and styles, no empty select replacement.
- [ ] Browser: start/end boundary, Feb29, year rollover, dataset change, stale message, null state, previous/next week; changing date produces no POST until run. Native datetime-local files unchanged.
- [ ] Run baseline Node tests again only if date/request logic changed; always types-check after JSX wiring. Checkpoint if requested: `fix(planning): adopt shared date picker and form labels`.

## Task 2 — Semantic chart colors, readable type, reduced motion

**Interfaces:** CSS variables `--planning-observed`, `--planning-predicted`, `--planning-grid`, `--planning-axis`, `--planning-candidate`, `--planning-selected`; hook `usePrefersReducedMotion(): boolean`.

- [ ] Impact three charts, tooltip functions, pages; preserve imports/Tailwind in app.css.
- [ ] Add tokens, light/dark:
```css
:root {
    --planning-observed: var(--color-sky-700);
    --planning-predicted: var(--color-purple-700);
    --planning-grid: var(--color-slate-200);
    --planning-axis: var(--color-slate-600);
    --planning-candidate: var(--color-slate-500);
    --planning-selected: var(--color-sky-700);
}
.dark {
    --planning-observed: var(--color-sky-400);
    --planning-predicted: var(--color-purple-400);
    --planning-grid: var(--color-slate-700);
    --planning-axis: var(--color-slate-300);
    --planning-candidate: var(--color-slate-400);
    --planning-selected: var(--color-sky-400);
}
```
Use `stroke="var(--planning-observed)"` / predicted for chart series/dots, grid/axis tokens including tick `fill`. Tooltip use matching Tailwind sky/purple colors. Keep observed solid/predicted dashed and missing gaps, confidence alpha and text “Biên tham khảo”.
- [ ] Implement hook with lazy guarded matchMedia initial state, useEffect change listener and cleanup. Core:
```ts
const query = '(prefers-reduced-motion: reduce)';
const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
}, []);
return reduced;
```
Use `isAnimationActive={!reduced}` on animated chart series; already-static area stays false. Wrap planning roots with class `planning-ui`; scoped reduce rule disables spinner/pulse/spatial motion without changing nonplanning pages.
- [ ] CTA primary/focus use sky, purple reserved for forecast semantic. Replace small slate400 text with slate600/light and slate300/dark where meaningful; warnings text amber700/light. All h1/card/modal headings add font-display. Numeric fields add tabular-nums. Main data 14px, helper >=12px. Avoid global all-headings overrides.
- [ ] Browser compute contrast for tokens against actual panel fills, incl translucent/hover/disabled/focus states; record ratios. Check reduced-motion via DevTools and theme switch while chart visible.
- [ ] Run types/build and lint modified files. Checkpoint if requested: `style(planning): unify chart semantics and readable typography`.

## Task 3 — Native dialog lifecycle for planning overlays

**Files:** create PlanningDialog; modify both drawers, RecommendationReviewModal, ModelEvaluation confirmation. Existing ManagerFormModal does not supply focus trap; do not expand its scope.
**Interfaces:**
```ts
interface PlanningDialogProps {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    busy?: boolean;
    variant?: 'modal' | 'drawer';
    children: React.ReactNode;
}
```

- [ ] Impact every overlay/handler before replacement. Check existing submission close guards and preserve them.
- [ ] Implement `<dialog ref={ref} aria-labelledby={labelledBy}>` with showModal/close in effect. Native modal top layer handles inert background and Tab containment; capture opener before showModal and restore if connected on cleanup. Save/restore body overflow per open lifecycle, remove listeners on cleanup. Avoid conditional hook calls.
```tsx
onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
```
Use full-screen transparent dialog surface with inner panel so backdrop click target test is real; dialog `max-width:none; max-height:none`, panel handles scroll. Add `::backdrop` dim fill through Tailwind existing color variable. Cancel triggers parent state close, not unmanaged native close.
- [ ] On open focus panel's first enabled close/cancel control or panel heading with tabIndex=-1 when busy/no controls. On close/unmount restore captured opener; if disconnected, skip. Busy disables close and backdrop/Escape; native Tab skips disabled fields. All close buttons have aria-label. Keep open/close effect independent of changing callback identities or busy flag, so submitting does not close/reopen the dialog or reset opener. Ensure native dialog default Escape is prevented in onCancel.
- [ ] Replace manual trap/Escape code in drawers only after native behavior verified; remove duplicate listeners to avoid double callbacks. Add `<PlanningDialog open={isOpen} onClose={handleClose} labelledBy="modal-review-title" busy={isSubmitting || isRecalculating}>` around review content. Submit remains owned by existing modal; server error stays open; no business state moved into shell.
- [ ] Browser keyboard scenarios: opener → initial focus → Shift+Tab/Tab wrap → Escape → opener; background inert; press submit twice; failed request; busy Escape; close/reopen; unmount; short viewport. Confirm review error announces once with role alert; success uses existing Inertia result.
- [ ] Run types/build/lint. Checkpoint if requested: `fix(planning): standardize accessible overlay lifecycle`.

## Task 4 — Accessible selection, tabs and mobile layout

**Files:** ForecastCheckResults, ModelEvaluation, ForecastChecks, ProductForecasts, ProcurementRecommendations, Overview, RunStatusBanner, overlay content.
**Interfaces:** model selection callback unchanged; activeTab/evaluationStage unchanged. No additional server requests on UI selection.

- [ ] Impact functions; change table model name to button:
```tsx
<button type="button" aria-pressed={isSelected}
    onClick={(event) => { event.stopPropagation(); onSelectModelKey(cand.model_key); }}
    className="min-h-11 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
    {name}
</button>
```
Retain row click optional, but no role button on tr. Use status live region announcing active model, not whole numeric table.
- [ ] Desktop ModelEvaluation tabs: IDs/tablist/tab/tabpanel, aria-selected, roving tabIndex; ArrowRight/Left cycle, Home/End jump; set state/focus from same fixed ordered array. Stage tabs same behavior; metric toggle aria-pressed. Mobile below640 uses two labelled selects bound to existing state; desktop tabs hidden from accessibility tree via `hidden sm:flex`, mobile select `sm:hidden`.
```tsx
<label className="sm:hidden">Nội dung
    <select value={activeTab} onChange={(e) => setActiveTab(e.target.value as TabType)}>
        <option value="performance">Hiệu năng</option><option value="history">Lịch sử</option>
        <option value="config">Phương pháp</option>
    </select>
</label>
```
Keep performance stage selector only when active performance. Breakpoint changes preserve state; do not leave focus in hidden UI.
- [ ] Remove Procurement search min-w240; use `min-w-0 w-full sm:min-w-[240px]` only where parent has room. Header/form `flex-wrap` or stack; CTA nowrap + full row on narrow screens. Tables `overflow-x-auto` container with accessible label and tabIndex0 if keyboard scrolling needed; no root horizontal scroll masking.
- [ ] Drawer panel `w-full sm:max-w-xl`, no mobile pl10; panel scroll area min-h0 overflow-y-auto, footer shrink0. Check long names break safely and close remains visible.
- [ ] Procurement bottom summary remains fixed: attach ref, ResizeObserver writes measured height into page padding-bottom plus16px. Initial padding pb28 remains fallback before first measure; bar uses bottom safe-area inset. Always show invalid reason count on mobile, including selected quantity<=0 reason; positive selection/adjustment conditions unchanged. Label CTA short “Xem lại (N)”; approval remains modal. Do not hide validation solely with `hidden lg:flex`.
- [ ] Browser 320/375/414/768/1280, text long, large sums, error visible, missing data, no permissions; model selection keyboard, tab arrows, mobile selects, drawer footer reachable. Verify last list row scrolls fully above bottom bar.
- [ ] Run types/build/lint, existing forecast-check tests if affected. Checkpoint if requested: `fix(planning): complete keyboard and mobile interactions`.

## Task 5 — Integrated gates and handoff

- [ ] Run `node --test resources/js/components/planning/modelRecommendation.test.ts resources/js/components/planning/planningFormatters.test.ts resources/js/components/planning/forecastCheckView.test.ts resources/js/components/planning/forecastCheckRequests.test.ts`.
- [ ] Run separately `npm run types:check`, `npm run build`, `npx eslint resources/js/pages/planning resources/js/components/planning resources/js/hooks/usePrefersReducedMotion.ts`.
- [ ] Audit light/dark contrast, focus instant visibility, native disabled+cursor+opacity, loading/error/success messages, and reduced motion. No generic “58/58 pass” without applicability/evidence.
- [ ] Add Plan 2 section to `docs/superpowers/plans/2026-10-14-planning-ui-verification.md`: viewport/theme, fixture, keyboard steps, ratios, result, blocker. Update routing doc for shared DatePicker and PlanningDialog.
- [ ] Inspect diff: datetime-local untouched; no algorithm/request shape changed. PHP tests required only if PHP unexpectedly changed; then full sqlite suite and composer types:check.
- [ ] Commit gate only on request. Handoff to plan3 with stable planning content/overlays.
