<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\SyntheticDatasetRequest;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\SyntheticDemandGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SyntheticDatasetController extends Controller
{
    public function index(): JsonResponse
    {
        $datasets = SyntheticDataset::withCount('invoices')
            ->with('creator:id,name,email')
            ->latest()
            ->get();

        return response()->json(['data' => $datasets]);
    }

    public function store(SyntheticDatasetRequest $request, SyntheticDemandGenerator $generator): JsonResponse
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

        return response()->json(['data' => $dataset], 201);
    }

    public function show(SyntheticDataset $syntheticDataset): JsonResponse
    {
        return response()->json(['data' => $syntheticDataset->loadCount('invoices')]);
    }

    public function destroy(SyntheticDatasetRequest $request, SyntheticDataset $syntheticDataset): JsonResponse
    {
        DB::transaction(function () use ($syntheticDataset) {
            $invoiceIds = Invoice::where('synthetic_dataset_id', $syntheticDataset->id)->pluck('id');

            if ($invoiceIds->isNotEmpty()) {
                InvoiceLine::whereIn('invoice_id', $invoiceIds)->delete();
                Invoice::where('synthetic_dataset_id', $syntheticDataset->id)->delete();
            }

            $syntheticDataset->delete();
        });

        return response()->json(['message' => 'Synthetic dataset deleted successfully.']);
    }
}
