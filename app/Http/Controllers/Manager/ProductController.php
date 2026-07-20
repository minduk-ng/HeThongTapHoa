<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = MenuItem::with('category');

        // Status Filter
        if ($request->has('status')) {
            if ($request->status === 'active') {
                $query->where('is_available', true);
            } elseif ($request->status === 'inactive') {
                $query->where('is_available', false);
            }
        }

        // Search Filter (ID or Name)
        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('id', $search)
                  ->orWhere('name', 'like', "%{$search}%");
            });
        }

        // Category Filter
        if ($request->filled('category_id') && $request->category_id !== 'all') {
            $query->where('category_id', $request->category_id);
        }

        // Price Filter
        if ($request->filled('min_price')) {
            $query->where('price', '>=', (float) $request->min_price);
        }
        if ($request->filled('max_price')) {
            $query->where('price', '<=', (float) $request->max_price);
        }

        $items = $query->orderBy('id', 'desc')->get();
        $categories = MenuCategory::orderBy('sort_order', 'asc')->orderBy('name', 'asc')->get();

        // Calculate min & max prices for slider boundaries
        $globalMinPrice = (float) (MenuItem::min('price') ?? 0);
        $globalMaxPrice = (float) (MenuItem::max('price') ?? 500000);

        return Inertia::render('manager/products/ProductsManager', [
            'items' => $items,
            'categories' => $categories,
            'filters' => $request->only(['status', 'search', 'category_id', 'min_price', 'max_price']),
            'priceRangeLimits' => [
                'min' => $globalMinPrice,
                'max' => max($globalMaxPrice, 100000),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'category_id' => 'required|exists:menu_categories,id',
            'price' => 'required|numeric|min:0',
            'vat_rate' => 'nullable|numeric|min:0|max:100',
            'description' => 'nullable|string',
            'is_available' => 'boolean',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $filename = Str::slug($validated['name']) . '_' . date('Ymd_His') . '.' . $file->getClientOriginalExtension();
            $path = $file->storeAs('menu', $filename, 'public');
            $validated['image'] = '/storage/' . $path;
        }

        $validated['vat_rate'] = $validated['vat_rate'] ?? 0;
        $validated['is_available'] = $request->boolean('is_available', true);

        MenuItem::create($validated);

        return back()->with('success', 'Thêm sản phẩm thành công!');
    }

    public function update(Request $request, MenuItem $product)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'category_id' => 'required|exists:menu_categories,id',
            'price' => 'required|numeric|min:0',
            'vat_rate' => 'nullable|numeric|min:0|max:100',
            'description' => 'nullable|string',
            'is_available' => 'boolean',
            'image' => 'nullable',
        ]);

        if ($request->hasFile('image')) {
            // Delete old image file if exists
            if ($product->image && str_starts_with($product->image, '/storage/')) {
                $oldPath = str_replace('/storage/', '', $product->image);
                Storage::disk('public')->delete($oldPath);
            }

            $file = $request->file('image');
            $filename = Str::slug($validated['name']) . '_' . date('Ymd_His') . '.' . $file->getClientOriginalExtension();
            $path = $file->storeAs('menu', $filename, 'public');
            $validated['image'] = '/storage/' . $path;
        } else {
            unset($validated['image']);
        }

        $validated['vat_rate'] = $validated['vat_rate'] ?? 0;
        $validated['is_available'] = $request->boolean('is_available', true);

        $product->update($validated);

        return back()->with('success', 'Cập nhật sản phẩm thành công!');
    }

    public function destroy(MenuItem $product)
    {
        // Delete image file if exists
        if ($product->image && str_starts_with($product->image, '/storage/')) {
            $oldPath = str_replace('/storage/', '', $product->image);
            Storage::disk('public')->delete($oldPath);
        }

        $product->delete();

        return back()->with('success', 'Đã xóa sản phẩm thành công!');
    }

    public function export()
    {
        $items = MenuItem::with('category')->get();

        $headers = [
            "Content-type" => "text/csv; charset=UTF-8",
            "Content-Disposition" => "attachment; filename=danh_sach_san_pham_" . date('Ymd_His') . ".csv",
            "Pragma" => "no-cache",
            "Cache-Control" => "must-revalidate, post-check=0, pre-check=0",
            "Expires" => "0",
        ];

        $callback = function () use ($items) {
            $file = fopen('php://output', 'w');
            // UTF-8 BOM for Excel compatibility
            fputs($file, "\xEF\xBB\xBF");

            fputcsv($file, ['ID / Mã SP', 'Tên sản phẩm', 'Danh mục', 'Giá bán (VNĐ)', 'Thuế VAT (%)', 'Trạng thái', 'Ghi chú']);

            foreach ($items as $item) {
                fputcsv($file, [
                    $item->id,
                    $item->name,
                    $item->category ? $item->category->name : '',
                    $item->price,
                    $item->vat_rate,
                    $item->is_available ? 'Đang hoạt động' : 'Ngừng hoạt động',
                    $item->description,
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    public function checkImport(Request $request)
    {
        try {
            $request->validate([
                'file' => 'required|file|mimes:csv,txt,xlsx|max:10240',
            ]);

            $file = $request->file('file');
            $path = $file->getRealPath();

            $content = file_get_contents($path);
            if ($content === false) {
                return response()->json(['message' => 'Không thể đọc nội dung file.'], 422);
            }

            // Remove UTF-8 BOM if present
            if (str_starts_with($content, "\xEF\xBB\xBF")) {
                $content = substr($content, 3);
            }

            // Auto-detect delimiter (, or ; or \t)
            $firstLine = strtok($content, "\r\n");
            $delimiter = ',';
            if (substr_count($firstLine, ';') > substr_count($firstLine, ',')) {
                $delimiter = ';';
            } elseif (substr_count($firstLine, "\t") > substr_count($firstLine, ',')) {
                $delimiter = "\t";
            }

            $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $content));
            $rows = [];
            $isHeader = true;

            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line)) continue;

                $data = str_getcsv($line, $delimiter);
                if ($isHeader) {
                    $isHeader = false;
                    continue;
                }

                if (isset($data[0]) || isset($data[1])) {
                    $rawId = trim($data[0] ?? '');
                    $cleanId = preg_replace('/[^0-9]/', '', $rawId);

                    $rows[] = [
                        'id' => $cleanId !== '' ? (int)$cleanId : null,
                        'raw_id' => $rawId,
                        'name' => trim($data[1] ?? ''),
                        'category' => trim($data[2] ?? ''),
                        'price' => (float) preg_replace('/[^0-9.]/', '', $data[3] ?? '0'),
                        'vat_rate' => (float) preg_replace('/[^0-9.]/', '', $data[4] ?? '0'),
                        'description' => trim($data[6] ?? ''),
                    ];
                }
            }

            $existingIds = MenuItem::pluck('id')->toArray();
            $existingNames = MenuItem::pluck('name')->map(fn($n) => mb_strtolower($n))->toArray();

            $duplicates = [];
            $newItems = [];

            foreach ($rows as $row) {
                $isDuplicate = false;
                if (!empty($row['id']) && in_array((int)$row['id'], $existingIds)) {
                    $isDuplicate = true;
                } elseif (!empty($row['name']) && in_array(mb_strtolower($row['name']), $existingNames)) {
                    $isDuplicate = true;
                }

                if ($isDuplicate) {
                    $duplicates[] = $row;
                } else {
                    $newItems[] = $row;
                }
            }

            // Cache temp import data
            $tempId = 'import_' . Str::random(10);
            session([$tempId => ['rows' => $rows, 'duplicates' => $duplicates, 'new_items' => $newItems]]);

            return response()->json([
                'temp_id' => $tempId,
                'total_count' => count($rows),
                'duplicates_count' => count($duplicates),
                'new_count' => count($newItems),
                'duplicates' => $duplicates,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Lỗi đọc file: ' . $e->getMessage()], 422);
        }
    }

    public function confirmImport(Request $request)
    {
        $request->validate([
            'temp_id' => 'required|string',
            'action' => 'required|in:replace_all,add_only_new',
        ]);

        $tempData = session($request->temp_id);
        if (!$tempData) {
            return response()->json(['message' => 'Dữ liệu tạm không tồn tại hoặc đã hết hạn.'], 400);
        }

        $defaultCategory = MenuCategory::firstOrCreate(
            ['name' => 'Không rõ'],
            ['sort_order' => 999, 'description' => 'Danh mục mặc định cho các sản phẩm không có danh mục']
        );

        if ($request->action === 'replace_all') {
            foreach ($tempData['rows'] as $row) {
                if (empty($row['name'])) continue;

                $catId = $defaultCategory->id;
                if (!empty($row['category'])) {
                    $cat = MenuCategory::firstOrCreate(['name' => trim($row['category'])], ['sort_order' => 0]);
                    $catId = $cat->id;
                }

                if (!empty($row['id']) && MenuItem::where('id', $row['id'])->exists()) {
                    MenuItem::where('id', $row['id'])->update([
                        'name' => $row['name'],
                        'category_id' => $catId,
                        'price' => $row['price'],
                        'vat_rate' => $row['vat_rate'],
                        'description' => $row['description'],
                    ]);
                } else {
                    // ID omitted so database auto-increments ID automatically
                    MenuItem::create([
                        'name' => $row['name'],
                        'category_id' => $catId,
                        'price' => $row['price'],
                        'vat_rate' => $row['vat_rate'],
                        'description' => $row['description'],
                        'is_available' => true,
                    ]);
                }
            }
        } else { // add_only_new
            foreach ($tempData['new_items'] as $row) {
                if (empty($row['name'])) continue;

                $catId = $defaultCategory->id;
                if (!empty($row['category'])) {
                    $cat = MenuCategory::firstOrCreate(['name' => trim($row['category'])], ['sort_order' => 0]);
                    $catId = $cat->id;
                }

                // ID omitted so database auto-increments ID automatically
                MenuItem::create([
                    'name' => $row['name'],
                    'category_id' => $catId,
                    'price' => $row['price'],
                    'vat_rate' => $row['vat_rate'],
                    'description' => $row['description'],
                    'is_available' => true,
                ]);
            }
        }

        session()->forget($request->temp_id);

        return back()->with('success', 'Nhập dữ liệu Excel thành công!');
    }
}
