<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Shift;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;
use Inertia\Inertia;
use Inertia\Response;

class ShiftController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('staff/shifts/ShiftsPage');
    }

    public function open(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'opening_cash' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        $lock = Cache::lock('shift-open', 30);

        if (! $lock->get()) {
            return response()->json(['error' => 'Đã có một ca làm việc đang mở. Hãy đóng ca hiện tại trước khi mở ca mới.'], 409);
        }

        try {
            $shift = Shift::create([
                'opened_at' => now(),
                'opening_cash' => $validated['opening_cash'],
                'note' => $validated['note'] ?? null,
                'status' => 'open',
                'status_token' => 'OPEN',
                'opened_by' => $request->user()?->id,
            ]);
        } catch (QueryException $e) {
            if ($e->getCode() === '23000') {
                $lock->release();

                return response()->json(['error' => 'Đã có một ca làm việc đang mở. Hãy đóng ca hiện tại trước khi mở ca mới.'], 409);
            }

            $lock->release();
            throw $e;
        }

        $lock->release();

        return response()->json(['success' => true, 'shift' => $shift]);
    }

    public function current(): JsonResponse
    {
        $shift = Shift::open()->latest('id')->first();

        if (! $shift) {
            return response()->json(['shift' => null, 'expected_cash' => 0]);
        }

        return response()->json([
            'shift' => $shift,
            'expected_cash' => $this->expectedCash($shift, now()),
        ]);
    }

    public function close(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'actual_cash' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        $result = DB::transaction(function () use ($validated, $request) {
            $shift = Shift::open()->lockForUpdate()->latest('id')->first();
            if (! $shift) {
                return null;
            }

            $closedAt = now();
            $expectedCash = $this->expectedCash($shift, $closedAt);
            $shift->update([
                'closed_at' => $closedAt,
                'closing_cash' => $expectedCash,
                'actual_cash' => $validated['actual_cash'],
                'status' => 'closed',
                'status_token' => null,
                'closed_by' => $request->user()?->id,
                'note' => $validated['note'] ?? $shift->note,
            ]);

            return ['shift' => $shift->fresh(), 'expected_cash' => $expectedCash];
        });

        if (! $result) {
            return response()->json(['error' => 'Không có ca làm việc nào đang mở để đóng.'], 409);
        }

        Cache::lock('shift-open')->forceRelease();

        return response()->json([
            'success' => true,
            'shift' => $result['shift'],
            'expected_cash' => $result['expected_cash'],
            'difference' => round((float) $validated['actual_cash'] - $result['expected_cash'], 2),
        ]);
    }

    private function expectedCash(Shift $shift, CarbonInterface $until): float
    {
        $received = Invoice::query()
            ->where('payment_method', 'cash')
            ->whereBetween('issued_at', [$shift->opened_at, $until])
            ->sum('amount_received');

        return round((float) $shift->opening_cash + (float) $received, 2);
    }
}
