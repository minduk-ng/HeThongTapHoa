<?php

namespace App\Http\Controllers\Staff;

use App\Events\TableStatusUpdated;
use App\Events\TableTransferred;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\Order;
use App\Models\Table;
use App\Services\IdempotencyGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableOperationController extends Controller
{
    use DispatchesSafely;

    public function transferTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'transfer_table', [
            'source_table_id' => $validated['source_table_id'],
            'target_table_id' => $validated['target_table_id'],
        ])) {
            return back()->with('success', 'Chuyển bàn thành công!');
        }

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                if (Order::whereIn('table_id', [$sourceTable->id, $targetTable->id])->where('status', 'reserved')->exists()) {
                    throw new \Exception('Không thể chuyển bàn đang có đơn đặt trước.');
                }

                if ($targetTable->status !== 'available' && ! $targetTable->merged_into_table_id) {
                    throw new \Exception('Bàn đích phải ở trạng thái bàn trống.');
                }

                if ($sourceTable->merged_into_table_id) {
                    // Case 1: Source table is a sub-table in a merged group
                    // Target table takes over the merge link to primary table
                    $primaryId = $sourceTable->merged_into_table_id;
                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => $primaryId,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $primaryTable = Table::find($primaryId);
                    if ($primaryTable) {
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($primaryTable));
                    }
                } elseif (Table::where('merged_into_table_id', $sourceTable->id)->exists()) {
                    // Case 2: Source table is the primary table of a merged group
                    // Move all active orders to target table
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', Order::ACTIVE_STATUSES)
                        ->update(['table_id' => $targetTable->id]);

                    // Update all sub-tables to point to target table as their new primary table
                    $subTables = Table::where('merged_into_table_id', $sourceTable->id)->get();
                    foreach ($subTables as $subTable) {
                        $subTable->update(['merged_into_table_id' => $targetTable->id]);
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($subTable));
                    }

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);
                } else {
                    // Case 3: Standard independent table transfer
                    Order::where('table_id', $sourceTable->id)
                        ->whereIn('status', Order::ACTIVE_STATUSES)
                        ->update(['table_id' => $targetTable->id]);

                    $sourceTable->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                    $targetTable->update([
                        'status' => 'occupied',
                        'merged_into_table_id' => null,
                    ]);
                }

                $this->safeDispatch(function () use ($sourceTable, $targetTable) {
                    TableTransferred::dispatch($sourceTable, $targetTable, 'transfer');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($targetTable);
                });
            });

            return back()->with('success', 'Chuyển bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Chuyển bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function mergeTables(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'target_table_id' => 'required|exists:tables,id|different:source_table_id',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'merge_tables', [
            'source_table_id' => $validated['source_table_id'],
            'target_table_id' => $validated['target_table_id'],
        ])) {
            return back()->with('success', 'Gộp bàn thành công!');
        }

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $targetTable = Table::lockForUpdate()->findOrFail($validated['target_table_id']);

                if (Order::whereIn('table_id', [$sourceTable->id, $targetTable->id])->where('status', 'reserved')->exists()) {
                    throw new \Exception('Không thể gộp bàn đang có đơn đặt trước.');
                }

                $primaryTargetId = $targetTable->merged_into_table_id ?? $targetTable->id;

                // Move all active orders from source table and any sub-tables of source to primaryTargetId
                $sourceGroupIds = Table::where('id', $sourceTable->id)
                    ->orWhere('merged_into_table_id', $sourceTable->id)
                    ->pluck('id');

                Order::whereIn('table_id', $sourceGroupIds)
                    ->whereIn('status', Order::ACTIVE_STATUSES)
                    ->update(['table_id' => $primaryTargetId]);

                // Mark source table and any former sub-tables as merged into primaryTargetId
                Table::whereIn('id', $sourceGroupIds)->update([
                    'status' => 'occupied',
                    'merged_into_table_id' => $primaryTargetId,
                ]);

                // Ensure primary target table is occupied
                Table::where('id', $primaryTargetId)->update(['status' => 'occupied']);

                $primaryTargetTable = Table::find($primaryTargetId);
                $this->safeDispatch(function () use ($sourceTable, $primaryTargetTable) {
                    TableTransferred::dispatch($sourceTable, $primaryTargetTable, 'merge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($primaryTargetTable);
                });
            });

            return back()->with('success', 'Gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Gộp bàn thất bại: '.$e->getMessage()]);
        }
    }

    public function unmergeTable(Request $request)
    {
        $validated = $request->validate([
            'source_table_id' => 'required|exists:tables,id',
            'keep_table_id' => 'required|exists:tables,id',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'unmerge_table', [
            'source_table_id' => $validated['source_table_id'],
            'keep_table_id' => $validated['keep_table_id'],
        ])) {
            return back()->with('success', 'Tách / Hủy gộp bàn thành công!');
        }

        try {
            DB::transaction(function () use ($validated) {
                $sourceTable = Table::lockForUpdate()->findOrFail($validated['source_table_id']);
                $keepTable = Table::lockForUpdate()->findOrFail($validated['keep_table_id']);

                $groupId = $sourceTable->merged_into_table_id ?? $sourceTable->id;
                $allGroupTableIds = Table::where('id', $groupId)
                    ->orWhere('merged_into_table_id', $groupId)
                    ->pluck('id');

                // Move all active orders in group to keep_table_id
                Order::whereIn('table_id', $allGroupTableIds)
                    ->whereIn('status', Order::ACTIVE_STATUSES)
                    ->update(['table_id' => $keepTable->id]);

                // Dynamic calculation: set status based on whether keepTable has active uncompleted orders
                $hasActiveOrders = Order::where('table_id', $keepTable->id)
                    ->whereIn('status', Order::ACTIVE_STATUSES)
                    ->whereHas('items', function ($query) {
                        $query->where('status', '!=', 'cancelled');
                    })
                    ->exists();

                $keepTableStatus = $hasActiveOrders ? 'occupied' : 'available';

                $keepTable->update([
                    'status' => $keepTableStatus,
                    'merged_into_table_id' => null,
                ]);

                // For all other tables in group: reset merged_into_table_id = null, status = available
                Table::whereIn('id', $allGroupTableIds)
                    ->where('id', '!=', $keepTable->id)
                    ->update([
                        'status' => 'available',
                        'merged_into_table_id' => null,
                    ]);

                $this->safeDispatch(function () use ($sourceTable, $keepTable) {
                    TableTransferred::dispatch($sourceTable, $keepTable, 'unmerge');
                    TableStatusUpdated::dispatch($sourceTable);
                    TableStatusUpdated::dispatch($keepTable);
                });
            });

            return back()->with('success', 'Tách / Hủy gộp bàn thành công!');
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => 'Tách / Hủy gộp bàn thất bại: '.$e->getMessage()]);
        }
    }
}
