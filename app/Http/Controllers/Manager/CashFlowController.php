<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MoneyLedgerEntry;
use App\Services\MoneyLedgerService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CashFlowController extends Controller
{
    public function index(Request $request): Response
    {
        $validated = $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'direction' => 'nullable|in:in,out',
            'type' => 'nullable|in:'.implode(',', MoneyLedgerService::TYPES),
            'method' => 'nullable|string|max:30',
            'only_warnings' => 'nullable|boolean',
            'shift' => 'nullable|integer|exists:shifts,id',
            'employee' => 'nullable|integer|exists:users,id',
        ]);

        $startDate = $validated['start_date'] ?? today()->toDateString();
        $endDate = $validated['end_date'] ?? today()->toDateString();

        $query = MoneyLedgerEntry::query()->with(['actor:id,name', 'invoice:id,invoice_code'])
            ->whereBetween('created_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"]);

        if (! empty($validated['direction'])) {
            $query->where('direction', $validated['direction']);
        }
        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }
        if (! empty($validated['method'])) {
            $query->where('method', $validated['method']);
        }
        if (! empty($validated['only_warnings'])) {
            $query->whereJsonLength('warning_flags', '>', 0);
        }
        if (! empty($validated['shift'])) {
            $query->where('shift_id', $validated['shift']);
        }
        if (! empty($validated['employee'])) {
            $query->where('actor_id', $validated['employee']);
        }

        $entries = $query->orderByDesc('id')->limit(500)->get()->map(fn ($e) => [
            'id' => $e->id,
            'direction' => $e->direction,
            'type' => $e->type,
            'amount' => (float) $e->amount,
            'method' => $e->method,
            'actor_id' => $e->actor_id,
            'actor_name' => $e->actor?->name,
            'shift_id' => $e->shift_id,
            'invoice_id' => $e->invoice_id,
            'invoice_code' => $e->invoice?->invoice_code,
            'order_id' => $e->order_id,
            'supplier_id' => $e->supplier_id,
            'warning_flags' => $e->warning_flags ?? [],
            'created_at' => $e->created_at?->toIso8601String(),
        ]);

        $totalIn = (float) (clone $query)->where('direction', 'in')->sum('amount');
        $totalOut = (float) (clone $query)->where('direction', 'out')->sum('amount');
        $warnedCount = (clone $query)->whereJsonLength('warning_flags', '>', 0)->count();

        return Inertia::render('manager/cash-flow/CashFlowManager', [
            'entries' => $entries,
            'totals' => [
                'total_in' => $totalIn,
                'total_out' => $totalOut,
                'net' => round($totalIn - $totalOut, 2),
                'warned_count' => $warnedCount,
            ],
            'filters' => [
                'start_date' => $startDate,
                'end_date' => $endDate,
                'direction' => $validated['direction'] ?? 'all',
                'type' => $validated['type'] ?? 'all',
                'method' => $validated['method'] ?? 'all',
                'only_warnings' => (bool) ($validated['only_warnings'] ?? false),
                'shift' => isset($validated['shift']) ? (string) $validated['shift'] : 'all',
                'employee' => isset($validated['employee']) ? (string) $validated['employee'] : 'all',
            ],
            'types' => MoneyLedgerService::TYPES,
        ]);
    }
}
