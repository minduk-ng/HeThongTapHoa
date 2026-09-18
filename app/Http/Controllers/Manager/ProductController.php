<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Support\SpreadsheetCellSanitizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductController extends Controller
{
    public function index(Request $request): Response
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

    public function store(Request $request): RedirectResponse
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
            $disk = config('filesystems.disks.sirv.enabled') ? 'sirv' : 'public';
            $file = $request->file('image');
            $filename = Str::slug($validated['name']).'_'.date('Ymd_His').'.'.$file->getClientOriginalExtension();
            $file->storeAs('products', $filename, $disk);
            $validated['image'] = Storage::disk($disk)->url('products/'.$filename);
        }

        $validated['vat_rate'] = $validated['vat_rate'] ?? 0;
        $validated['is_available'] = $request->boolean('is_available', true);

        MenuItem::create($validated);

        return back()->with('success', 'Thêm sản phẩm thành công!');
    }

    public function update(Request $request, MenuItem $product): RedirectResponse
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
            $disk = config('filesystems.disks.sirv.enabled') ? 'sirv' : 'public';
            // Delete old image file if exists
            $this->deleteProductImage($product->image);

            $file = $request->file('image');
            $filename = Str::slug($validated['name']).'_'.date('Ymd_His').'.'.$file->getClientOriginalExtension();
            $file->storeAs('products', $filename, $disk);
            $validated['image'] = Storage::disk($disk)->url('products/'.$filename);
        } else {
            unset($validated['image']);
        }

        $validated['vat_rate'] = $validated['vat_rate'] ?? 0;
        $validated['is_available'] = $request->boolean('is_available', true);

        $product->update($validated);

        return back()->with('success', 'Cập nhật sản phẩm thành công!');
    }

    public function destroy(Request $request, MenuItem $product): RedirectResponse
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        // Delete image file if exists
        $this->deleteProductImage($product->image);

        $product->delete();

        return back()->with('success', 'Đã xóa sản phẩm thành công!');
    }

    private function deleteProductImage(?string $image): void
    {
        if (! $image) {
            return;
        }
        if (str_starts_with($image, '/storage/')) {
            Storage::disk('public')->delete(str_replace('/storage/', '', $image));
        } elseif (str_contains($image, 'sirv.com')) {
            $oldPath = parse_url($image, PHP_URL_PATH);
            $baseFolder = (string) config('filesystems.disks.sirv.base_folder', '/TapHoa');
            $relativeSirvPath = ltrim(str_replace($baseFolder, '', (string) $oldPath), '/');
            Storage::disk('sirv')->delete($relativeSirvPath);
        }
    }

    public function export(): StreamedResponse
    {
        $items = MenuItem::with('category')->get();

        $headers = [
            'Content-type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename=danh_sach_san_pham_'.date('Ymd_His').'.csv',
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        $callback = function () use ($items) {
            $file = fopen('php://output', 'w');
            if ($file === false) {
                return;
            }
            // UTF-8 BOM for Excel compatibility
            fwrite($file, "\xEF\xBB\xBF");

            fputcsv($file, ['ID / Mã SP', 'Tên sản phẩm', 'Danh mục', 'Giá bán (VNĐ)', 'Thuế VAT (%)', 'Trạng thái', 'Ghi chú']);

            foreach ($items as $item) {
                fputcsv($file, SpreadsheetCellSanitizer::sanitizeRow([
                    $item->id,
                    $item->name,
                    $item->category ? $item->category->name : '',
                    $item->price,
                    $item->vat_rate,
                    $item->is_available ? 'Đang hoạt động' : 'Ngừng hoạt động',
                    $item->description,
                ]));
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    public function template(): StreamedResponse
    {
        $headers = [
            'Content-type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename=mau_nhap_san_pham.csv',
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        $sampleItems = [
            ['', 'Cà phê đen đá', 'Cà phê', 25000, 8, 'Đang hoạt động', 'Cà phê rang mộc nguyên chất'],
            ['', 'Cà phê sữa đá', 'Cà phê', 30000, 8, 'Đang hoạt động', 'Pha phin truyền thống đậm đà'],
            ['', 'Bạc xỉu đá', 'Cà phê', 35000, 8, 'Đang hoạt động', 'Nhiều sữa ít cà phê ngọt dịu'],
            ['', 'Trà đào cam sả', 'Trà trái cây', 40000, 8, 'Đang hoạt động', 'Thanh mát giải nhiệt kèm đào ngâm'],
            ['', 'Trà vải lài', 'Trà trái cây', 38000, 8, 'Đang hoạt động', 'Trà nhài thơm kết hợp quả vải'],
            ['', 'Bánh mì que pate', 'Đồ ăn nhanh', 20000, 0, 'Đang hoạt động', 'Bánh mì giòn nóng kèm pate béo ngậy'],
        ];

        $callback = function () use ($sampleItems) {
            $file = fopen('php://output', 'w');
            if ($file === false) {
                return;
            }
            // UTF-8 BOM for Excel compatibility
            fwrite($file, "\xEF\xBB\xBF");

            fputcsv($file, ['ID / Mã SP', 'Tên sản phẩm', 'Danh mục', 'Giá bán (VNĐ)', 'Thuế VAT (%)', 'Trạng thái', 'Ghi chú']);

            foreach ($sampleItems as $item) {
                fputcsv($file, $item);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, $headers);
    }

    public function checkImport(Request $request): JsonResponse
    {
        try {
            $request->validate([
                'file' => ['required', 'file', 'mimes:csv,txt', 'max:2048'],
            ]);

            $file = $request->file('file');
            $path = $file->getRealPath();

            $handle = fopen($path, 'r');
            if ($handle === false) {
                return response()->json(['message' => 'Không thể đọc nội dung file.'], 422);
            }

            try {
                $firstLine = fgets($handle);
                if ($firstLine === false) {
                    $firstLine = '';
                }

                if (str_starts_with($firstLine, "\xEF\xBB\xBF")) {
                    $firstLine = substr($firstLine, 3);
                }

                while (trim($firstLine) === '' && ! feof($handle)) {
                    $nextLine = fgets($handle);
                    if ($nextLine === false) {
                        break;
                    }
                    $firstLine = $nextLine;
                }

                $delimiter = ',';
                if (substr_count($firstLine, ';') > substr_count($firstLine, ',')) {
                    $delimiter = ';';
                } elseif (substr_count($firstLine, "\t") > substr_count($firstLine, ',')) {
                    $delimiter = "\t";
                }

                $rows = [];
                $rowCount = 0;

                while (($data = fgetcsv($handle, 0, $delimiter)) !== false) {
                    if ($data === [null] || empty(array_filter($data, fn ($val) => $val !== null && trim((string) $val) !== ''))) {
                        continue;
                    }

                    $rowCount++;
                    if ($rowCount > 5000) {
                        return response()->json(['message' => 'Số lượng dòng trong file vượt quá giới hạn 5.000 dòng.'], 422);
                    }

                    if (isset($data[0]) || isset($data[1])) {
                        $rawId = trim((string) ($data[0] ?? ''));
                        $cleanId = preg_replace('/[^0-9]/', '', $rawId);

                        $rows[] = [
                            'id' => $cleanId !== '' ? (int) $cleanId : null,
                            'raw_id' => $rawId,
                            'name' => trim((string) ($data[1] ?? '')),
                            'category' => trim((string) ($data[2] ?? '')),
                            'price' => (float) preg_replace('/[^0-9.]/', '', (string) ($data[3] ?? '0')),
                            'vat_rate' => (float) preg_replace('/[^0-9.]/', '', (string) ($data[4] ?? '0')),
                            'description' => trim((string) ($data[6] ?? '')),
                        ];
                    }
                }
            } finally {
                if (is_resource($handle)) {
                    fclose($handle);
                }
            }

            $existingIds = MenuItem::pluck('id')->toArray();
            $existingNames = MenuItem::pluck('name')->map(fn ($n) => mb_strtolower((string) $n))->toArray();

            $duplicates = [];
            $newItems = [];

            foreach ($rows as $row) {
                $isDuplicate = false;
                if (! empty($row['id']) && in_array((int) $row['id'], $existingIds)) {
                    $isDuplicate = true;
                } elseif (! empty($row['name']) && in_array(mb_strtolower((string) $row['name']), $existingNames)) {
                    $isDuplicate = true;
                }

                if ($isDuplicate) {
                    $duplicates[] = $row;
                } else {
                    $newItems[] = $row;
                }
            }

            // Cache temp import data
            $tempId = 'import_'.Str::random(10);
            $tempPayload = [
                'rows' => $rows,
                'duplicates' => $duplicates,
                'new_items' => $newItems,
            ];
            Cache::put($tempId, $tempPayload, now()->addMinutes(30));
            session([$tempId => $tempPayload]);

            return response()->json([
                'temp_id' => $tempId,
                'total_count' => count($rows),
                'duplicates_count' => count($duplicates),
                'new_count' => count($newItems),
                'duplicates' => $duplicates,
            ]);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Lỗi import sản phẩm: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json(['message' => 'Có lỗi xảy ra khi xử lý file import. Vui lòng kiểm tra định dạng file.'], 422);
        }
    }

    public function confirmImport(Request $request): JsonResponse|RedirectResponse
    {
        $request->validate([
            'temp_id' => 'required|string',
            'action' => 'required|in:replace_all,add_only_new',
        ]);

        $tempData = Cache::get($request->temp_id) ?? session($request->temp_id);
        if (! $tempData) {
            return response()->json(['message' => 'Dữ liệu tạm không tồn tại hoặc đã hết hạn.'], 400);
        }

        $defaultCategory = MenuCategory::firstOrCreate(
            ['name' => 'Không rõ'],
            ['sort_order' => 999, 'description' => 'Danh mục mặc định cho các sản phẩm không có danh mục']
        );

        if ($request->action === 'replace_all') {
            foreach ($tempData['rows'] as $row) {
                if (empty($row['name'])) {
                    continue;
                }

                $catId = $defaultCategory->id;
                if (! empty($row['category'])) {
                    $cat = MenuCategory::firstOrCreate(['name' => trim($row['category'])], ['sort_order' => 0]);
                    $catId = $cat->id;
                }

                if (! empty($row['id']) && MenuItem::where('id', $row['id'])->exists()) {
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
                if (empty($row['name'])) {
                    continue;
                }

                $catId = $defaultCategory->id;
                if (! empty($row['category'])) {
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

        Cache::forget($request->temp_id);
        session()->forget($request->temp_id);

        return back()->with('success', 'Nhập dữ liệu Excel thành công!');
    }
}
