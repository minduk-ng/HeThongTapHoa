<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\SyntheticDatasetRequest;
use App\Models\ForecastRun;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\SyntheticDemandGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SyntheticDatasetController extends Controller
{
    public function index(Request $request): JsonResponse|InertiaResponse
    {
        $datasets = SyntheticDataset::withCount('invoices')
            ->with('creator:id,name,email')
            ->latest()
            ->get();

        if ($request->wantsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['data' => $datasets]);
        }

        $formattedDatasets = $datasets->map(function (SyntheticDataset $d) {
            return [
                'id' => $d->id,
                'name' => $d->name,
                'description' => $d->description,
                'seed' => $d->seed,
                'configuration' => $d->configuration,
                'config' => $d->configuration,
                'configuration_hash' => $d->configuration_hash,
                'generator_version' => $d->generator_version,
                'dataset_hash' => $d->dataset_hash,
                'source_label' => $d->name,
                'invoices_count' => (int) ($d->invoices_count ?? 0),
                'creator' => $d->creator,
                'created_at' => $d->created_at?->toISOString(),
                'updated_at' => $d->updated_at?->toISOString(),
            ];
        });

        $activeRuns = ForecastRun::whereNotNull('synthetic_dataset_id')
            ->latest('id')
            ->take(10)
            ->get();

        return Inertia::render('admin/planning/SyntheticDatasets', [
            'datasets' => $formattedDatasets,
            'recentRuns' => $activeRuns,
            'filters' => [
                'search' => $request->query('search'),
            ],
        ]);
    }

    public function store(SyntheticDatasetRequest $request, SyntheticDemandGenerator $generator): JsonResponse|RedirectResponse
    {
        $validated = $request->validated();
        $seed = (int) ($validated['seed'] ?? 42);
        $config = (array) ($validated['configuration'] ?? ['days' => 120]);

        $demand = $generator->generate($config, $seed);
        $datasetHash = $generator->hash($demand);
        $configHash = hash('sha256', (string) json_encode($config));

        $dataset = SyntheticDataset::create([
            'name' => (string) $validated['name'],
            'description' => isset($validated['description']) ? (string) $validated['description'] : null,
            'seed' => $seed,
            'configuration' => $config,
            'configuration_hash' => $configHash,
            'generator_version' => SyntheticDemandGenerator::VERSION,
            'dataset_hash' => $datasetHash,
            'created_by' => $request->user()?->id,
        ]);

        $generator->persist($dataset, $demand);

        if ($request->wantsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['data' => $dataset], 201);
        }

        return redirect()->back()->with('success', "Đã tạo tập dữ liệu thử nghiệm \"{$dataset->name}\".");
    }

    public function show(SyntheticDataset $syntheticDataset): JsonResponse
    {
        return response()->json(['data' => $syntheticDataset->loadCount('invoices')]);
    }

    public function destroy(SyntheticDatasetRequest $request, SyntheticDataset $syntheticDataset): JsonResponse|RedirectResponse
    {
        DB::transaction(function () use ($syntheticDataset) {
            $invoiceIds = Invoice::where('synthetic_dataset_id', $syntheticDataset->id)->pluck('id');

            if ($invoiceIds->isNotEmpty()) {
                InvoiceLine::whereIn('invoice_id', $invoiceIds)->delete();
                Invoice::where('synthetic_dataset_id', $syntheticDataset->id)->delete();
            }

            $syntheticDataset->delete();
        });

        if ($request->wantsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => 'Synthetic dataset deleted successfully.']);
        }

        return redirect()->back()->with('success', 'Đã xóa tập dữ liệu thử nghiệm.');
    }
}
