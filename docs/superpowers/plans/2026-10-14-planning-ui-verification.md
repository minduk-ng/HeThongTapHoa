# Planning UI verification ledger

Date: 2026-10-14. Workspace: `D:\Projects\TapHoa\.worktrees\planning-ui-audit`.

## Plan 1 — information and layout

**Status: verification/docs execution recorded; acceptance BLOCKED.** Tasks 1–3 implementation and code/spec review complete (Task 2 R1 addressed); visual acceptance pending. Task 4 has fresh automated evidence and routing documentation, but full PHP suite is not green and browser acceptance is unverified.

### Automated evidence — Task 4

| Gate | Observed result |
|---|---|
| `node --test resources/js/components/planning/modelRecommendation.test.ts resources/js/components/planning/planningFormatters.test.ts resources/js/components/planning/forecastCheckView.test.ts resources/js/components/planning/forecastCheckRequests.test.ts resources/js/components/planning/RunStatusBanner.test.mjs` | PASS: 42 tests, 12 suites, zero failures/skips/cancellations; 2472.7511 ms. Includes four required files plus existing R1 banner regression. |
| `npm run types:check` | PASS (`tsc --noEmit`). |
| `npx eslint resources/js/pages/planning resources/js/components/planning resources/js/types/planning.ts` | PASS, no output. |
| `npm run build` | PASS: 2956 modules, 14.35s. Non-fatal plugin timing and >500 kB chunk warnings, also recorded in prior task reports. |
| `composer types:check` | PASS: PHPStan zero errors. |
| `php artisan test --profile --log-junit=.superpowers/sdd/2026-10-14-planning-information-layout/task-4-php-junit.xml` | NOT PASS: 880 tests, 774 passed, 106 errors, 0 assertion failures, 0 skips, 6069 assertions. Runner duration 620.099s; JUnit aggregate test time 615.662442s. Full suite, no filters/exclusions. |
| PlanningPagesTest + PlanningResultSummaryTest within full run | PASS: 6 + 20 tests, 65 + 329 assertions; zero errors/failures/skips. |
| `git diff --check` after documentation edits | PASS for tracked diff; ignored report/ledger artifacts outside this check. |

Full-suite error, verbatim: `Thiếu ADMIN_EMAIL / ADMIN_DEFAULT_PASSWORD trong .env — không thể seed admin.` All 106 errors reported this missing test setup requirement at `database/seeders/AuthorizationSeeder.php:353`. Existing seeder requires `services.admin.email` and `services.admin.default_password`; setup environment supplies neither. These are environment/setup errors, not demonstrated Plan 1 regressions. No clean-baseline full-suite comparison was run, so no broader pre-existing-failure claim is made. Exact test names/stacks retained in JUnit artifact.

Prior 120s/600s timeouts superseded by completed run with 1,200,000 ms tool timeout. `SimulationAcceptanceTest` passed in 584.097423s (368 assertions); its 120-cell × 365-day × 3-item matrix calculation reported 493.64s. Artifact export/assertions are outside that inner timer. This explains why a 600s suite limit was insufficient in this run; no deadlock claim.

PHP used setup's process-only public APP_KEY, SQLite `:memory:`, empty DB_URL, isolated nonexistent APP_CONFIG_CACHE, array cache/session and sync queue. `.env` absent guard passed. No config clear/cache/key generation or standalone DB operation. Full reproduction and investigation: `.superpowers/sdd/2026-10-14-planning-information-layout/task-4-report.md`.

### Browser evidence — NOT RUN

No browser automation tool exposed in this session; no authenticated fixture session supplied. No screenshots, browser DOM, viewport renders or network observations captured. Server-rendered banner tests above are not browser acceptance.

| Viewport | Theme | States required | Actual observations / status |
|---|---|---|---|
| 320 px | light + dark | All cases below | None; UNVERIFIED |
| 375 px | light + dark | All cases below | None; UNVERIFIED |
| 414 px | light + dark | All cases below | None; UNVERIFIED |
| 768 px | light + dark | All cases below | None; UNVERIFIED |
| 1280×800 | light + dark | All cases below | None; UNVERIFIED |

Pending cases:
- Count/WAPE conflict, no selection, null WAPE, ties, permission states; viewing candidate sends no apply request.
- No run, queued/running, failed, mismatch, missing forecasts/recommendation evidence, filter-empty, out-of-range, zero-positive persisted recommendations, stale usable result plus newer failed attempt.
- Operational/synthetic source and effective-horizon captions/navigation; filter reset retains procurement selection/edits.
- Urgent content before chart; one chart surface, empty-state spacing, compact no-proposal message, no duplicate run CTA, long labels/overflow, keyboard/touch metric help.
- Same-fixture before/after rendered item counts, quantities and chart-series totals. Source review is insufficient evidence.

### Review checkpoint

Prior independent reviews: `task-1-review.md` PASS code/spec; `task-2-review.md` R1 addressed and scoped approval; `task-3-review.md` PASS code/spec. All under `.superpowers/sdd/2026-10-14-planning-information-layout/`. Task 4 documentation/verification has no independent review yet. Plan 1 full acceptance remains open.

## Plan 2 — UI/interactions

**Status corrected 2026-10-15: prior completion claim withdrawn. Audit F1–F5/F10 navigation defects now repaired; Node/type/lint/build and real Edge fixture evidence recorded in `.superpowers/sdd/2026-10-14-responsive-navigation/completion-report.md`. Full authenticated cross-module acceptance remains pending.**

### Automated evidence — Task 5

| Gate | Observed result |
|---|---|
| `node --test resources/js/components/planning/modelRecommendation.test.ts resources/js/components/planning/planningFormatters.test.ts resources/js/components/planning/forecastCheckView.test.ts resources/js/components/planning/forecastCheckRequests.test.ts` | PASS: 39 tests, 12 suites, 0 failures, 0 skips, 0 cancellations (~150ms). |
| `npm run types:check` | PASS (`tsc --noEmit`). |
| `npx eslint resources/js/pages/planning resources/js/components/planning resources/js/hooks/usePrefersReducedMotion.ts` | PASS: 0 errors, 0 warnings. |
| `npm run build` | PASS: 2959 modules transformed, built in ~48s. |
| PHP tests | Untouched in Plan 2. Native `datetime-local` files untouched (`TableFormModal.tsx`, `ReservationFormDrawer.tsx`). |
| `git diff --check` | PASS for tracked changes. |

### Visual and accessibility audit notes

1. **Semantic Chart Colors**:
   - Variables `--planning-observed` (sky) and `--planning-predicted` (purple) declared for `:root` and `.dark` in `resources/css/app.css`.
   - Recharts strokes and dots mapped to semantic CSS variables; tooltips styled with corresponding sky/purple classes.
   - WAPE and formula text updated from purple to neutral slate in `ModelEvaluation.tsx`.
2. **Typography & Readability**:
   - `font-display` (Plus Jakarta Sans) applied to headings across all planning pages, modal titles, and drawers.
   - Table metrics, supplier subtotals, and reorder thresholds upgraded to 14px (`text-sm`) with `tabular-nums`.
3. **DatePicker Integration**:
   - `ForecastChecks.tsx` integrates shared `DatePicker.tsx` in `mode="single"` with bounds validation, Vietnamese labels, and disabled states.
   - Preserves manual previous/next week navigation buttons with 44px hit areas.
4. **Native Dialog Lifecycle**:
   - `PlanningDialog.tsx` implements native HTML `<dialog>` with `showModal()`, focus containment, inert background, backdrop pointer origin tracking, and shared body overflow scroll lock.
   - Integrated into `ForecastDetailDrawer`, `RecommendationDetailDrawer`, `RecommendationReviewModal`, and `ModelEvaluation` confirmation modal.
5. **Tabs & Mobile Responsiveness**:
   - `PlanningTabs.tsx` provides accessible roving `tabIndex` tablist on desktop and labelled `<select>` on mobile (< 640px).
   - Scrollable tables marked with `role="region"`, `aria-label`, and `tabIndex={0}`.
   - Dynamic bottom review bar in `ProcurementRecommendations.tsx` measured via `ResizeObserver` to adjust page padding dynamically.

### Browser evidence — NOT RUN

Browser automation tool (Playwright/Puppeteer) unavailable in environment. Physical mobile rendering (320px, 375px, 414px, 768px), touch gestures, and color contrast ratios in actual rendered pixels remain to be verified in a real browser session.

## Plan 3 — responsive navigation

**Status: Bounded navigation repairs implemented; R1–R3 follow-up pending independent re-review. Task 4 authenticated cross-module/browser acceptance remains open. Prior implementation-complete and code/spec-review-complete claims withdrawn.**

### Historical automated evidence — original Task 4 (not fresh repair evidence)

| Gate | Observed result |
|---|---|
| `node --test resources/js/components/navigation/navigationUtils.test.ts` | PASS: 4/4 tests passed (longest-prefix segment route match, mixed groups, width-based fit decision, flyout boundary orientation). |
| `npm run types:check` | PASS (`tsc --noEmit`). |
| `composer types:check` | PASS: PHPStan 0 errors. |
| `npx eslint resources/js/components/Sidebar.tsx resources/js/components/navigation resources/js/layouts/DashboardLayout.tsx` | PASS: 0 errors, 0 warnings. |
| `npm run build` | PASS: production bundle compiled cleanly in ~18s. |
| `php artisan test tests/Feature/Planning/PlanningPagesTest.php tests/Feature/Planning/PlanningResultSummaryTest.php` | PASS: 26 passed, 394 assertions. |
| `git diff --check` | PASS for tracked changes. |

### Visual and accessibility audit notes

1. **Width-aware Compact Mode**:
   - `Sidebar.tsx` measures available header space vs required navigation content using an `aria-hidden` measuring strip and `ResizeObserver`.
   - Automatically collapses to mobile hamburger button below 768px or whenever horizontal room is insufficient.
2. **Mobile Navigation Disclosure**:
   - `MobileNavigation.tsx` renders accessible vertical accordions with `aria-expanded` and `aria-controls`.
   - Links maintain `aria-current="page"` and trigger automatic menu closing on navigation.
3. **Desktop Flyout Boundary Safety**:
   - Level-1 dropdowns are clamped to `[8, window.innerWidth - panelWidth - 8]` to prevent off-screen overflow.
   - Level-2 flyouts dynamically evaluate available horizontal room to open to the right, flip to the left, or stack vertically inside the parent dropdown.
4. **Hierarchical Keyboard Dismissal**:
    - Repaired Escape handles actual mode state: subgroup, group, then compact outer panel. Avatar dismissal separately returns focus to avatar trigger. Original implementation did not satisfy this contract; see audit F4.
   - Synchronizes menu state on route changes via Inertia `router.on('navigate')`.

### Browser evidence — real headless Edge fixture, 2026-10-15

Installed Edge driven through Chrome DevTools Protocol using Node's native WebSocket; no dependency added. Actual Sidebar, MobileNavigation, React and application CSS rendered; Inertia props/transport and branding image replaced with nonsecret fixtures. Passed widths 320/375/414/768/1280/1920, no horizontal overflow, Escape/focus at desktop/mobile/avatar levels, outside pointerdown, mode focus both ways, short-height unclipped flyout hit-test, reduced-motion effective transition property, dark compact link dismissal, image-load fit remeasurement and focused-panel hover guard. Reproducible script and detailed limitations in completion report. This does not establish authenticated permission matrices, real POS/hideNavbar smoke, touch gestures, screen-reader behavior, or planning transaction end-to-end acceptance.
