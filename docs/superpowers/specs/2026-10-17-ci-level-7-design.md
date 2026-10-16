# Kế Hoạch Đạt Chuẩn CI Xanh 100% với PHPStan Level 7

## 1. Mục tiêu & Bối cảnh
- **Bối cảnh hiện tại**:
  - `phpstan.neon` đã cấu hình `level: 7` và phân tích tĩnh đạt 0 lỗi (`composer types:check` passed).
  - Tuy nhiên, CI pipeline (`.github/workflows/tests.yml` & `lint.yml`) không thể pass 100% do vi phạm định dạng mã nguồn:
    - Pint: 12 file PHP lệch chuẩn formatting/imports (`vendor/bin/pint --test` fail).
    - Prettier: 143 file trong `resources/` chưa chuẩn hóa formatting (`npm run format:check` fail).
  - Ma trận PHP trong `tests.yml` có `8.5` (bản chưa GA, có nguy cơ gây lỗi không mong muốn trên runner).
- **Mục tiêu**:
  - Đạt 100% kiểm tra CI xanh (All Green) trên GitHub Actions với PHPStan Level 7.
  - Sạch toàn bộ vi phạm style (Pint + Prettier) mà không làm thay đổi logic nghiệp vụ.
  - Tinh chỉnh ma trận PHP ổn định trên CI.

## 2. Phạm vi thay đổi (Scope of Work)

### 2.1. Chuẩn hóa PHP Style (Laravel Pint)
- Chạy `composer lint` (`pint --parallel`) để tự động sửa 12 file PHP:
  - `app/Console/Commands/BenchmarkTopK.php`
  - `app/Http/Controllers/Manager/StockVoucherController.php`
  - `app/Http/Controllers/Planning/ProcurementRecommendationController.php`
  - `app/Http/Controllers/Staff/RefundController.php`
  - `app/Services/KitchenDispatchService.php`
  - `app/Services/Manager/DashboardService.php`
  - `app/Services/Manager/PaidProductRankingService.php`
  - `tests/Feature/Kitchen/KitchenDispatchAdminTest.php`
  - `tests/Feature/Kitchen/KitchenDispatchFlowTest.php`
  - `tests/Feature/Manager/PaidProductRankingTest.php`
  - `tests/Feature/Manager/PaidProductRankingTopKFixTest.php`
  - `tests/Feature/Planning/PlanningResultSummaryTest.php`
- Đảm bảo `vendor/bin/pint --test` exit code 0.

### 2.2. Chuẩn hóa Frontend Style (Prettier & ESLint)
- Chạy `npm run format` (`prettier --write resources/`) để tự động format các file giao diện.
- Đảm bảo:
  - `npm run format:check` pass 100%.
  - `npm run lint:check` pass 100% (0 errors).
  - `npm run types:check` (`tsc --noEmit`) pass 100%.

### 2.3. Cấu hình CI Workflow (`.github/workflows/tests.yml`)
- Cập nhật ma trận PHP thành:
  - `php-version: ['8.3', '8.4']` (phiên bản ổn định chính thức cho Laravel 13).
  - Đảm bảo runner không gặp lỗi do các dependency bên thứ ba chưa tương thích PHP 8.5 nightly.

## 3. Tiêu chí nghiệm thu (Acceptance Criteria)

Tất cả các lệnh sau phải vượt qua (exit code 0) trên local và CI:
1. `npm run lint:check` -> ESLint pass 0 errors.
2. `npm run format:check` -> Prettier pass 0 errors.
3. `npm run types:check` -> TypeScript `tsc --noEmit` pass 0 errors.
4. `npm run build` -> Vite build production thành công.
5. `npm run test:report-export` -> Node test runner pass 7/7 tests.
6. `composer lint:check` (`vendor/bin/pint --test`) -> 0 style issues.
7. `composer types:check` (`phpstan analyse --memory-limit=1G`) -> 0 errors ở `level: 7`.
8. `vendor/bin/pest tests/Unit` & feature test flows pass 100%.

## 4. Rủi ro & Giải pháp phòng ngừa
- **Rủi ro**: Lệnh format có thể làm biến đổi cấu trúc code không mong muốn.
  - **Phòng ngừa**: Không chỉnh sửa logic bằng tay; sau khi format tự động chạy toàn bộ test suite (`pest`, `tsc`, `reportExport`) để verify tính toàn vẹn.
