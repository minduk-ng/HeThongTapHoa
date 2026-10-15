# Responsive Shared Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn tất Major #6 ở navbar chung, giữ đủ routes theo quyền và thao tác desktop/mobile.

**Architecture:** Sidebar tiếp tục sở hữu navigation state và dữ liệu server. Tách helper thuần normalize/active/placement để kiểm thử; mobile disclosure render cùng dữ liệu, desktop giữ dropdown/flyout. Dùng ResizeObserver đo fit, không tạo menu hoặc permissions hard-code.

**Tech Stack:** React/TypeScript, Inertia, Tailwind, DOM ResizeObserver, Node `node:test` và browser DevTools.

## Global Constraints

- Spec `docs/superpowers/specs/2026-10-14-responsive-navigation-design.md` đã duyệt. Thực hiện sau plan1/2.
- GitNexus impact upstream trước sửa Sidebar, handlers, DashboardLayout và types consumers; cảnh báo HIGH/CRITICAL trước edit.
- Không thêm dependency. Không đổi route registry, permission backend, theme/logout behavior; hideNavbar vẫn không render navbar.
- Dưới768 luôn gọn; >=768 chỉ desktop khi toàn bộ nội dung đủ chỗ, dự phòng16px. Dropdown trong viewport lề8px; hit area44px; hover close200ms.
- Native buttons/links, disclosure semantics; không dùng role menu giả. Reduced-motion, focus-visible, light/dark.
- Commit chỉ khi được yêu cầu; status/diff/log + detect-changes staged + diff-check trước commit.
- Browser 320/375/414/768/1280×800/1920, nhiều tập quyền, viewport thấp; không đánh dấu pass từ source.

## File map

Create `resources/js/components/navigation/navigationUtils.ts` + `.test.ts`: normalize và active route, compact decision và flyout placement.
Create `resources/js/components/navigation/MobileNavigation.tsx`: controlled disclosure, render server links.
Modify `resources/js/components/Sidebar.tsx`: state, desktop panels, sizing/focus/Escape.
Modify `resources/js/types/auth.ts` chỉ để mô tả mixed navigation đúng shape runtime nếu cần; không cast any để lờ cấu trúc.
Modify `DashboardLayout.tsx` chỉ khi browser chứng minh cần nối fullWidth sizing; update routing doc và verification ledger.

## Task 1 — Normalize navigation và route matching

**Interfaces:** helper accepts unknown network structure and returns explicit shape:
```ts
export interface NavLink { id: number; name: string; route_path: string }
export interface NavGroup { name: string; links: NavLink[]; subs: { name: string; links: NavLink[] }[] }
export function normalizeNavigation(value: unknown): NavGroup[];
export function activeRoute(currentUrl: string, paths: readonly string[]): string | null;
export function needsCompact(viewport: number, available: number, required: number): boolean;
export function flyoutSide(left: number, right: number, width: number, viewport: number): 'right' | 'left' | 'inline';
```
- [ ] Impact Sidebar, type consumers. Read actual middleware navigation shape including mixed groups before implementing normalize. Preserve Object.entries order; only accept entries with valid id/name/route_path. Empty groups omitted.
- [ ] Write red tests:
```ts
import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { activeRoute, needsCompact, flyoutSide, normalizeNavigation } from './navigationUtils.ts';
test('route is most specific and segment bounded', () => {
    equal(activeRoute('/planning/products?page=2#list', ['/planning', '/planning/products']), '/planning/products');
    equal(activeRoute('/planning-other', ['/planning']), null);
    equal(activeRoute('/anything', ['/']), null);
});
test('mixed groups preserve links and subgroups', () => {
    const link = { id: 1, name: 'Tổng quan', route_path: '/planning' };
    deepEqual(normalizeNavigation({ Planning: { 0: link, __subs: { Reports: [link] } } }),
        [{ name: 'Planning', links: [link], subs: [{ name: 'Reports', links: [link] }] }]);
    deepEqual(normalizeNavigation(null), []);
});
test('fit is based on width, not role names', () => {
    equal(needsCompact(767, 1000, 100), true);
    equal(needsCompact(1280, 900, 890), true);
    equal(needsCompact(1280, 906, 890), false);
});
test('flyout flips or stacks before leaving viewport', () => {
    equal(flyoutSide(100, 292, 240, 1280), 'right');
    equal(flyoutSide(1000, 1192, 240, 1280), 'left');
    equal(flyoutSide(100, 292, 240, 414), 'inline');
});
```
- [ ] Run `node --test resources/js/components/navigation/navigationUtils.test.ts`; expected module missing.
- [ ] Implement helpers with strict guards. activeRoute strip query/hash/trailing slash then exact or segment prefix, '/' exact-only; longest path wins. Core fit/placement:
```ts
return viewport < 768 || required + 16 > available; // needsCompact
// flyoutSide, separate function:
if (right + 8 + width <= viewport - 8) return 'right';
if (left - 8 - width >= 8) return 'left';
return 'inline';
```
- [ ] Replace repeated startsWith checks with single active path; group active if any descendant path equals result. aria-current only exact chosen nav item, not parent links. Do not rename symbols through find/replace.
- [ ] Run tests/types. Checkpoint if requested: `fix(navigation): normalize groups and resolve active routes`.

## Task 2 — Compact disclosure and reliable fit detection

**Interfaces:** MobileNavigation props `{groups: NavGroup[]; activePath: string|null; openGroup: string|null; openSub: string|null; onGroupChange:(name:string|null)=>void; onSubChange:(name:string|null)=>void; onNavigate:()=>void}`. Sidebar owns `isCompact`, `mobileOpen` and existing group state; no independent mobile data fetch.

- [ ] Impact Sidebar and layout if editing; read auth/navigation timing and fullWidth consumers.
- [ ] Build controlled mobile markup:
```tsx
<button type="button" aria-expanded={openGroup === group.name}
    aria-controls={panelId} onClick={() => onGroupChange(openGroup === group.name ? null : group.name)}
    className="flex min-h-11 w-full items-center justify-between">
    <span className="min-w-0 truncate">{group.name}</span>
    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
</button>
```
IDs via useId prefix+stable index, not raw user names. Panel hidden/unmounted when closed, links maintain route and aria-current. Subgroups vertical accordion; flat links after subs for mixed group. Active branch opens when menu first opens, not on every hover/re-render.
- [ ] Topbar compact Menu button `aria-expanded/controls`, branding max-width constrained, avatar shrink0. Panel is sibling below topbar in header flow, max-height `calc(100dvh - 4rem)` with vertical scroll, not a modal overlay. onNavigate clears menu/group/sub/pin before route visit.
- [ ] Fit measurement: keep noninteractive hidden `aria-hidden` max-content measuring row containing brand dimensions/group text with same type/padding/gaps and avatar width; no duplicated links/IDs/focusables. Measure actual available header inner width and required total; call needsCompact. ResizeObserver observes available container and measuring row; listen document.fonts.ready; resize updates viewport. SSR starts compact; layout effect measures. Cleanup observer/listener; no oscillation from measuring currently hidden desktop nav.
```ts
const update = () => setIsCompact(needsCompact(window.innerWidth, availableRef.current!.clientWidth, measureRef.current!.scrollWidth));
const observer = new ResizeObserver(update);
observer.observe(availableRef.current!);
observer.observe(measureRef.current!);
```
Guard refs and canceled flag before font-ready callback; setState only if changed. Measurement includes responsive gaps and brand width, not guessed role-dependent width.
- [ ] On compact/desktop switch close invalid panel states, restore focus to visible Menu or corresponding desktop group button if current focus was inside hidden navigation. Keep focus unchanged elsewhere. Route change closes both mobile and desktop panels.
- [ ] Browser: admin maximum groups vs staff minimal, long names, slow font, resizing open panel; fullWidth and hideNavbar. Click/touch all links; no menu item invented or lost.
- [ ] Run tests/types/build/lint. Checkpoint if requested: `feat(navigation): add width-aware compact disclosure`.

## Task 3 — Desktop viewport placement and keyboard lifecycle

**Interfaces:** same NavGroup/helpers; retain existing mouse pin state and 200ms timer. refs for trigger/panels support focus restore and size measurement.

- [ ] Impact handleMouseEnter/Leave/GroupClick and effects; capture existing correct gap-crossing behavior to preserve.
- [ ] Level1 dropdown left clamp using trigger rect, panel width, viewport:
```ts
const x = Math.max(8, Math.min(triggerRect.left, window.innerWidth - panelWidth - 8));
```
Apply positioning relative to actual containing block or fixed portal consistently. If portal used, outside-click checks include panel refs, not navRef only. Level2 calls flyoutSide; left/right uses8px gap, inline fallback within first panel. Available height = viewport−top−8, overflow-y auto. Separate scroll container from flyout overflow so level2 never clipped.
- [ ] Add aria-expanded/controls to all group buttons; visible link aria-current. Keyboard native Enter/Space works; Escape handler first closes sub and focuses parent subbutton, next closes group/pin and focuses group trigger; compact outer closes last to Menu button. Remove conflicting old Escape handlers if any.
- [ ] Keep hover200ms, cancel timer when returning through gap, reset subgroup only on genuinely different group. Do not schedule hover close when keyboard focus remains inside open panels. Clear timeout on unmount/mode change.
- [ ] Outside pointerdown ignores nav+panel+avatar refs appropriately; closes only unrelated panels; selected link click not canceled. Native disclosure means no arrow-key menu role contract, Tab order remains DOM order. If portal causes illogical order, retain panels in DOM or explicitly focus first link on keyboard-open and return on close; verify actual sequence.
- [ ] Style hit areas min44, focus-visible immediate; motion-reduce variants for rotating chevron; navbar stacking below planning native dialogs. Keep same theme/logout actions.
- [ ] Browser test right-edge group, narrow desktop fallback, tall submenu, keyboard Escape levels, hover gap, pinned state, touch, avatar interaction. Verify `/planning` not separately active on product page and query strings harmless.
- [ ] Run test helper/types/build/lint. Checkpoint if requested: `fix(navigation): constrain flyouts and complete keyboard dismissal`.

## Task 4 — Cross-module regression and final audit

- [ ] Run `node --test resources/js/components/navigation/navigationUtils.test.ts`, `npm run types:check`, `npm run build`, `npx eslint resources/js/components/Sidebar.tsx resources/js/components/navigation resources/js/layouts/DashboardLayout.tsx` separately.
- [ ] Browser matrix: 320/375/414/768/1280×800/1920; light/dark; flat/sub/mixed/empty groups; long labels; admin/manager/staff permissions; resize and viewport low. Use generated/nonsecret fixture data or approved test account, never DB reset.
- [ ] Smoke report submenu, manager list, planning all pages, POS/layout fullWidth, screen hideNavbar; ensure menu panel closing restores content size/scroll, modal stays above navbar.
- [ ] End-to-end: open forecast-checks via mobile menu, pick date, run only in approved test environment, select candidate by keyboard, open procurement review and close; selected source/horizon retained. Confirm native datetime inputs remain unchanged.
- [ ] Append Plan3 section to verification ledger with evidence and blockers. Update routing doc: server navigation source, mobile disclosure, width fit, flyout placement, active route and focus contract.
- [ ] Cross-check audit coverage: plan1 #1/#2/#7/#8/#10; plan2 #3/#4/#5/#9/date plus planning #6; plan3 shared #6. No code-only claim of visual pass.
- [ ] Review diff and commit gate when requested. PHP unchanged => no new PHP test requirement; if touched unexpectedly full sqlite suite + composer types:check required.
