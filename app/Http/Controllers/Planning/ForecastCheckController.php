<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\StoreForecastCheckRequest;
use App\Jobs\Planning\RunForecastCheck;
use App\Models\ForecastCheck;
use App\Models\MenuItem;
use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use App\Support\SpreadsheetCellSanitizer;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class ForecastCheckController extends Controller
{
    public function index(Request $request): JsonResponse|InertiaResponse
    {
        $datasetFilter = $request->query('synthetic_dataset_id') !== null && $request->query('synthetic_dataset_id') !== ''
            ? (int) $request->query('synthetic_dataset_id')
            : null;

        $datasets = SyntheticDataset::where('status', 'completed')
            ->orderByDesc('id')
            ->get(['id', 'name', 'seed', 'start_date', 'end_date', 'dataset_hash', 'generator_version', 'configuration']);

        $recentChecks = ForecastCheck::query()
            ->when($datasetFilter !== null, fn ($q) => $q->where('synthetic_dataset_id', $datasetFilter))
            ->orderByDesc('id')
            ->paginate(10)
            ->withQueryString();

        $menuItems = MenuItem::where('is_available', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        if ($request->wantsJson() && ! $request->header('X-Inertia')) {
            return response()->json([
                'datasets' => $datasets,
                'menuItems' => $menuItems,
                'recentChecks' => $recentChecks,
            ]);
        }

        return Inertia::render('planning/ForecastChecks', [
            'datasets' => $datasets,
            'menuItems' => $menuItems,
            'recentChecks' => $recentChecks,
            'filters' => [
                'synthetic_dataset_id' => $datasetFilter,
            ],
        ]);
    }

    public function store(StoreForecastCheckRequest $request): SymfonyResponse
    {
        abort_unless(config('forecasting.synthetic_enabled', false), 403, 'Tính năng mô phỏng đang tắt.');

        $user = $request->user();
        $validated = $request->validated();

        $datasetId = (int) $validated['synthetic_dataset_id'];
        $itemId = (int) $validated['menu_item_id'];
        $startDateStr = (string) $validated['start_date'];
        $token = (string) $validated['submission_token'];

        $startDate = CarbonImmutable::parse($startDateStr)->startOfDay();
        $cutoff = $startDate->subDay();
        $endDate = $startDate->addDays(6);

        $requestHash = hash('sha256', "dataset:{$datasetId}:item:{$itemId}:start:{$startDateStr}");

        $existing = ForecastCheck::where('created_by', $user?->id)
            ->where('submission_token', $token)
            ->first();

        if ($existing) {
            if ($existing->request_hash === $requestHash) {
                return response()->json([
                    'message' => 'Lượt kiểm tra đã tồn tại (idempotent).',
                    'data' => $existing,
                ], 200);
            }

            abort(409, 'Xung đột: submission_token đã được sử dụng cho một yêu cầu khác.');
        }

        $dataset = SyntheticDataset::findOrFail($datasetId);
        $item = MenuItem::findOrFail($itemId);

        $obs = SyntheticObservation::where('synthetic_dataset_id', $datasetId)
            ->where('menu_item_id', $itemId)
            ->whereDate('date', '<=', $endDate->toDateString())
            ->orderBy('date')
            ->get(['date', 'observed_sales', 'is_open', 'is_missing', 'is_stockout'])
            ->map(fn ($r) => [
                'date' => is_string($r->date) ? substr($r->date, 0, 10) : $r->date->toDateString(),
                'observed_sales' => $r->observed_sales !== null ? (float) $r->observed_sales : null,
                'is_open' => (bool) $r->is_open,
                'is_missing' => (bool) $r->is_missing,
                'is_stockout' => (bool) $r->is_stockout,
            ])
            ->all();

        if (empty($obs)) {
            abort(422, 'Không tìm thấy dữ liệu quan sát nào cho món trong tập dữ liệu.');
        }

        $hasTrainingObs = collect($obs)->contains(fn ($o) => strcmp($o['date'], $cutoff->toDateString()) <= 0);
        if (! $hasTrainingObs) {
            abort(422, 'Không có dữ liệu quan sát lịch sử trước ngày cắt dữ liệu.');
        }

        $snapshot = [
            'dataset' => [
                'id' => $dataset->id,
                'name' => $dataset->name,
                'seed' => $dataset->seed,
                'generator_version' => $dataset->generator_version,
                'dataset_hash' => $dataset->dataset_hash,
                'configuration_hash' => $dataset->configuration_hash,
                'configuration' => $dataset->configuration,
                'start_date' => $dataset->start_date?->toDateString(),
                'end_date' => $dataset->end_date?->toDateString(),
            ],
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
            ],
            'start_date' => $startDateStr,
            'end_date' => $endDate->toDateString(),
            'cutoff' => $cutoff->toDateString(),
            'timezone' => 'Asia/Ho_Chi_Minh',
            'versions' => ForecastCheck::VERSIONS,
            'observations' => $obs,
        ];

        try {
            $check = DB::transaction(function () use ($user, $dataset, $item, $token, $requestHash, $startDateStr, $endDate, $cutoff, $snapshot) {
                return ForecastCheck::create([
                    'created_by' => $user?->id,
                    'synthetic_dataset_id' => $dataset->id,
                    'menu_item_id' => $item->id,
                    'submission_token' => $token,
                    'request_hash' => $requestHash,
                    'dataset_label' => (string) $dataset->name,
                    'item_label' => (string) $item->name,
                    'start_date' => $startDateStr,
                    'end_date' => $endDate->toDateString(),
                    'cutoff' => $cutoff->toDateString(),
                    'input_snapshot' => $snapshot,
                    'result' => null,
                    'status' => 'queued',
                    'attempts' => 0,
                ]);
            });
        } catch (QueryException $e) {
            $existing = ForecastCheck::where('created_by', $user?->id)->where('submission_token', $token)->first();
            if ($existing && $existing->request_hash === $requestHash) {
                return response()->json(['message' => 'Lượt kiểm tra đã tồn tại.', 'data' => $existing], 200);
            }
            throw $e;
        }

        RunForecastCheck::dispatch($check->id)->afterCommit();

        return response()->json([
            'message' => 'Đã tạo và xếp hàng lượt kiểm tra dự báo 7 ngày.',
            'data' => $check,
        ], 201);
    }

    public function show(Request $request, ForecastCheck $check): JsonResponse|InertiaResponse
    {
        if ($request->wantsJson() && ! $request->header('X-Inertia')) {
            return response()->json([
                'data' => $check,
            ]);
        }

        $datasets = SyntheticDataset::where('status', 'completed')
            ->orderByDesc('id')
            ->get(['id', 'name', 'seed', 'start_date', 'end_date', 'dataset_hash', 'generator_version', 'configuration']);

        $menuItems = MenuItem::where('is_available', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        $recentChecks = ForecastCheck::query()
            ->orderByDesc('id')
            ->paginate(10);

        return Inertia::render('planning/ForecastChecks', [
            'datasets' => $datasets,
            'menuItems' => $menuItems,
            'recentChecks' => $recentChecks,
            'activeCheck' => $check,
            'filters' => [
                'synthetic_dataset_id' => $check->synthetic_dataset_id,
            ],
        ]);
    }

    public function retry(Request $request, ForecastCheck $check): JsonResponse
    {
        abort_unless(config('forecasting.synthetic_enabled', false), 403, 'Tính năng mô phỏng đang tắt.');
        abort_unless($request->user()?->hasPermission('planning.experiments'), 403, 'Thiếu quyền thực nghiệm.');

        if ($check->status === 'completed') {
            abort(400, 'Không thể chạy lại lượt kiểm tra đã hoàn thành.');
        }

        $snapshotVersions = (array) ($check->input_snapshot['versions'] ?? []);
        foreach (ForecastCheck::VERSIONS as $k => $expectedVer) {
            if (($snapshotVersions[$k] ?? null) !== $expectedVer) {
                abort(409, "Phiên bản mã nguồn đã thay đổi ({$k}). Vui lòng tạo lượt kiểm tra mới.");
            }
        }

        if (in_array($check->status, ['queued', 'running'], true)) {
            return response()->json([
                'message' => 'Lượt kiểm tra đang được xử lý.',
                'data' => $check,
            ], 200);
        }

        $check->update([
            'status' => 'queued',
            'error_message' => null,
        ]);

        RunForecastCheck::dispatch($check->id)->afterCommit();

        return response()->json([
            'message' => 'Đã xếp hàng chạy lại lượt kiểm tra.',
            'data' => $check,
        ], 200);
    }

    public const ALLOWED_EXPORTS = [
        'manifest.json',
        'comparison.csv',
        'daily-errors.csv',
    ];

    public function export(Request $request, ForecastCheck $check, string $file): SymfonyResponse
    {
        abort_unless(config('forecasting.synthetic_enabled', false), 403, 'Tính năng mô phỏng đang tắt.');
        abort_unless($request->user()?->hasPermission('planning.experiments'), 403, 'Thiếu quyền thực nghiệm.');

        if (! in_array($file, self::ALLOWED_EXPORTS, true)) {
            abort(404, 'Tệp xuất không tồn tại.');
        }

        if ($check->status !== 'completed' || ! is_array($check->result)) {
            abort(409, 'Kết quả chưa sẵn sàng để xuất.');
        }

        $cutoff = $check->cutoff instanceof CarbonInterface ? $check->cutoff->toDateString() : (string) $check->cutoff;
        $startDate = $check->start_date instanceof CarbonInterface ? $check->start_date->toDateString() : (string) $check->start_date;
        $endDate = $check->end_date instanceof CarbonInterface ? $check->end_date->toDateString() : (string) $check->end_date;

        if ($file === 'manifest.json') {
            $snapshot = $check->input_snapshot;
            $result = $check->result;

            return response()->json([
                'check_id' => $check->id,
                'status' => $check->status,
                'created_at' => $check->created_at?->toISOString(),
                'started_at' => $check->started_at?->toISOString(),
                'completed_at' => $check->completed_at?->toISOString(),
                'dataset_label' => $check->dataset_label,
                'item_label' => $check->item_label,
                'input_snapshot' => $snapshot,
                'result' => $result,
                'scoring' => [
                    'target' => 'observed_sales',
                    'missing_labels_scored' => false,
                    'signed_error' => 'predicted - actual',
                    'ranking' => 'post_hoc_interval_only',
                ],
                'start_date' => $startDate,
                'end_date' => $endDate,
                'cutoff' => $cutoff,
                'versions' => $check->input_snapshot['versions'] ?? ForecastCheck::VERSIONS,
                'dataset' => $snapshot['dataset'] ?? null,
                'training' => $result['training'] ?? null,
                'default_model_key' => $result['default_model_key'] ?? null,
                'best_model_keys' => $result['best_model_keys'] ?? [],
                'ranking_metric' => $result['ranking_metric'] ?? null,
                'scored_count' => $result['scored_count'] ?? 0,
                'limitations' => [
                    'Kết quả kiểm tra là backtest đơn điểm (single-origin) trên dữ liệu mô phỏng.',
                    'Biên so sánh không thay thế cho đánh giá rolling-origin đa điểm.',
                ],
            ]);
        }

        if ($file === 'comparison.csv') {
            $header = ['check_id', 'dataset_id', 'menu_item_id', 'dataset_label', 'item_label', 'cutoff', 'start_date', 'end_date', 'model_key', 'status', 'reason', 'scored_count', 'mae', 'rmse', 'wape', 'is_interval_best', 'parameters_json'];
            $rows = [];
            $candidates = (array) ($check->result['candidates'] ?? []);
            $bestKeys = (array) ($check->result['best_model_keys'] ?? []);

            foreach ($candidates as $cand) {
                $rows[] = [
                    $check->id,
                    $check->synthetic_dataset_id ?? $check->input_snapshot['dataset']['id'] ?? '',
                    $check->menu_item_id ?? $check->input_snapshot['item']['id'] ?? '',
                    SpreadsheetCellSanitizer::sanitize($check->dataset_label),
                    SpreadsheetCellSanitizer::sanitize($check->item_label),
                    $cutoff,
                    $startDate,
                    $endDate,
                    $cand['model_key'] ?? '',
                    $cand['status'] ?? '',
                    SpreadsheetCellSanitizer::sanitize($cand['reason'] ?? ''),
                    $cand['scored_count'] ?? 0,
                    $cand['mae'] !== null ? $cand['mae'] : '',
                    $cand['rmse'] !== null ? $cand['rmse'] : '',
                    $cand['wape'] !== null ? $cand['wape'] : '',
                    in_array($cand['model_key'] ?? '', $bestKeys, true) ? 1 : 0,
                    json_encode($cand['parameters'] ?? []),
                ];
            }

            return response()->stream(function () use ($header, $rows) {
                $handle = fopen('php://output', 'w');
                if (! is_resource($handle)) {
                    return;
                }
                fputcsv($handle, $header);
                foreach ($rows as $row) {
                    fputcsv($handle, array_map(fn ($val) => $val === null ? '' : (string) $val, $row));
                }
                fclose($handle);
            }, 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => "attachment; filename=\"check-{$check->id}-comparison.csv\"",
            ]);
        }

        // daily-errors.csv
        $header = ['check_id', 'dataset_id', 'menu_item_id', 'model_key', 'date', 'actual', 'predicted', 'signed_error', 'absolute_error', 'scored', 'is_open', 'is_missing', 'is_stockout'];
        $rows = [];
        $candidates = (array) ($check->result['candidates'] ?? []);

        foreach ($candidates as $cand) {
            $points = (array) ($cand['points'] ?? []);
            foreach ($points as $p) {
                $rows[] = [
                    $check->id,
                    $check->synthetic_dataset_id ?? $check->input_snapshot['dataset']['id'] ?? '',
                    $check->menu_item_id ?? $check->input_snapshot['item']['id'] ?? '',
                    $cand['model_key'] ?? '',
                    $p['date'] ?? '',
                    $p['actual'] !== null ? $p['actual'] : '',
                    $p['predicted'] !== null ? $p['predicted'] : '',
                    $p['signed_error'] !== null ? $p['signed_error'] : '',
                    $p['absolute_error'] !== null ? $p['absolute_error'] : '',
                    ($p['scored'] ?? false) ? 1 : 0,
                    ($p['is_open'] ?? true) ? 1 : 0,
                    ($p['is_missing'] ?? false) ? 1 : 0,
                    ($p['is_stockout'] ?? false) ? 1 : 0,
                ];
            }
        }

        return response()->stream(function () use ($header, $rows) {
            $handle = fopen('php://output', 'w');
            if (! is_resource($handle)) {
                return;
            }
            fputcsv($handle, $header);
            foreach ($rows as $row) {
                fputcsv($handle, array_map(strval(...), $row));
            }
            fclose($handle);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"check-{$check->id}-daily-errors.csv\"",
        ]);
    }
}
