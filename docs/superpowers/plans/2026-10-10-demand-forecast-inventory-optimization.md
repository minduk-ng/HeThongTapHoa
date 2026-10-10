# Demand Forecast and Inventory Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng module dự báo nhu cầu 7/30 ngày, đánh giá SMA/Holt-Winters bằng rolling-origin, quy đổi nhu cầu sang nguyên liệu và tạo kế hoạch mua hàng có thể kiểm tra, giải thích và xác nhận.

**Architecture:** Thuật toán là các service PHP thuần, không phụ thuộc Eloquent để unit test nhanh. Forecast run và kết quả được lưu append-only; job mới chỉ trở thành active sau transaction thành công. Dữ liệu mô phỏng dùng chung database và bảng hóa đơn hiện có, được phân biệt bằng `synthetic_dataset_id`; kế hoạch mua hàng tách khỏi phiếu nhập kho để không tăng tồn trước khi nhận hàng.

**Tech Stack:** Laravel 13, PHP 8.2+, MySQL/SQLite test, Laravel Queue/Scheduler, Inertia 3, React 19, TypeScript 5.7, Tailwind CSS 4, Recharts 3, Pest, PHPStan level 7.

## Global Constraints

- Nguồn sự thật: `docs/superpowers/specs/2026-10-10-demand-forecast-inventory-optimization-design.md`.
- Chỉ dùng SMA 7/14/28 và Holt-Winters Additive/Multiplicative; không thêm dependency dự báo.
- Chỉ dùng MAE, RMSE và WAPE làm metric chọn mô hình.
- Dữ liệu mô phỏng dùng cùng database nhưng mọi invoice mô phỏng bắt buộc có `synthetic_dataset_id`; một forecast run không trộn dữ liệu thật và synthetic.
- Không chạy `migrate:fresh`, `migrate:refresh`, `db:wipe`, `TRUNCATE` hoặc lệnh phá dữ liệu trên MySQL.
- Không tạo Stock Voucher khi mới duyệt kế hoạch mua hàng; tồn kho chỉ tăng khi xác nhận hàng thực nhận qua flow hiện có.
- Mọi permission mới theo `{page_route_segment}.{action_name}` và được đăng ký ở cả `AuthorizationSeeder` và `RoleController`.
- UI dùng `DashboardLayout`, Plus Jakarta Sans + Inter, Lucide, Recharts, `tabular-nums`, light/dark mode; không dựng lại global navigation.
- Mọi mutation có guard re-entry, timeout 8 giây, server-side authorization, validation và audit phù hợp.
- Mỗi task dùng TDD, không suppression/baseline/skip test.
- Sau task cuối: `php artisan test`, `composer types:check`, `vendor/bin/pint --test`, `npm run lint:check`, `npm run types:check`, `npm run build`.

## File Structure

### Domain and persistence

- `config/forecasting.php`: lịch, windows, horizon, metric threshold, synthetic feature flag.
- `database/migrations/2026_10_10_000001_create_forecasting_core_tables.php`: datasets, runs, aggregates, evaluations, forecasts.
- `database/migrations/2026_10_10_000002_create_inventory_planning_tables.php`: supplier policies, recommendations, procurement plans/items.
- `database/migrations/2026_10_10_000003_add_synthetic_dataset_to_invoices.php`: source marker on invoices.
- Models under `app/Models/`: persistence only; no forecasting math.

### Algorithms

- `app/Services/Forecasting/MovingAverageForecaster.php`: SMA predictions.
- `app/Services/Forecasting/HoltWintersForecaster.php`: additive/multiplicative triple exponential smoothing.
- `app/Services/Forecasting/ForecastMetrics.php`: MAE/RMSE/WAPE.
- `app/Services/Forecasting/RollingOriginEvaluator.php`: leak-free folds.
- `app/Services/Forecasting/ModelSelector.php`: deterministic winner selection.
- `app/Services/Forecasting/SyntheticDemandGenerator.php`: seeded synthetic demand.
- `app/Services/Forecasting/DemandSeriesBuilder.php`: invoice-to-daily-series aggregation.
- `app/Services/Forecasting/ForecastOrchestrator.php`: transactional run publication.
- `app/Services/Forecasting/IngredientDemandCalculator.php`: BOM conversion and hash.
- `app/Services/Forecasting/InventoryOptimizer.php`: SS/ROP/EOQ and rounding.
- `app/Services/Forecasting/RecommendationFreshness.php`: stale comparison.

### Queue and HTTP

- Jobs under `app/Jobs/Planning/` own long-running execution.
- Commands under `app/Console/Commands/Planning/` dispatch jobs; HTTP never executes algorithms synchronously.
- Controllers under `app/Http/Controllers/Planning/` provide Inertia pages and mutations.
- Pages under `resources/js/pages/planning/`; shared components under `resources/js/components/planning/`.

---

### Task 1: Forecasting schema, provenance, and model contracts

**Files:**
- Create: `config/forecasting.php`
- Create: `database/migrations/2026_10_10_000001_create_forecasting_core_tables.php`
- Create: `database/migrations/2026_10_10_000002_create_inventory_planning_tables.php`
- Create: `database/migrations/2026_10_10_000003_add_synthetic_dataset_to_invoices.php`
- Create: `app/Models/SyntheticDataset.php`
- Create: `app/Models/ForecastRun.php`
- Create: `app/Models/DailyProductDemand.php`
- Create: `app/Models/ForecastModelEvaluation.php`
- Create: `app/Models/ProductForecast.php`
- Create: `app/Models/IngredientSupplierPolicy.php`
- Create: `app/Models/InventoryRecommendation.php`
- Create: `app/Models/ProcurementPlan.php`
- Create: `app/Models/ProcurementPlanItem.php`
- Modify: `app/Models/Invoice.php`
- Modify: `app/Models/MenuItem.php`
- Modify: `app/Models/Ingredient.php`
- Modify: `app/Models/Supplier.php`
- Modify: `.env.example`
- Modify: `tests/Pest.php`
- Test: `tests/Feature/Planning/ForecastingSchemaTest.php`

**Interfaces:**
- Produces: `ForecastRun::sourceScope(): array{synthetic_dataset_id:?int}` and model relations used by all later tasks.
- Produces: `FORECAST_SYNTHETIC_ENABLED=false` config switch; local/test may override true.
- Produces test helpers: `planningForecastRun(array $overrides = []): ForecastRun` and `planningRecommendation(Ingredient $ingredient, float $suggestedQuantity, array $overrides = []): InventoryRecommendation` in `tests/Pest.php`.

- [ ] **Step 1: Write failing schema tests**

```php
it('stores real and synthetic forecast sources without mixing them', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'weekly-demo', 'seed' => 42,
        'configuration' => ['days' => 120],
        'configuration_hash' => hash('sha256', '{"days":120}'),
        'generator_version' => '1', 'dataset_hash' => str_repeat('a', 64),
    ]);

    $real = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->subDay(), 'status' => 'queued',
    ]);
    $synthetic = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->subDay(), 'status' => 'queued',
        'synthetic_dataset_id' => $dataset->id,
    ]);

    expect($real->sourceScope())->toBe(['synthetic_dataset_id' => null])
        ->and($synthetic->sourceScope())->toBe(['synthetic_dataset_id' => $dataset->id]);
});
```

- [ ] **Step 2: Run test and verify expected failure**

Run: `php artisan test --filter=ForecastingSchemaTest`

Expected: FAIL because tables/models do not exist.

- [ ] **Step 3: Create minimal schema**

Core columns:

```php
Schema::create('forecast_runs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('synthetic_dataset_id')->nullable()->constrained()->nullOnDelete();
    $table->string('kind', 24); // aggregate, evaluate, forecast
    $table->unsignedSmallInteger('horizon_days');
    $table->timestamp('data_cutoff');
    $table->string('status', 20)->index();
    $table->json('configuration')->nullable();
    $table->timestamp('started_at')->nullable();
    $table->timestamp('completed_at')->nullable();
    $table->text('error_message')->nullable();
    $table->boolean('is_active')->default(false)->index();
    $table->timestamps();
});
```

Use foreign keys and unique indexes:

- `daily_product_demands`: unique `(synthetic_dataset_id, menu_item_id, demand_date)`; nullable-source uniqueness must be handled by upsert scope in service because MySQL permits multiple nulls.
- `product_forecasts`: unique `(forecast_run_id, menu_item_id, forecast_date)`.
- `forecast_model_evaluations`: unique `(forecast_run_id, menu_item_id, model_key)`.
- `inventory_recommendations`: unique `(forecast_run_id, ingredient_id)`.
- `procurement_plan_items`: one recommendation per plan.
- `invoices.synthetic_dataset_id`: nullable indexed FK.

Add complete PHPDoc properties, casts, fillable fields, and relations to satisfy PHPStan.

Add reusable Pest helpers with valid defaults for every non-null column. `planningRecommendation()` must create an active completed run, snapshot current stock, set deterministic BOM/policy hashes and create a recommendation using `method=eoq`; later tests override only fields relevant to their case.

- [ ] **Step 4: Run schema tests**

Run: `php artisan test --filter=ForecastingSchemaTest`

Expected: PASS.

- [ ] **Step 5: Run migration safety check**

Run: `php artisan tinker --execute="echo config('database.default');"`

Expected in developer DB: inspect output. If `mysql`, run only `php artisan migrate --pretend`; never run fresh/refresh.

- [ ] **Step 6: Commit**

```bash
git add config/forecasting.php .env.example database/migrations/2026_10_10_000001_create_forecasting_core_tables.php database/migrations/2026_10_10_000002_create_inventory_planning_tables.php database/migrations/2026_10_10_000003_add_synthetic_dataset_to_invoices.php app/Models tests/Pest.php tests/Feature/Planning/ForecastingSchemaTest.php
git commit -m "feat(planning): add forecasting and procurement schema"
```

### Task 2: Pure forecasting algorithms and metrics

**Files:**
- Create: `app/Services/Forecasting/MovingAverageForecaster.php`
- Create: `app/Services/Forecasting/HoltWintersForecaster.php`
- Create: `app/Services/Forecasting/ForecastMetrics.php`
- Test: `tests/Unit/Forecasting/MovingAverageForecasterTest.php`
- Test: `tests/Unit/Forecasting/HoltWintersForecasterTest.php`
- Test: `tests/Unit/Forecasting/ForecastMetricsTest.php`

**Interfaces:**
- Produces: `MovingAverageForecaster::forecast(array $series, int $window, int $horizon): array`.
- Produces: `HoltWintersForecaster::forecast(array $series, int $period, int $horizon, string $mode, array $params): array`.
- Produces: `ForecastMetrics::calculate(array $actual, array $predicted): array{mae:float,rmse:float,wape:?float}`.

- [ ] **Step 1: Write failing deterministic tests**

```php
it('forecasts SMA recursively from the selected window', function () {
    $result = app(MovingAverageForecaster::class)->forecast([1, 2, 3, 4, 5, 6, 7], 7, 2);
    expect($result)->toEqualWithDelta([4.0, 31 / 7], 0.0001);
});

it('calculates the three approved metrics', function () {
    $m = ForecastMetrics::calculate([10, 20], [8, 24]);
    expect($m['mae'])->toBe(3.0)
        ->and($m['rmse'])->toEqualWithDelta(sqrt(10), 0.0001)
        ->and($m['wape'])->toBe(20.0);
});

it('returns null WAPE when actual total is zero', function () {
    expect(ForecastMetrics::calculate([0, 0], [1, 2])['wape'])->toBeNull();
});
```

Add additive and multiplicative Holt-Winters tests using fixed synthetic seasonal series and assert finite, non-negative horizon values and lower error than SMA on the matching pattern.

- [ ] **Step 2: Run unit tests and verify failure**

Run: `php artisan test tests/Unit/Forecasting`

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement minimal pure services**

Rules:

- Reject non-finite and negative series values.
- Reject invalid window/period/horizon.
- Clamp forecasts to `>= 0`.
- Multiplicative mode rejects zero initial seasonal denominators and lets evaluator mark candidate invalid.
- No database, Carbon, cache, logging or framework facade calls in these three classes.

- [ ] **Step 4: Run tests and PHPStan on services**

Run: `php artisan test tests/Unit/Forecasting && composer types:check`

Expected: PASS, 0 PHPStan errors.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Forecasting tests/Unit/Forecasting
git commit -m "feat(planning): implement SMA Holt-Winters and forecast metrics"
```

### Task 3: Leak-free rolling-origin evaluation and model selection

**Files:**
- Create: `app/Services/Forecasting/RollingOriginEvaluator.php`
- Create: `app/Services/Forecasting/ModelSelector.php`
- Test: `tests/Unit/Forecasting/RollingOriginEvaluatorTest.php`
- Test: `tests/Unit/Forecasting/ModelSelectorTest.php`

**Interfaces:**
- Consumes: forecasting services from Task 2.
- Produces: `RollingOriginEvaluator::evaluate(array $series, array $candidates, int $initialWindow, int $horizon, int $step, int $maxOrigins): array`.
- Produces: `ModelSelector::select(array $evaluations): array{model_key:string,parameters:array<string,mixed>,mae:float,rmse:float,wape:?float}`.

- [ ] **Step 1: Write failing fold-boundary and selection tests**

```php
it('never passes observations after the origin into model fitting', function () {
    $spy = new class
    {
        /** @var array<int, int> */
        public array $trainingLengths = [];

        /** @param array<int, float|int> $series */
        public function forecast(array $series, array $parameters, int $horizon): array
        {
            $this->trainingLengths[] = count($series);

            return array_fill(0, $horizon, (float) end($series));
        }
    };
    $result = (new RollingOriginEvaluator(['spy' => $spy]))
        ->evaluate(range(1, 84), [['key' => 'spy', 'parameters' => []]], 56, 7, 7, 4);

    expect($spy->trainingLengths)->toBe([56, 63, 70, 77])
        ->and($result['origins'])->toHaveCount(4);
});

it('uses MAE then simpler model for WAPE ties within half a point', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_14', 'wape' => 10.4, 'mae' => 3.0, 'rmse' => 4.1],
    ]);
    expect($selected['model_key'])->toBe('sma_14');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter='RollingOriginEvaluatorTest|ModelSelectorTest'`

- [ ] **Step 3: Implement five fixed candidates**

Candidate keys are constants:

```php
public const CANDIDATES = [
    'sma_7', 'sma_14', 'sma_28',
    'holt_winters_additive', 'holt_winters_multiplicative',
];
```

Eligibility:

- 7-13 points: simple mean outside this evaluator.
- 14-27: SMA 7.
- 28-55: SMA 7 and SMA 14.
- 56+: all five candidates.
- Fewer than 3 valid origins: no reselection.

Aggregate MAE/RMSE from all validation observations; calculate WAPE from summed absolute error divided by summed actual, not the unweighted mean of fold WAPEs.

- [ ] **Step 4: Run tests**

Run: `php artisan test tests/Unit/Forecasting`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Forecasting/RollingOriginEvaluator.php app/Services/Forecasting/ModelSelector.php tests/Unit/Forecasting
git commit -m "feat(planning): add rolling-origin model selection"
```

### Task 4: Synthetic datasets in the shared database

**Files:**
- Create: `app/Services/Forecasting/SyntheticDemandGenerator.php`
- Modify: `app/Console/Commands/GenerateMockDataCommand.php`
- Create: `app/Http/Controllers/Admin/SyntheticDatasetController.php`
- Create: `app/Http/Requests/Planning/SyntheticDatasetRequest.php`
- Modify: `app/Models/Invoice.php`
- Modify: `app/Models/InvoiceLine.php`
- Modify: `app/Services/Manager/DashboardService.php`
- Modify: report controllers querying `invoices` or `invoice_lines`
- Test: `tests/Unit/Forecasting/SyntheticDemandGeneratorTest.php`
- Modify: `tests/Feature/GenerateMockDataCommandTest.php`
- Test: `tests/Feature/Planning/SyntheticDatasetTest.php`

**Interfaces:**
- Produces: `SyntheticDemandGenerator::generate(array $configuration, int $seed): array<int,array{date:string,menu_item_id:int,quantity:int,signals:array<string,mixed>}>`.
- Extends existing command: `data:generate-mock {--dataset=} {--seed=42} {--days=120} {--orders-per-day=20}`.

- [ ] **Step 1: Write reproducibility and source-isolation tests**

```php
it('generates the same dataset hash for the same config and seed', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = ['days' => 120, 'weekly' => true, 'trend' => 0.002, 'noise' => 0.10];
    expect($generator->hash($generator->generate($config, 42)))
        ->toBe($generator->hash($generator->generate($config, 42)));
});

it('excludes synthetic invoices from operational dashboard totals', function () {
    // Create one real and one synthetic invoice with equal totals.
    // Assert dashboard revenue contains only the real invoice by default.
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter='SyntheticDemandGeneratorTest|SyntheticDatasetTest'`

- [ ] **Step 3: Reuse and harden the existing mock-data command**

Keep `data:generate-mock` as the single entry point. Add `--dataset` and `--seed`; create or resolve one `SyntheticDataset`, pass its ID through invoice creation, and replace every global `mt_rand()`/`random()` choice that affects demand with the local seeded generator. Do not create a second forecast-only generator command.

Remove the current destructive meaning of `--fresh-mock`. It may only delete transactional rows linked to the selected `synthetic_dataset_id`; when `--dataset` is absent, reject `--fresh-mock` with a non-zero exit code. Keep real rows and other datasets untouched. Add regression tests proving both guarantees.

- [ ] **Step 4: Implement seeded generator without global RNG mutation**

Use a local deterministic PRNG class inside `SyntheticDemandGenerator`; do not call global `mt_srand()` because tests/jobs may share process state. Generate integer non-negative demand from:

```text
base × trend factor × weekly factor × promotion factor + seeded noise
```

Support `zero_demand_rate`, `outlier_rate`, `missing_rate`, and `stockout_censor_rate`. Persist generated days as synthetic invoices and invoice lines in chunks. Use unique invoice codes prefixed by dataset ID; no Payment/MoneyLedger rows because these are analytical fixtures, not financial transactions.

- [ ] **Step 5: Add default-real source scopes to operational queries**

Every Dashboard/report query joining invoices must include `whereNull('invoices.synthetic_dataset_id')` unless an explicit planning dataset filter is supplied. Add regression tests to at least Dashboard, SalesInvoice, Profit, Payments, InvoiceItems and Consumption reports; grep remaining invoice queries and update all operational paths.

- [ ] **Step 6: Implement safe dataset deletion**

Delete only invoices where `synthetic_dataset_id = selected dataset ID`, inside a transaction, then delete dataset. Require `planning.experiments`; require explicit confirmation string equal to dataset name. Never issue unscoped delete/truncate.

- [ ] **Step 7: Run tests**

Run: `php artisan test --filter='GenerateMockDataCommandTest|Synthetic|Dashboard|Report'`

Expected: PASS; synthetic rows excluded from normal reports.

- [ ] **Step 8: Commit**

```bash
git add app/Services/Forecasting/SyntheticDemandGenerator.php app/Console/Commands/GenerateMockDataCommand.php app/Http/Controllers/Admin/SyntheticDatasetController.php app/Http/Requests/Planning app/Models app/Services/Manager/DashboardService.php app/Http/Controllers/Reports tests/Feature/GenerateMockDataCommandTest.php tests/Feature/Planning tests/Unit/Forecasting
git commit -m "feat(planning): add reproducible synthetic datasets"
```

### Task 5: Demand aggregation, forecast orchestration, queue, and schedule

**Files:**
- Create: `app/Services/Forecasting/DemandSeriesBuilder.php`
- Create: `app/Services/Forecasting/ForecastOrchestrator.php`
- Create: `app/Jobs/Planning/AggregateDailyDemand.php`
- Create: `app/Jobs/Planning/RunDemandForecast.php`
- Create: `app/Jobs/Planning/EvaluateForecastModels.php`
- Create: `app/Console/Commands/Planning/AggregateForecastDemand.php`
- Create: `app/Console/Commands/Planning/RunDemandForecastCommand.php`
- Create: `app/Console/Commands/Planning/EvaluateForecastModelsCommand.php`
- Modify: `routes/console.php`
- Test: `tests/Feature/Planning/ForecastRunTest.php`
- Test: `tests/Feature/Planning/PlanningSchedulerTest.php`

**Interfaces:**
- Produces commands: `planning:aggregate-demand`, `planning:forecast`, `planning:evaluate-models`.
- Produces: `ForecastOrchestrator::run(ForecastRun $run): void`.

- [ ] **Step 1: Write failing lifecycle tests**

```php
it('publishes a new run only after all forecasts commit', function () {
    $old = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->subDays(2), 'status' => 'completed',
        'is_active' => true,
    ]);
    $new = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->subDay(), 'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($new);

    expect($new->fresh()->status)->toBe('completed')
        ->and($new->fresh()->is_active)->toBeTrue()
        ->and($old->fresh()->is_active)->toBeFalse();
});

it('keeps the previous run active when forecasting fails', function () {
    // Inject a throwing candidate and assert transaction rollback + failed state.
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter='ForecastRunTest|PlanningSchedulerTest'`

- [ ] **Step 3: Implement source-safe aggregation**

`DemandSeriesBuilder` filters either:

```php
$query->whereNull('invoices.synthetic_dataset_id');
```

or:

```php
$query->where('invoices.synthetic_dataset_id', $datasetId);
```

Never omit source predicate. Aggregate by `DATE(invoices.issued_at)` and `invoice_lines.menu_item_id`; preserve refunded quantity as metadata but do not subtract from demand.

- [ ] **Step 4: Implement queued lifecycle and scheduling**

Jobs implement `ShouldQueue`, `ShouldBeUnique`, and `WithoutOverlapping`. Dispatch with `afterCommit()`. Commands create queued runs and dispatch jobs.

Schedule:

```php
Schedule::command('planning:aggregate-demand')->dailyAt('00:10')->withoutOverlapping();
Schedule::command('planning:forecast')->dailyAt('00:15')->withoutOverlapping();
Schedule::command('planning:evaluate-models')->weeklyOn(0, '01:00')->withoutOverlapping();
```

- [ ] **Step 5: Run focused tests**

Run: `php artisan test --filter='ForecastRunTest|PlanningSchedulerTest'`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Forecasting/DemandSeriesBuilder.php app/Services/Forecasting/ForecastOrchestrator.php app/Jobs/Planning app/Console/Commands/Planning routes/console.php tests/Feature/Planning
git commit -m "feat(planning): schedule durable forecast runs"
```

### Task 6: BOM conversion and inventory optimization

**Files:**
- Create: `app/Services/Forecasting/IngredientDemandCalculator.php`
- Create: `app/Services/Forecasting/InventoryOptimizer.php`
- Modify: `app/Models/Ingredient.php`
- Modify: `app/Models/Supplier.php`
- Test: `tests/Unit/Forecasting/IngredientDemandCalculatorTest.php`
- Test: `tests/Unit/Forecasting/InventoryOptimizerTest.php`

**Interfaces:**
- Produces: `IngredientDemandCalculator::calculate(array $productForecasts, Collection $recipes): array`.
- Produces: `IngredientDemandCalculator::bomHash(Collection $recipes): string`.
- Produces: `InventoryOptimizer::recommend(InventoryInput $input): InventoryDecision` with value objects in same file unless reuse emerges.

- [ ] **Step 1: Write failing formula tests**

```php
it('calculates safety stock reorder point and rounded order quantity', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 14, dailyDemandStdDev: 2, leadDays: 4,
        serviceFactor: 1.65, annualDemand: 1200,
        orderingCost: 100000, annualHoldingCost: 20000,
        moq: 24, orderMultiple: 12, packSize: 12,
    ));

    expect($decision->safetyStock)->toEqualWithDelta(6.6, 0.001)
        ->and($decision->reorderPoint)->toBeGreaterThan(14)
        ->and(fmod($decision->finalQuantity, 12.0))->toBe(0.0);
});

it('uses reorder-gap fallback when EOQ inputs are missing', function () {
    // Assert method=reorder_gap and quantity=max(ROP-available,0), then MOQ/multiple.
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter='IngredientDemandCalculatorTest|InventoryOptimizerTest'`

- [ ] **Step 3: Implement unit-safe BOM conversion**

Reject recommendations when recipe unit differs from ingredient base unit and no exact `unit_conversion` applies. Return structured issues instead of silently skipping. Generate BOM hash from sorted `(menu_item_id, ingredient_id, amount, unit, updated_at)` tuples.

- [ ] **Step 4: Implement SS/ROP/EOQ and rounding stages**

Store intermediate values:

- `raw_quantity`
- `after_moq_quantity`
- `final_quantity`
- `method` (`eoq` or `reorder_gap`)

Use `available = stock_quantity` in version one because reserved stock does not exist; expose `reserved = 0` explicitly.

- [ ] **Step 5: Run tests**

Run: `php artisan test tests/Unit/Forecasting`

- [ ] **Step 6: Commit**

```bash
git add app/Services/Forecasting/IngredientDemandCalculator.php app/Services/Forecasting/InventoryOptimizer.php app/Models/Ingredient.php app/Models/Supplier.php tests/Unit/Forecasting
git commit -m "feat(planning): calculate ingredient demand and reorder quantities"
```

### Task 7: Procurement plans, stale checks, adjustment audit, and receipt handoff

**Files:**
- Create: `app/Services/Forecasting/RecommendationFreshness.php`
- Create: `app/Http/Requests/Planning/ReviewProcurementRequest.php`
- Create: `app/Http/Controllers/Planning/ProcurementRecommendationController.php`
- Modify: `app/Http/Controllers/Manager/StockVoucherController.php`
- Modify: `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`
- Test: `tests/Feature/Planning/ProcurementReviewTest.php`
- Test: `tests/Feature/Planning/RecommendationFreshnessTest.php`

**Interfaces:**
- Produces endpoint: `POST /planning/procurement/plans`.
- Produces endpoint: `GET /manager/inventory/vouchers?procurement_plan_id={id}` for prefill only.
- Produces: `RecommendationFreshness::assertFresh(InventoryRecommendation $recommendation): void`.

- [ ] **Step 1: Write failing safety tests**

```php
it('does not increase stock when approving a procurement plan', function () {
    $ingredient = Ingredient::create([
        'code' => 'PLAN-MILK', 'name' => 'Sữa kế hoạch', 'unit' => 'ml',
        'stock_quantity' => 14000, 'min_stock_alert' => 5000,
        'cost_price' => 35, 'purchase_unit' => 'can', 'unit_conversion' => 950,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 24);
    $before = $ingredient->stock_quantity;

    $this->actingAs(posAdmin())->post('/planning/procurement/plans', [
        'items' => [[
            'recommendation_id' => $recommendation->id,
            'final_quantity' => 24,
            'adjustment_reason' => null,
        ]],
    ])
        ->assertRedirect();

    expect($ingredient->fresh()->stock_quantity)->toBe($before);
});

it('rejects stale recommendations when stock changed after snapshot', function () {
    // Create recommendation, mutate ingredient stock, POST review, assert 422 and no plan.
});

it('requires a reason when final quantity differs from suggested quantity', function () {
    // POST changed quantity without reason; assert validation error.
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter='ProcurementReviewTest|RecommendationFreshnessTest'`

- [ ] **Step 3: Implement transactional review**

Inside one transaction:

1. Lock selected recommendations and ingredients.
2. Verify run active, stock snapshot, BOM hash and supplier policy timestamps.
3. Validate final quantity against MOQ/order multiple.
4. Require reason for changes.
5. Group plan items by supplier.
6. Create approved `ProcurementPlan` without touching stock.
7. Write `SecurityAuditLog` before/after values.

- [ ] **Step 4: Add Stock Voucher prefill handoff**

The voucher page may read approved plan items and prefill supplier/ingredient/quantity. Actual `store()` remains the only path that increases stock after user confirms received quantity, unit price and expiry. Link resulting voucher back to plan/item.

- [ ] **Step 5: Run tests**

Run: `php artisan test --filter='Procurement|StockVoucher'`

- [ ] **Step 6: Commit**

```bash
git add app/Services/Forecasting/RecommendationFreshness.php app/Http/Requests/Planning/ReviewProcurementRequest.php app/Http/Controllers/Planning/ProcurementRecommendationController.php app/Http/Controllers/Manager/StockVoucherController.php resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx tests/Feature/Planning
git commit -m "feat(planning): review procurement plans without changing stock"
```

### Task 8: Authorization, routes, page registration, and manual run APIs

**Files:**
- Create: `app/Http/Controllers/Planning/PlanningOverviewController.php`
- Create: `app/Http/Controllers/Planning/ProductForecastController.php`
- Create: `app/Http/Controllers/Planning/ModelEvaluationController.php`
- Create: `app/Http/Requests/Planning/RunForecastRequest.php`
- Modify: `routes/web.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`
- Modify: `resources/js/pages/admin/RolesManager.tsx`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md`
- Test: `tests/Feature/Planning/PlanningAuthorizationTest.php`

**Interfaces:**
- Pages: `/planning`, `/planning/products`, `/planning/procurement`, `/planning/evaluation`, `/admin/planning/synthetic`.
- Mutations: `/planning/runs`, `/planning/evaluation/runs`, `/planning/models/apply`, `/planning/procurement/plans`.

- [ ] **Step 1: Write failing route and permission tests**

```php
it('denies planning run to a user with view permission only', function () {
    $user = posStaff(['planning.view'], ['/planning']);
    $this->actingAs($user)->post('/planning/runs', ['horizon_days' => 7])->assertForbidden();
});

it('shows planning navigation only to roles with page access', function () {
    // Assert Inertia shared navigation grouping from seeded pages.
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter=PlanningAuthorizationTest`

- [ ] **Step 3: Register exact pages and permissions**

Permissions:

```php
'planning.view', 'planning.run', 'planning.configure',
'planning.apply_model', 'planning.procurement_review', 'planning.experiments',
```

Seed four pages under group `Dự báo & Kế hoạch`; synthetic page under admin group. Add custom labels to `PERMISSION_LABEL_DICTIONARY`. Flush existing page/user caches through established seeder behavior.

- [ ] **Step 4: Add routes and thin controllers**

Controllers query active run/results and return Inertia props. Manual run endpoint validates source/horizon, creates queued run, dispatches after commit, and returns immediately. No algorithm executes in controller.

- [ ] **Step 5: Update routing documentation and tests**

Run: `php artisan test --filter='PlanningAuthorizationTest|AuthorizationSeederInvariantTest'`

- [ ] **Step 6: Commit**

```bash
git add routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php app/Http/Controllers/Planning app/Http/Requests/Planning/RunForecastRequest.php resources/js/pages/admin/RolesManager.tsx docs/PROJECT_CONTEXT_AND_ROUTING.md tests/Feature/Planning/PlanningAuthorizationTest.php
git commit -m "feat(planning): register routes pages and permissions"
```

### Task 9: Shared planning UI and overview

**Files:**
- Create: `resources/js/components/planning/RunStatusBanner.tsx`
- Create: `resources/js/components/planning/DataQualityBadge.tsx`
- Create: `resources/js/components/planning/ActualForecastChart.tsx`
- Create: `resources/js/pages/planning/Overview.tsx`
- Test: `resources/js/components/planning/planningFormatters.test.ts`

**Interfaces:**
- Consumes Inertia props from `PlanningOverviewController`.
- Produces reusable status/badge/chart components for Tasks 10-11.

- [ ] **Step 1: Write formatter/state tests with Node test runner**

Test status labels, source label (`Dữ liệu thật` vs dataset name), WAPE null display, and stale timestamp. Keep pure formatter functions in `resources/js/components/planning/planningFormatters.ts` so built-in Node tests can execute without adding Vitest.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test resources/js/components/planning/planningFormatters.test.ts`

- [ ] **Step 3: Build shared components and overview**

Use HTML Stitch only as visual reference. Render inside `DashboardLayout`; no copied header/footer. Required states: empty, queued, running, completed, failed, stale. Use Recharts `ResponsiveContainer`, solid sky actual line, dashed purple forecast line, optional interval only when backend supplies bounds.

- [ ] **Step 4: Verify frontend**

Run: `npm run lint:check && npm run types:check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/planning resources/js/pages/planning/Overview.tsx
git commit -m "feat(planning): add forecast overview UI"
```

### Task 10: Product forecasts and model evaluation UI

**Files:**
- Create: `resources/js/pages/planning/ProductForecasts.tsx`
- Create: `resources/js/pages/planning/ModelEvaluation.tsx`
- Create: `resources/js/components/planning/ForecastDetailDrawer.tsx`
- Create: `resources/js/components/planning/ModelMetricChart.tsx`
- Modify: `app/Http/Controllers/Planning/ProductForecastController.php`
- Modify: `app/Http/Controllers/Planning/ModelEvaluationController.php`
- Test: `tests/Feature/Planning/PlanningPagesTest.php`

**Interfaces:**
- Product list supports server filters and pagination.
- Evaluation page returns only five approved candidates and three approved metrics.

- [ ] **Step 1: Write failing Inertia prop tests**

```php
it('returns only approved model keys on evaluation page', function () {
    $this->actingAs(posAdmin())->get('/planning/evaluation')
        ->assertInertia(fn ($page) => $page
            ->component('planning/ModelEvaluation')
            ->where('candidate_keys', [
                'sma_7', 'sma_14', 'sma_28',
                'holt_winters_additive', 'holt_winters_multiplicative',
            ]));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter=PlanningPagesTest`

- [ ] **Step 3: Implement product page**

Desktop table and mobile card list. Drawer opens on demand and shows daily forecast table, total, bounds if present, selected model, MAE/RMSE/WAPE, origins, cutoff and quality. Implement Escape, focus trap, focus return. Do not include BOM details; link to procurement page only.

- [ ] **Step 4: Implement evaluation page**

Active tab only. Metric selector controls one Recharts chart. Comparison table contains five models. Methodology disclosure shows initial window, horizon, step, origins, formulas, snapshot/config IDs and limitations. Primary action requires `planning.apply_model` and confirmation.

- [ ] **Step 5: Verify**

Run: `php artisan test --filter=PlanningPagesTest; npm run lint:check; npm run types:check; npm run build`

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/planning resources/js/components/planning app/Http/Controllers/Planning tests/Feature/Planning/PlanningPagesTest.php
git commit -m "feat(planning): add product forecast and model evaluation pages"
```

### Task 11: Procurement and synthetic experiment UI

**Files:**
- Create: `resources/js/pages/planning/ProcurementRecommendations.tsx`
- Create: `resources/js/pages/admin/planning/SyntheticDatasets.tsx`
- Create: `resources/js/components/planning/RecommendationDetailDrawer.tsx`
- Create: `resources/js/components/planning/RecommendationReviewModal.tsx`
- Modify: `app/Http/Controllers/Planning/ProcurementRecommendationController.php`
- Modify: `app/Http/Controllers/Admin/SyntheticDatasetController.php`
- Test: `tests/Feature/Planning/PlanningInteractionTest.php`

**Interfaces:**
- Procurement review posts grouped selected items with original/final quantities and reasons.
- Synthetic page creates/deletes/runs one dataset at a time.

- [ ] **Step 1: Write failing interaction contract tests**

Test that procurement props expose snapshot/cutoff/method/rounding stages; synthetic props expose seed/config/dataset hash/source label; stale review returns 422.

- [ ] **Step 2: Run tests and verify failure**

Run: `php artisan test --filter=PlanningInteractionTest`

- [ ] **Step 3: Implement procurement decision UI**

Use responsive card list on mobile. Drawer explains on-hand/reserved/available, lead demand, SS, ROP, EOQ/fallback, pack/MOQ/multiple and price provenance. Editing quantity requires reason. Fixed review bar opens modal grouped by supplier. Submit guard and 8-second safety timeout; server stale errors keep modal open with `Tính lại` action.

- [ ] **Step 4: Implement synthetic experiment UI**

Show one sandbox warning, scenario form, advanced drawer, preview chart and run result. Expose trend, weekly seasonality, promotion, noise, zero demand, intermittent demand, outliers, missing observations and censoring. Label all mock/static values `Dữ liệu minh họa`; real run states come from backend.

- [ ] **Step 5: Verify**

Run: `php artisan test --filter='PlanningInteractionTest|SyntheticDatasetTest|ProcurementReviewTest'; npm run lint:check; npm run types:check; npm run build`

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/planning/ProcurementRecommendations.tsx resources/js/pages/admin/planning/SyntheticDatasets.tsx resources/js/components/planning app/Http/Controllers/Planning/ProcurementRecommendationController.php app/Http/Controllers/Admin/SyntheticDatasetController.php tests/Feature/Planning
git commit -m "feat(planning): add procurement and experiment workbenches"
```

### Task 12: Cross-feature regression, operational hardening, and thesis evidence

**Files:**
- Create: `docs/forecasting/algorithm-and-experiment-guide.md`
- Create: `tests/Feature/Planning/PlanningEndToEndTest.php`
- Modify: `.github/workflows/tests.yml`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md`
- Modify: files discovered by final `rg "invoices|invoice_lines" app/Http app/Services` source-scope audit.

**Interfaces:**
- Produces reproducible command sequence for thesis experiments.
- Produces final cross-feature regression coverage.

- [ ] **Step 1: Write end-to-end test**

Test this full flow on SQLite:

1. Generate deterministic synthetic dataset.
2. Aggregate demand from only that dataset.
3. Evaluate five models with at least three origins.
4. Publish 7-day forecast.
5. Convert via BOM.
6. Create recommendation.
7. Approve procurement plan without changing stock.
8. Prefill receipt and update stock only after actual voucher submission.

- [ ] **Step 2: Audit every invoice query for source mixing**

Run: `rg -n "Invoice::|table\('invoices'\)|join\('invoices'|invoice_lines" app/Http app/Services`

For every operational query, add/assert real-only scope. For every planning query, require explicit source. Add regression tests for any missed path.

- [ ] **Step 3: Add experiment guide**

Document exact safe commands, dataset provenance, rolling-origin protocol, formulas, expected CSV columns, and limitation statement. Commands must never include `migrate:fresh`, `db:wipe` or secrets.

- [ ] **Step 4: Run full verification**

```bash
php artisan test
composer types:check
vendor/bin/pint --test
npm run lint:check
npm run types:check
npm run test:report-export
npm run build
```

Expected: all tests pass, PHPStan 0 errors, Pint clean, ESLint clean, TypeScript clean, build successful.

- [ ] **Step 5: Run security/dependency checks**

```bash
composer audit
npm audit --omit=dev
```

Expected: no unresolved high/critical advisory introduced by this feature.

- [ ] **Step 6: Review and commit**

Before commit, inspect `git status`, `git diff`, `git log --oneline -10`, and GitNexus `detect_changes()` against `main`. Commit only intended files.

```bash
git add docs/forecasting docs/PROJECT_CONTEXT_AND_ROUTING.md .github/workflows/tests.yml tests/Feature/Planning app resources
git commit -m "test(planning): verify forecast to procurement workflow"
```

## Final Acceptance Checklist

- [ ] Synthetic and real data never mix within one forecast run.
- [ ] Operational reports exclude synthetic invoices by default.
- [ ] Same generator config + seed yields same dataset hash.
- [ ] Five approved candidates use identical rolling origins without leakage.
- [ ] MAE, RMSE and WAPE match known examples; WAPE zero denominator returns null.
- [ ] Failed run keeps prior active result.
- [ ] BOM/unit errors block recommendations explicitly.
- [ ] SS/ROP/EOQ/fallback and rounding stages are reproducible.
- [ ] Stale recommendation cannot create procurement plan.
- [ ] Manual adjustment requires reason and writes audit log.
- [ ] Approved procurement plan does not change stock.
- [ ] Stock changes only when actual Stock Voucher is submitted.
- [ ] All five pages implement required lifecycle states and mobile layouts.
- [ ] Navigation, permissions and docs match routes.
- [ ] Full quality gates pass.
