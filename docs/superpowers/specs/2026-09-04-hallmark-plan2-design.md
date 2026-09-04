# Design: Hallmark Fixes Plan 2 — Minor anti-pattern (~20 mục)

Ngày: 2026-09-04
Trạng thái: Approved

## Bối cảnh

Plan 1 đã xử critical + major. Plan 2 dọn ~20 minor (taste/UX).

## 13. Icon-tile cards → bỏ tile, lead bằng số

- `DashboardManager.tsx:154-221` (4 KPI): bỏ tile icon + eyebrow → số lớn `font-display text-3xl tabular-nums` + label sentence-case nhỏ bên dưới.
- `ShiftsPage.tsx:307-335` (3 stat): bỏ tile, giữ số.
- `KitchenDisplay.tsx:482`, `UsersPermission.tsx:168` — bỏ tile icon, thay bằng icon nhỏ inline + text (không nền màu chặn).
- (ManagerPageLayout tile đã xử Plan 1.)

## 14. Eyebrow mỗi section

`text-xs uppercase tracking-wider` trên 15 chỗ (DashboardManager:157,183,203,224 / ShiftsPage:221 / Settings:288 / OrderList:346 / OrderDetail:264 / RolesManager:313 / UsersPermission:302,381 / StockVoucherDetail:240,314) → sentence case (`text-sm font-medium text-zinc-600`). Giữ 2 KPI dashboard.

## 15. 3-column grids đều

`DashboardManager.tsx:241`, `ShiftsPage.tsx:306`, `PagesManager.tsx:399,482` → biến thể width (first card rộng hơn `lg:col-span-2` hoặc grid 2 cột + 1 cột chồng) hoặc stack mobile clean.

## 16. Trùng FAB boilerplate ×6 + scrim ×5 (thận trọng)

- Nếu 6 chỗ copy giống nhau trong phạm vi nhỏ → có thể nên extract nhưng ĐÁNH GIÁ: nếu quá 0.5 ngày thì bỏ, ghi vào backlog. Trong plan: bỏ mục này (giữ nguyên — vì nó là việc merge 6 nơi vốn đã độc lập; để plan riêng if cần).
- **Quyết định: SKIP mục 16** (đưa về plan 3 nếu user muốn).

## 17. Theme drift Settings

`Settings.tsx:246,288` legacy `btn-primary/indigo` → đồng bộ zinc+sky hiện đại (dùng class hiện có).

## 18. Spinner flash

5 form (LoginForm:205, SignupForm:133, ForgotPassword:54, ResetPassword:94, ProductFormDrawer:299): `Loader2 animate-spin` → show sau MIN_DELAY 300ms (state `showSpinner` bật sau setTimeout 300ms — nếu submit xong nhanh thì không chớp).

## 19. animate-bounce vô hạn

`DashboardManager.tsx:301` → `animate-pulse` 1 lần (hoặc static badge).

## 20. zIndex 9999

`SettingsOtpOverlay.tsx:184` → `z-[100]` (khớp hệ modal app).

## 21. w-screen drawers → w-full

8 drawers (TableFormDrawer:186, CustomerFormDrawer:88, SupplierFormDrawer:92, CategoryFormDrawer:87, ProductFormDrawer:206, IngredientFormDrawer:99, RecipeFormDrawer:140, ReservationFormDrawer:73): trong `fixed inset-0` → `w-full` + max-w giữ.

## 22. Tiny-type sàn

- `text-[9px]`/`text-[10px]` trong UI → `text-[11px]` (giữ 9-10px ONLY trong print CSS/dòng dữ liệu in ReceiptPrint).
- Không đổi 216 chỗ cùng lúc — chỉ nơi nhìn thấy (modal/drawer/bảng) + các chỗ `text-[10px]` trở xuống trên UI. Đặt quy ước: UI copy ≥11px, interactive ≥12px.

## 23. Ellipsis '...' → '…'

7 file button label: CategoryFormDrawer:167, TableFormDrawer:433, OtpVerify:266, SignupForm:134, LoginForm:206, ForgotPassword:55, ResetPassword:95 → `…` (placeholder giữ `...` nếu có).

## 24. font-display gaps

9 chỗ: Settings:215,264,282,331; SettingsOtpOverlay:195; ReservationFormDrawer:79; PromotionAnalyticsCharts:15,30; PromotionStatsCards:28; PromotionCodesModal:150; PromotionInvoicesModal:119 — thêm `font-display` vào heading.

## 25. Uppercase headings

`DashboardManager.tsx:389,414` (`text-xs uppercase tracking-widest text-slate-400`) → sentence case (`text-sm font-medium text-zinc-600`).

## 26. [X] mock-checkbox

`ReceiptPrintModal.tsx:262` ([X] Tiền mặt / [X] Chuyển khoản QR — cả 2 checked) → in đúng: 1 checked 1 unchecked, hoặc bỏ [X] và dùng bullet.

## 27. Stat values tabular-nums

`PromotionStatsCards.tsx:33` + quét stat values thiếu `tabular-nums` (giữ DataTable/ReportTable đã đúng).

## 28. Gradient logo tile

`Auth.tsx:38` `bg-gradient-to-br from-sky-500 to-sky-600` → flat `bg-sky-600` + icon màu.

## 29. Glassmorphism Auth:36

`bg-white/90 backdrop-blur-xl` → `bg-white` solid + border hairline (đổi cùng lúc C2 palette Auth).

## 30. Spacing rhythm

Kiểm tra 2-3 chỗ overspaced (mọi section `p-6` đều) → nếu phát hiện quá đều nhưng không quan trọng, bỏ qua (minor).

## Testing

- Chỉ UI. `npx tsc`, `npm run build`, `npx eslint .`, `php artisan test`.
- Smoke các màn đụng: Auth, Settings, POS, Dashboard.

## Global Constraints

- KHÔNG thêm dependency.
- KHÔNG đổi logic/copy ý nghĩa (chỉ style + label a11y).
- Đổi theo hệ zinc (đã thống nhất Plan 1).
