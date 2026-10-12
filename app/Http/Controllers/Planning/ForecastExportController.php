<?php

namespace App\Http\Controllers\Planning;

use App\Http\Controllers\Controller;
use App\Models\ForecastExperiment;
use App\Models\ForecastRun;
use App\Services\Forecasting\ForecastEvidenceExporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ForecastExportController extends Controller
{
    public function export(
        Request $request,
        ForecastRun $run,
        string $file,
        ForecastEvidenceExporter $exporter
    ): JsonResponse|StreamedResponse {
        if (! in_array($file, ForecastEvidenceExporter::ALLOWED_FILES, true)) {
            abort(404, 'File not found.');
        }
        if ($run->synthetic_dataset_id !== null) {
            $user = $request->user();
            abort_unless($user && $user->hasPermission('planning.experiments'), 403, 'Thiếu quyền truy cập dữ liệu mô phỏng.');
        }

        if ($file === 'manifest.json') {
            return response()->json($exporter->manifest($run));
        }

        $data = $exporter->exportData($run, $file);

        return response()->stream(function () use ($data) {
            $handle = fopen('php://output', 'w');
            if (! is_resource($handle)) {
                return;
            }

            fputcsv($handle, $data['header']);
            foreach ($data['rows'] as $row) {
                fputcsv($handle, array_map(fn ($val) => $val === null ? '' : (string) $val, $row));
            }
            fclose($handle);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"run-{$run->id}-{$file}\"",
        ]);
    }

    public function experimentManifest(ForecastExperiment $experiment, ForecastEvidenceExporter $exporter): JsonResponse
    {
        $config = is_array($experiment->configuration) ? $experiment->configuration : [];

        return response()->json([
            'experiment_id' => $experiment->id,
            'status' => $experiment->status,
            'configuration' => $config,
            'runs' => $experiment->runs()->get(['id', 'kind', 'horizon_days', 'status', 'cell_key', 'synthetic_dataset_id'])->all(),
            'exporter' => $exporter->experimentSummary($experiment),
        ]);
    }

    public function experimentSummary(ForecastExperiment $experiment, ForecastEvidenceExporter $exporter): StreamedResponse
    {
        $data = $exporter->experimentSummary($experiment);

        return response()->stream(function () use ($data) {
            $handle = fopen('php://output', 'w');
            if (! is_resource($handle)) {
                return;
            }
            fputcsv($handle, $data['header']);
            foreach ($data['rows'] as $row) {
                fputcsv($handle, array_map(fn ($val) => $val === null ? '' : (string) $val, $row));
            }
            fclose($handle);
        }, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"experiment-{$experiment->id}-summary.csv\"",
        ]);
    }
}
