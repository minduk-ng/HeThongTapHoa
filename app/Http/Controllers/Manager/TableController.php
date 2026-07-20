<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Table;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TableController extends Controller
{
    public function index(Request $request)
    {
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
            'table_number' => 'required|string|max:20|unique:tables,table_number',
            'area' => 'required|string|max:50',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|in:available,occupied,reserved,maintenance',
        ]);

        Table::create($validated);

        return back()->with('success', 'Thêm bàn mới thành công!');
    }

    public function update(Request $request, Table $table)
    {
        $validated = $request->validate([
            'table_number' => 'required|string|max:20|unique:tables,table_number,' . $table->id,
            'area' => 'required|string|max:50',
            'capacity' => 'required|integer|min:1',
            'status' => 'required|in:available,occupied,reserved,maintenance',
        ]);

        $table->update($validated);

        return back()->with('success', 'Cập nhật thông tin bàn thành công!');
    }

    public function destroy(Request $request, Table $table)
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        if (!\Illuminate\Support\Facades\Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $table->delete();

        return back()->with('success', 'Xóa bàn thành công!');
    }
}
