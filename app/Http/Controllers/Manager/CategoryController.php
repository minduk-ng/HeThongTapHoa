<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Http\RedirectResponse;

class CategoryController extends Controller
{
    public function index(Request $request): Response
    {
        $query = MenuCategory::with(['items' => function ($q) {
            $q->orderBy('name', 'asc');
        }])->withCount('items')->withSum('items', 'price');

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where('name', 'like', "%{$search}%");
        }

        $categories = $query->orderBy('sort_order', 'asc')->orderBy('id', 'desc')->get();

        return Inertia::render('manager/categories/CategoriesManager', [
            'categories' => $categories,
            'filters' => $request->only(['search']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:menu_categories,name',
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
        ]);

        $validated['sort_order'] = $validated['sort_order'] ?? 0;

        MenuCategory::create($validated);

        return back()->with('success', 'Thêm danh mục thành công!');
    }

    public function update(Request $request, MenuCategory $category): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:menu_categories,name,'.$category->id,
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
        ]);

        $validated['sort_order'] = $validated['sort_order'] ?? 0;

        $category->update($validated);

        return back()->with('success', 'Cập nhật danh mục thành công!');
    }

    public function destroy(Request $request, MenuCategory $category): RedirectResponse
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $category->delete();

        return back()->with('success', 'Xóa danh mục thành công!');
    }
}
