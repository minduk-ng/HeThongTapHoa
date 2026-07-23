<?php

namespace App\Http\Controllers\Manager;

use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class TableController extends Controller
{
    public function index(Request $request)
    {
        // Auto-seed takeaway virtual tables if not present
        if (! Table::where('table_number', 'Mang đi 01')->exists()) {
            Table::create([
                'table_number' => 'Mang đi 01',
                'capacity' => 1,
                'area' => 'Mang đi (Takeaway)',
                'status' => 'available',
            ]);
        }
        if (! Table::where('table_number', 'Mang đi 02')->exists()) {
            Table::create([
                'table_number' => 'Mang đi 02',
                'capacity' => 1,
                'area' => 'Mang đi (Takeaway)',
                'status' => 'available',
            ]);
        }

        $query = Table::query();

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where('table_number', 'like', "%{$search}%");
        }

        if ($request->filled('area') && $request->area !== 'all') {
            $query->where('area', $request->area);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        $tables = $query->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();
        $areas = Table::select('area')->whereNotNull('area')->distinct()->pluck('area')->toArray();

        return Inertia::render('manager/tables/TableManager', [
            'tables' => $tables,
            'areas' => $areas,
            'filters' => $request->only(['search', 'area', 'status']),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'table_number' => 'required|string|max:50|unique:tables,table_number',
            'area' => 'required|string|max:50',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|in:available,occupied,reserved,maintenance',
            'reservation_name' => 'nullable|string|max:100',
            'reservation_phone' => 'nullable|string|max:20',
            'reservation_time' => 'nullable|date',
            'reservation_note' => 'nullable|string|max:500',
        ]);

        $table = Table::create($validated);

        TableStatusUpdated::dispatch($table);

        return back()->with('success', 'Thêm bàn mới thành công!');
    }

    public function batchStore(Request $request)
    {
        $validated = $request->validate([
            'prefix' => 'nullable|string|max:20',
            'from_number' => 'required|integer|min:1',
            'to_number' => 'required|integer|gte:from_number',
            'area' => 'required|string|max:50',
            'capacity' => 'required|integer|min:1',
        ]);

        $prefix = $validated['prefix'] ?? 'Bàn ';
        $createdCount = 0;
        $lastCreatedTable = null;

        for ($i = $validated['from_number']; $i <= $validated['to_number']; $i++) {
            $tableName = $prefix.sprintf('%02d', $i);
            if (! Table::where('table_number', $tableName)->exists()) {
                $lastCreatedTable = Table::create([
                    'table_number' => $tableName,
                    'area' => $validated['area'],
                    'capacity' => $validated['capacity'],
                    'status' => 'available',
                ]);
                $createdCount++;
            }
        }

        if ($lastCreatedTable) {
            TableStatusUpdated::dispatch($lastCreatedTable);
        }

        return back()->with('success', "Đã tạo tự động {$createdCount} bàn mới thành công!");
    }

    public function update(Request $request, Table $table)
    {
        $validated = $request->validate([
            'table_number' => 'required|string|max:50|unique:tables,table_number,'.$table->id,
            'area' => 'required|string|max:50',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|in:available,occupied,reserved,maintenance',
            'reservation_name' => 'nullable|string|max:100',
            'reservation_phone' => 'nullable|string|max:20',
            'reservation_time' => 'nullable|date',
            'reservation_note' => 'nullable|string|max:500',
        ]);

        // Guard: Cannot manually set an occupied table (or a table with unpaid active orders) back to available
        if (($table->status === 'occupied' || $table->activeOrders()->exists()) && $validated['status'] === 'available') {
            return back()->withErrors([
                'status' => "Bàn “{$table->table_number}” đang có đơn hàng chưa thanh toán. Vui lòng thanh toán tại màn hình POS trước.",
            ]);
        }

        // If status changed away from reserved, clear reservation fields
        if ($validated['status'] !== 'reserved') {
            $validated['reservation_name'] = null;
            $validated['reservation_phone'] = null;
            $validated['reservation_time'] = null;
            $validated['reservation_note'] = null;
        }

        $table->update($validated);

        TableStatusUpdated::dispatch($table);

        return back()->with('success', 'Cập nhật thông tin bàn thành công!');
    }

    public function destroy(Request $request, Table $table)
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $clonedTable = clone $table;
        $table->delete();

        TableStatusUpdated::dispatch($clonedTable);

        return back()->with('success', 'Xóa bàn thành công!');
    }
}
