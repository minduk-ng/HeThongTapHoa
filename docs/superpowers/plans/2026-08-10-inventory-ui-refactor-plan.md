# Kho UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cải thiện giao diện kho: tách 3 trang kho sang nhóm "Kho", hỗ trợ đơn vị mua + quy đổi khi nhập, tạo shared DataTable refactor 5 bảng, chuyển chi tiết phiếu sang trang riêng.

**Architecture:** Frontend chủ yếu + 1 migration nhỏ. `AuthorizationSeeder` đổi group_name 3 page sang "Kho" (sidebar tự nhóm). `ingredients` thêm `purchase_unit`/`unit_conversion` — modal nhập quy đổi payload về unit gốc. Tạo `DataTable.tsx` generic chứa khung xương (sort/compact/pagination) — 5 bảng quản lý refactor dùng chung. `StockVoucherController::show` render trang riêng `StockVoucherDetail` (pattern OrderList→OrderDetail).

**Tech Stack:** Laravel 13, PHP, Pest, Inertia + React + TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-10-inventory-ui-refactor-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- Giữ URL `/manager/inventory/*` — KHÔNG đổi route path.
- KHÔNG đổi logic phiếu xuất/checkout, KHÔNG đổi `StockVoucherController::store` (frontend quy đổi payload về unit gốc trước khi gửi).
- `purchase_unit` nullable (null = hiển thị unit gốc); `unit_conversion` default 1.
- Quy đổi payload: `quantity` = số nhập × conversion; `unit_price` = đơn giá ÷ conversion.
- WAC cost_price tính trên unit gốc (payload đã quy đổi).
- Sau refactor: `grep -r "IngredientFilterBar\|Rows3" resources/js` = 0 kết quả.
- `npm run types:check` + `npm run build` pass sau mỗi task frontend.
- `PromotionTable` + `ReportTable` KHÔNG đụng.
- CategoryTable giữ `expandedIds` (tree) — chỉ bỏ khung xương.
- Sau `db:seed`, flush cache `user_inertia` để nhóm "Kho" hiện ngay.

---

## File Structure

**Tạo mới:**
- `database/migrations/2026_08_10_000001_add_purchase_unit_to_ingredients.php`
- `resources/js/components/DataTable.tsx`
- `resources/js/pages/manager/inventory/vouchers/StockVoucherDetail.tsx`
- Tests: `tests/Feature/IngredientUnitConversionTest.php`

**Sửa:**
- `database/seeders/AuthorizationSeeder.php`
- `app/Models/Ingredient.php`
- `app/Http/Controllers/Manager/IngredientController.php`
- `app/Http/Controllers/Manager/StockVoucherController.php`
- `resources/js/pages/manager/inventory/ingredients/components/IngredientFormDrawer.tsx`
- `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx`
- `resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx`
- `resources/js/pages/manager/products/components/ProductTable.tsx`
- `resources/js/pages/manager/categories/components/CategoryTable.tsx`
- `resources/js/pages/manager/inventory/recipes/components/RecipeTable.tsx`
- `resources/js/pages/manager/tables/components/TableListTable.tsx`
- `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`

**Xoá:**
- `resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx`

---

## Task 1: Nhóm "Kho" trong navigation + migration đơn vị mua

**Files:**
- Modify: `database/seeders/AuthorizationSeeder.php`
- Create: `database/migrations/2026_08_10_000001_add_purchase_unit_to_ingredients.php`
- Modify: `app/Models/Ingredient.php`
- Modify: `app/Http/Controllers/Manager/IngredientController.php` (store/update validate + index select)
- Test: `tests/Feature/IngredientUnitConversionTest.php` (mới)

**Interfaces:**
- Produces: 3 page group='Kho'; `ingredients.purchase_unit`/`unit_conversion`; `IngredientData` có 2 field mới (Task 2/3 dùng).

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/IngredientUnitConversionTest.php`:

```php
<?php

use App\Models\Ingredient;

test('ingredient co cot purchase_unit va unit_conversion', function () {
    expect(\Illuminate\Support\Facades\Schema::hasColumns('ingredients', ['purchase_unit', 'unit_conversion']))->toBeTrue();
});

test('store ingredient luu purchase_unit va unit_conversion', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->post('/manager/inventory/ingredients', [
        'name' => 'Cà phê hạt '.uniqid(),
        'unit' => 'g',
        'purchase_unit' => 'kg',
        'unit_conversion' => 1000,
        'stock_quantity' => 0,
        'min_stock_alert' => 50,
        'cost_price' => 0,
    ])->assertRedirect();

    $ing = Ingredient::latest()->first();
    expect($ing->purchase_unit)->toBe('kg');
    expect((float) $ing->unit_conversion)->toBe(1000.0);
});

test('update ingredient cap nhat purchase_unit va unit_conversion', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/ingredients/'.$ing->id, [
        'name' => $ing->name,
        'unit' => 'g',
        'purchase_unit' => 'l',
        'unit_conversion' => 1000,
        'stock_quantity' => 0,
        'min_stock_alert' => 50,
        'cost_price' => 0,
    ])->assertRedirect();

    expect($ing->fresh()->purchase_unit)->toBe('l');
    expect((float) $ing->fresh()->unit_conversion)->toBe(1000.0);
});
```

**Lưu ý:** route store/update = `POST /manager/inventory/ingredients` / `POST /manager/inventory/ingredients/{id}` (routes/web.php:122,124). `posAdmin()` bypass permission.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\IngredientUnitConversionTest.php`
Expected: FAIL — chưa có column + controller chưa nhận field.

- [ ] **Step 3: Tạo migration**

Tạo `database/migrations/2026_08_10_000001_add_purchase_unit_to_ingredients.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->string('purchase_unit', 20)->nullable()->after('unit');
            $table->decimal('unit_conversion', 12, 4)->default(1)->after('purchase_unit');
        });
    }

    public function down(): void
    {
        Schema::table('ingredients', function (Blueprint $table) {
            $table->dropColumn(['purchase_unit', 'unit_conversion']);
        });
    }
};
```

- [ ] **Step 4: Sửa model Ingredient**

`app/Models/Ingredient.php` — thêm vào `$fillable`:
```php
        'purchase_unit',
        'unit_conversion',
```
và casts:
```php
        'unit_conversion' => 'float',
```

- [ ] **Step 5: Sửa IngredientController store/update/index**

`app/Http/Controllers/Manager/IngredientController.php`:
- `store` validate thêm:
```php
            'purchase_unit' => 'nullable|string|max:20',
            'unit_conversion' => 'nullable|numeric|gt:0',
```
- `update` validate thêm (tương tự). Trong `$validated` set default: `$validated['unit_conversion'] = $validated['unit_conversion'] ?? 1;`
- `index` select: hiện `Ingredient::query()->...->get()` trả toàn bộ cột — thêm 2 cột tự động có. KHÔNG cần sửa select (query không dùng select hẹp). Xác nhận index dùng `->get()` toàn cột (line 38) — OK.

- [ ] **Step 6: Sửa AuthorizationSeeder — group 'Kho'**

`database/seeders/AuthorizationSeeder.php` — 3 page record đổi `'group_name' => 'Quản lý'` → `'Kho'`:
- Nguyên liệu (`:73-75`, route `/manager/inventory/ingredients`)
- Định lượng món (`:79-81`, route `/manager/inventory/recipes`)
- Phiếu kho (`:85-87`, route `/manager/inventory/vouchers`)

- [ ] **Step 7: Chạy test pass + db:seed + verify nav**

Run: `php artisan test tests\Feature\IngredientUnitConversionTest.php` — PASS.
Run: `php artisan migrate:fresh; php artisan db:seed` — OK.
Run: `php artisan tinker --execute="foreach (App\Models\Page::whereIn('route_path', ['/manager/inventory/ingredients','/manager/inventory/recipes','/manager/inventory/vouchers'])->get() as \$p) { echo \$p->route_path.' => '.\$p->group_name.PHP_EOL; }"` — 3 dòng `=> Kho`.

**Flush cache user_inertia:** `php artisan cache:clear` hoặc tinker `Illuminate\Support\Facades\Cache::tags(['user_inertia'])->flush();`

- [ ] **Step 8: Full suite + commit**

Run: `php artisan test` — PASS (285+3).
Run: `vendor/bin/pint app/Models/Ingredient.php app/Http/Controllers/Manager/IngredientController.php database/seeders/AuthorizationSeeder.php`

```bash
git add database/migrations/2026_08_10_000001_add_purchase_unit_to_ingredients.php app/Models/Ingredient.php app/Http/Controllers/Manager/IngredientController.php database/seeders/AuthorizationSeeder.php tests/Feature/IngredientUnitConversionTest.php
git commit -m "feat: nhom Kho (3 page) + ingredients purchase_unit/unit_conversion"
```

---

## Task 2: DataTable component chung + refactor 5 bảng + xoá dead code

**Files:**
- Create: `resources/js/components/DataTable.tsx`
- Modify: `resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx`
- Modify: `resources/js/pages/manager/products/components/ProductTable.tsx`
- Modify: `resources/js/pages/manager/categories/components/CategoryTable.tsx`
- Modify: `resources/js/pages/manager/inventory/recipes/components/RecipeTable.tsx`
- Modify: `resources/js/pages/manager/tables/components/TableListTable.tsx`
- Delete: `resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx`

**Interfaces:**
- Produces: `DataTable<T>` generic component (signature bên dưới). Task 3 (StockVouchersManager) dùng.
- Consumes: không phụ thuộc task trước.

- [ ] **Step 1: Tạo DataTable.tsx**

Tạo `resources/js/components/DataTable.tsx` (code đầy đủ):

```tsx
import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Rows3 } from 'lucide-react';

export interface DataTableColumn<T> {
    key: string;
    header: React.ReactNode;
    sortable?: boolean;
    render: (row: T) => React.ReactNode;
    className?: string;
    headerClassName?: string;
    compactClassName?: string;
    hideWhenCompact?: boolean;
    align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    onRowClick?: (row: T) => void;
    emptyMessage?: string;
    defaultSortKey?: string;
    defaultSortDirection?: 'asc' | 'desc';
    defaultPageSize?: number;
    getSortValue?: (row: T, key: string) => string | number;
    showCompactToggle?: boolean;
    showPageSize?: boolean;
    rowClassName?: (row: T) => string;
}

export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    onRowClick,
    emptyMessage = 'Không có dữ liệu',
    defaultSortKey,
    defaultSortDirection = 'asc',
    defaultPageSize = 20,
    getSortValue,
    showCompactToggle = true,
    showPageSize = true,
    rowClassName,
}: DataTableProps<T>) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(defaultPageSize);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<string | undefined>(defaultSortKey);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

    const alignClass = (align?: 'left' | 'center' | 'right') => {
        if (align === 'center') return 'text-center';
        if (align === 'right') return 'text-right';
        return 'text-left';
    };

    const sortedRows = useMemo(() => {
        if (!sortField || !getSortValue) return rows;
        const sorted = [...rows];
        sorted.sort((a, b) => {
            const valA = getSortValue(a, sortField);
            const valB = getSortValue(b, sortField);
            if (typeof valA === 'string') {
                const cmp = (valA as string).toLowerCase().localeCompare((valB as string).toLowerCase());
                return sortDirection === 'asc' ? cmp : -cmp;
            }
            const numA = Number(valA);
            const numB = Number(valB);
            if (numA < numB) return sortDirection === 'asc' ? -1 : 1;
            if (numA > numB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [rows, sortField, sortDirection, getSortValue]);

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedRows = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, safeCurrentPage, pageSize]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const renderSortIcon = (field: string) => {
        if (sortField !== field) {
            return <ChevronUp className="w-3.5 h-3.5 ml-1 text-zinc-300 dark:text-zinc-600 opacity-50 inline" />;
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        ) : (
            <ChevronDown className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-xs">
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left text-sm relative">
                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    className={`px-4 ${isCompact ? 'py-2 text-xs' : 'py-3.5'} ${alignClass(col.align)} ${col.headerClassName ?? ''} ${col.sortable ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800' : ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                >
                                    <div className={`flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                                        <span>{col.header}</span>
                                        {col.sortable && renderSortIcon(col.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedRows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-12 px-6">
                                    <div className="flex items-start space-x-4 max-w-md">
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{emptyMessage}</h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Không có dữ liệu phù hợp với điều kiện hiện tại.</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedRows.map((row, index) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`px-4 ${isCompact ? (col.compactClassName ?? 'py-1.5') : 'py-3'} ${alignClass(col.align)} ${col.className ?? ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                        >
                                            {col.render(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                    {showCompactToggle && (
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                                isCompact
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                    : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                            title="Bật/Tắt chế độ hiển thị thu gọn"
                        >
                            <Rows3 className="w-4 h-4 stroke-[1.5]" />
                            <span>{isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}</span>
                        </button>
                    )}
                    {showPageSize && (
                        <div className="flex items-center space-x-1 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                            <span className="text-zinc-500 mr-1">Hiển thị:</span>
                            {[20, 50, 100].map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => { setPageSize(size); setCurrentPage(1); }}
                                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                                        pageSize === size
                                            ? 'bg-blue-600 text-white'
                                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    {size}
                                </button>
                            ))}
                            <span className="text-zinc-400 ml-1">dòng/trang</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        |&#9664;
                    </button>
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9664;
                    </button>
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400">
                        <span>Trang</span>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={safeCurrentPage}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) setCurrentPage(Math.min(Math.max(1, val), totalPages));
                            }}
                            className="w-12 text-center py-1 border rounded-md bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                        <span>/ {totalPages}</span>
                    </div>
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;
                    </button>
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;|
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Refactor IngredientTable**

`IngredientTable.tsx` — thay toàn bộ khung xương bằng DataTable. Đọc file hiện tại (317 dòng), giữ `IngredientData` interface + `IngredientTableProps`, đổi body:

```tsx
import React from 'react';
import { Package, Plus, Edit3, Trash2 } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../../components/DataTable';

export interface IngredientData {
    id: number;
    code?: string;
    name: string;
    unit: string;
    stock_quantity: number;
    min_stock_alert: number;
    cost_price: number;
    purchase_unit?: string | null;
    unit_conversion?: number;
}

interface IngredientTableProps {
    ingredients: IngredientData[];
    onEdit: (ingredient: IngredientData) => void;
    onDelete: (ingredient: IngredientData) => void;
}

export default function IngredientTable({ ingredients, onEdit, onDelete }: IngredientTableProps) {
    const formatCurrency = (val: number) => Number(val).toLocaleString('vi-VN') + ' đ';

    const columns: DataTableColumn<IngredientData>[] = [
        {
            key: 'code',
            header: 'Mã NVL',
            sortable: true,
            className: 'w-32 font-mono text-xs text-sky-600 dark:text-sky-400 font-medium tabular-nums',
            render: (item) => item.code || `NVL${String(item.id).padStart(5, '0')}`,
        },
        {
            key: 'name',
            header: 'Tên nguyên liệu',
            sortable: true,
            render: (item) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>,
        },
        {
            key: 'unit',
            header: 'Đơn vị',
            align: 'center',
            className: 'w-24',
            render: (item) => (
                <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
                    {item.unit}
                </span>
            ),
        },
        {
            key: 'stock_quantity',
            header: 'Tồn kho',
            sortable: true,
            align: 'right',
            render: (item) => (
                <span className={`font-bold tabular-nums ${item.stock_quantity <= item.min_stock_alert ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {item.stock_quantity.toLocaleString('vi-VN')} {item.unit}
                </span>
            ),
        },
        {
            key: 'cost_price',
            header: 'Giá vốn đơn vị',
            sortable: true,
            align: 'right',
            render: (item) => <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(item.cost_price)}/{item.unit}</span>,
        },
        {
            key: 'status',
            header: 'Trạng thái',
            align: 'center',
            className: 'w-32',
            render: (item) => (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.stock_quantity <= item.min_stock_alert
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                    {item.stock_quantity <= item.min_stock_alert ? 'Sắp hết hàng' : 'An toàn'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-40',
            render: (item) => (
                <div className="flex items-center justify-center space-x-1">
                    <button type="button" onClick={() => onEdit(item)} className="p-1.5 text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Chỉnh sửa">
                        <Edit3 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                    <button type="button" onClick={() => onDelete(item)} className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Xóa">
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={ingredients}
            rowKey={(item) => item.id}
            defaultSortKey="name"
            getSortValue={(item, key) => {
                if (key === 'code') return item.code ?? `NVL${item.id}`;
                if (key === 'name') return item.name;
                if (key === 'stock_quantity') return item.stock_quantity;
                if (key === 'cost_price') return item.cost_price;
                return item[key as keyof IngredientData] ?? '';
            }}
            emptyMessage="Không tìm thấy nguyên liệu"
        />
    );
}
```

**Lưu ý:** `Package`/`Plus` import bỏ nếu không dùng (giữ chỉ các icon cần). `IngredientsManager.tsx` import `IngredientData` từ `./components/IngredientTable` — interface vẫn export → không đổi.

- [ ] **Step 3: Refactor ProductTable**

`ProductTable.tsx` (360 dòng) — đọc file hiện tại, giữ `MenuItemData` interface + `ProductTableProps`, refactor sang DataTable (mẫu Step 2). Cột:

| key | Header | sortable | Ghi chú render |
|---|---|---|---|
| `image` | Ảnh | no | `hideWhenCompact`, img hoặc placeholder |
| `code` | Mã SP | yes | font-mono |
| `name` | Tên món | yes | font-medium |
| `category` | Danh mục | yes | text |
| `price` | Giá bán | yes | align right, formatCurrency |
| `vat_rate` | VAT | yes | align right, `{vat_rate}%` |
| `is_available` | Trạng thái | yes | badge Đang kinh doanh/Ngừng |
| `actions` | Thao tác | no | align center, Edit + Delete |

`getSortValue`: `code`→`item.code ?? ''`, `name`→`item.name`, `category`→`item.category_name ?? ''`, `price`→`item.price`, `vat_rate`→`item.vat_rate`, `is_available`→`item.is_available ? 1 : 0`. `defaultSortKey="name"`. Bỏ import không dùng (ChevronUp/Down/Rows3, Package nếu thay icon).

- [ ] **Step 4: Refactor CategoryTable**

`CategoryTable.tsx` (404 dòng) — ĐỌC KỸ file trước (có tree expand). Giữ:
- `expandedIds` state + expand/collapse handler + nút expand (ChevronRight/Folder).
- Render row cha + row con (chỉ show con khi expanded).

Refactor sang DataTable: chỉ bỏ khung xương (isCompact/pageSize/sort/pagination/footer). Vì tree phức tạp, có thể giữ `rows` = danh sách đã flatten (cha + con expanded) và truyền thẳng; `getSortValue` sort theo tên cha (hoặc bỏ sortable nếu phức tạp — ưu tiên không đổi behavior). Cột: `display_order` (sortable), `name`, `description`, `product_count` (nếu có), `actions`.

**Nếu refactor tree sang DataTable quá rủi ro** (mất expand logic): giữ nguyên CategoryTable không refactor, chỉ ghi chú trong report. Đây là bảng duy nhất có tree — chấp nhận giữ nguyên nếu cần.

- [ ] **Step 5: Refactor RecipeTable**

`RecipeTable.tsx` (357 dòng) — đọc file, giữ props, refactor sang DataTable. Cột:

| key | Header | sortable | Ghi chú |
|---|---|---|---|
| `image` | Ảnh | no | `hideWhenCompact` |
| `name` | Món | yes | font-medium |
| `category` | Danh mục | yes | text |
| `ingredient_count` | Số nguyên liệu | yes | align center, badge count |
| `actions` | Thao tác | no | align center, Edit |

`getSortValue`: `name`→name, `category`→category_name, `ingredient_count`→count. `defaultSortKey="name"`.

- [ ] **Step 6: Refactor TableListTable**

`TableListTable.tsx` (326 dòng) — đọc file, giữ props, refactor sang DataTable. Cột:

| key | Header | sortable | Ghi chú |
|---|---|---|---|
| `table_number` | Bàn | yes | font-medium |
| `area` | Khu vực | yes | text |
| `capacity` | Sức chứa | yes | align center |
| `status` | Trạng thái | yes | badge (available/occupied/reserved/maintenance) |
| `actions` | Thao tác | no | align center, Edit + Delete |

`getSortValue`: `table_number`→number, `area`→area, `capacity`→capacity, `status`→status. `defaultSortKey="table_number"`.

- [ ] **Step 7: Xoá IngredientFilterBar + verify dead code**

Delete `resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx`.
Run: `grep -rn "IngredientFilterBar\|Rows3" resources/js` — kiểm tra KHÔNG còn `IngredientFilterBar`; `Rows3` chỉ còn trong `DataTable.tsx`.

- [ ] **Step 8: Types + build**

Run: `npm run types:check` — PASS.
Run: `npm run build` — PASS.

- [ ] **Step 9: Commit**

```bash
git add resources/js/components/DataTable.tsx resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx resources/js/pages/manager/products/components/ProductTable.tsx resources/js/pages/manager/categories/components/CategoryTable.tsx resources/js/pages/manager/inventory/recipes/components/RecipeTable.tsx resources/js/pages/manager/tables/components/TableListTable.tsx resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx
git commit -m "feat: DataTable chung + refactor 5 bang quan ly + xoa IngredientFilterBar dead code"
```

---

## Task 3: StockImportModal — đơn vị mua + quy đổi + hiển thị

**Files:**
- Modify: `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx`
- Modify: `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx` (nếu cần IngredientData field mới)
- Modify: `app/Http/Controllers/Manager/StockVoucherController.php` (index/show select thêm 2 cột)

**Interfaces:**
- Consumes: `IngredientData` có `purchase_unit`/`unit_conversion` (Task 1); DataTable (Task 2).
- Produces: modal nhập hiển thị `SL ({displayUnit})` + `đ/{displayUnit}` + payload quy đổi về unit gốc.

- [ ] **Step 1: Sửa controller select**

`StockVoucherController.php` — `index` (`:52`) và `show` (`:143`) đổi:
```php
'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'purchase_unit', 'unit_conversion', 'stock_quantity', 'min_stock_alert', 'cost_price']),
```

- [ ] **Step 2: Sửa StockImportModal**

`StockImportModal.tsx` — đọc file hiện tại (158 dòng), đổi:

a) `IngredientData` import từ `./IngredientTable` (đã có `purchase_unit`/`unit_conversion` từ Task 2).

b) Thêm helper trong component:
```tsx
const displayUnit = (ingId: string): string => {
    const ing = ingredients.find((i) => String(i.id) === ingId);
    return ing?.purchase_unit || ing?.unit || '';
};
```

c) Ô SL placeholder:
```tsx
placeholder={displayUnit(line.ingredient_id) ? `SL (${displayUnit(line.ingredient_id)})` : 'SL'}
```

d) Ô Đơn giá — thêm suffix "đ" (wrap trong div relative):
```tsx
<div className="relative">
    <input
        type="number"
        step="any"
        value={line.unit_price}
        onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
        placeholder={displayUnit(line.ingredient_id) ? `đ/${displayUnit(line.ingredient_id)}` : 'đ/đơn vị'}
        className="w-32 px-3 py-2 pr-7 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
    />
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">đ</span>
</div>
```

e) `handleSubmit` — quy đổi payload:
```tsx
const toBaseQuantity = (line: ImportLine): number => {
    const ing = ingredients.find((i) => String(i.id) === line.ingredient_id);
    const conversion = ing?.unit_conversion ?? 1;
    return Number(line.quantity) * conversion;
};
const toBasePrice = (line: ImportLine): number => {
    const ing = ingredients.find((i) => String(i.id) === line.ingredient_id);
    const conversion = ing?.unit_conversion ?? 1;
    return Number(line.unit_price || 0) / conversion;
};

// trong router.post payload:
items: validLines.map((l) => ({
    ingredient_id: Number(l.ingredient_id),
    quantity: toBaseQuantity(l),
    unit_price: toBasePrice(l),
})),
```

f) Preview — hiển thị theo đơn vị mua:
```tsx
{totalCost > 0 && validLines[0] && (
    <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {validLines.length} nguyên liệu · Tổng giá trị phiếu:{' '}
        <strong className="text-emerald-600">{totalCost.toLocaleString('vi-VN')} đ</strong>
    </p>
)}
```

- [ ] **Step 3: Types + build**

Run: `npm run types:check` — PASS.
Run: `npm run build` — PASS.

- [ ] **Step 4: Test backend regression**

Run: `php artisan test tests\Feature\StockVoucherImportTest.php` — PASS (payload giờ quy đổi nhưng test gửi conversion=1 mặc định → không đổi kết quả).

**Lưu ý:** test hiện có gửi `unit_price`/`quantity` trực tiếp (không qua frontend) → backend vẫn nhận unit gốc → không ảnh hưởng.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx app/Http/Controllers/Manager/StockVoucherController.php
git commit -m "feat: StockImportModal hien thi don vi mua + quy doi payload ve unit goc"
```

---

## Task 4: IngredientFormDrawer — thêm field đơn vị mua

**Files:**
- Modify: `resources/js/pages/manager/inventory/ingredients/components/IngredientFormDrawer.tsx`

**Interfaces:**
- Consumes: `IngredientData` có `purchase_unit`/`unit_conversion` (Task 1).
- Produces: form tạo/sửa nguyên liệu có field "Đơn vị mua" + "Hệ số quy đổi".

- [ ] **Step 1: Thêm state + populate**

`IngredientFormDrawer.tsx` — thêm:
```tsx
const [purchaseUnit, setPurchaseUnit] = useState('');
const [unitConversion, setUnitConversion] = useState<string>('1');
```

Trong `useEffect` khi `ingredientToEdit`:
```tsx
setPurchaseUnit(ingredientToEdit.purchase_unit || '');
setUnitConversion(String(ingredientToEdit.unit_conversion ?? 1));
```
khi reset (else branch):
```tsx
setPurchaseUnit('');
setUnitConversion('1');
```

Payload:
```tsx
const payload = {
    name,
    unit,
    purchase_unit: purchaseUnit || null,
    unit_conversion: Number(unitConversion) || 1,
    stock_quantity: Number(stockQuantity) || 0,
    min_stock_alert: Number(minStockAlert) || 0,
    cost_price: Number(costPrice) || 0,
};
```

- [ ] **Step 2: Thêm UI field**

Trong form, sau field "Đơn vị tính" (`:127`), thêm:
```tsx
<div className="grid grid-cols-2 gap-4">
    <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Đơn vị mua
        </label>
        <input
            type="text"
            value={purchaseUnit}
            onChange={(e) => setPurchaseUnit(e.target.value)}
            placeholder="kg, l, gói, hộp..."
            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[11px] text-zinc-400 mt-1">Để trống = dùng đơn vị tính</p>
    </div>
    <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Hệ số quy đổi
        </label>
        <input
            type="number"
            step="any"
            value={unitConversion}
            onChange={(e) => setUnitConversion(e.target.value)}
            placeholder="1"
            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[11px] text-zinc-400 mt-1">1 đơn vị mua = N đơn vị tính</p>
    </div>
</div>
```

- [ ] **Step 3: Types + build**

Run: `npm run types:check` + `npm run build` — PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/inventory/ingredients/components/IngredientFormDrawer.tsx
git commit -m "feat: IngredientFormDrawer them don vi mua + he so quy doi"
```

---

## Task 5: Trang chi tiết phiếu riêng (StockVoucherDetail)

**Files:**
- Create: `resources/js/pages/manager/inventory/vouchers/StockVoucherDetail.tsx`
- Modify: `app/Http/Controllers/Manager/StockVoucherController.php` (show render trang riêng, index bỏ detail)
- Modify: `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx` (DataTable + bỏ detail)

**Interfaces:**
- Consumes: DataTable (Task 2), `StockVoucherController::show` props.
- Produces: trang `StockVoucherDetail` riêng; list dùng DataTable + điều hướng.

- [ ] **Step 1: Sửa controller show/index**

`StockVoucherController.php`:
- `index` — bỏ `detail` (không có — xác nhận). Giữ `vouchers`/`filters`/`ingredients`.
- `show` — đổi render sang trang riêng:
```php
    public function show(int $id): Response
    {
        $voucher = StockVoucher::with(['items.ingredient', 'employee', 'creator'])
            ->findOrFail($id);

        $items = $voucher->items->map(fn ($item) => [
            'ingredient_id' => $item->ingredient_id,
            'code' => $item->ingredient?->code,
            'name' => $item->ingredient->name ?? 'Nguyên liệu',
            'unit' => $item->ingredient->unit ?? '',
            'quantity' => (float) $item->quantity,
            'unit_price' => $item->unit_price,
            'total' => (float) $item->quantity * (float) ($item->unit_price ?? 0),
        ]);

        $total = $voucher->type === 'import'
            ? $items->sum('total')
            : null;

        return Inertia::render('manager/inventory/vouchers/StockVoucherDetail', [
            'voucher' => [
                'id' => $voucher->id,
                'voucher_code' => $voucher->voucher_code,
                'type' => $voucher->type,
                'transacted_at' => $voucher->transacted_at?->format('d/m/Y H:i'),
                'note' => $voucher->note,
                'employee_name' => $voucher->employee?->full_name,
            ],
            'items' => $items,
            'total' => $total,
        ]);
    }
```

- [ ] **Step 2: Tạo StockVoucherDetail.tsx**

Tạo `resources/js/pages/manager/inventory/vouchers/StockVoucherDetail.tsx` (pattern OrderDetail — xem `OrderDetail.tsx` làm mẫu):

```tsx
import React from 'react';
import { Head, router } from '@inertiajs/react';
import { ArrowLeft, Box, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';

interface VoucherItemData {
    ingredient_id: number;
    code: string | null;
    name: string;
    unit: string;
    quantity: number;
    unit_price: number | null;
    total: number;
}

interface VoucherDetailProps {
    voucher: {
        id: number;
        voucher_code: string;
        type: 'import' | 'export';
        transacted_at: string;
        note: string | null;
        employee_name: string | null;
    };
    items: VoucherItemData[];
    total: number | null;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

export default function StockVoucherDetail({ voucher, items }: VoucherDetailProps) {
    const isImport = voucher.type === 'import';

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={`Phiếu ${voucher.voucher_code}`} />
            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden">
                <div className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                    <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => router.get('/manager/inventory/vouchers')}
                                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center space-x-2.5">
                                    <Box className="w-5 h-5 text-sky-500" />
                                    <h1 className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {voucher.voucher_code}
                                    </h1>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                                        isImport
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    }`}>
                                        {isImport ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                                        {isImport ? 'Phiếu nhập' : 'Phiếu xuất'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="mx-6 mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 text-sm">
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Mã phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{voucher.voucher_code}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Loại phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{isImport ? 'Phiếu nhập' : 'Phiếu xuất'}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Thời điểm</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{voucher.transacted_at}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Người tạo</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{voucher.employee_name || '—'}</span>
                            </div>
                        </div>

                        {voucher.note && (
                            <div className="mx-6 mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                                <span className="font-medium text-zinc-600 dark:text-zinc-300">Ghi chú:</span> {voucher.note}
                            </div>
                        )}

                        <div className="flex-1 overflow-auto min-h-0 px-6 pt-4">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                                Nguyên liệu ({items.length})
                            </h2>
                            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90">
                                        <tr className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                            <th className="px-3 py-2">Mã NVL</th>
                                            <th className="px-3 py-2">Nguyên liệu</th>
                                            <th className="px-3 py-2 text-right">Số lượng</th>
                                            <th className="px-3 py-2 text-right">Đơn giá</th>
                                            <th className="px-3 py-2 text-right">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                        {items.map((it) => (
                                            <tr key={it.ingredient_id}>
                                                <td className="px-3 py-2 font-mono text-xs text-sky-600 dark:text-sky-400">{it.code || `NVL${String(it.ingredient_id).padStart(5, '0')}`}</td>
                                                <td className="px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{it.name}</td>
                                                <td className={`px-3 py-2 text-right text-sm font-bold tabular-nums ${it.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {it.quantity > 0 ? '+' : ''}{it.quantity.toLocaleString('vi-VN')} {it.unit}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                                                    {it.unit_price != null ? formatCurrency(it.unit_price) : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                                                    {isImport ? formatCurrency(it.total) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
```

**Lưu ý:** nếu voucher export có unit_price null → "—" cho cả đơn giá + thành tiền (đúng spec).

- [ ] **Step 3: Sửa StockVouchersManager (list)**

`StockVouchersManager.tsx` — đọc file hiện tại (195 dòng):
- Xoá `detail` prop + `VoucherDetailItem`/`VoucherDetail` interfaces + block detail render (`:105-147`) + `{/* Detail (pivot bảng ngang) */}`.
- Đổi list bảng (`:149-184`) sang DataTable:
```tsx
import DataTable, { DataTableColumn } from '../../../../components/DataTable';

const columns: DataTableColumn<VoucherData>[] = [
    { key: 'voucher_code', header: 'Mã phiếu', sortable: true, className: 'font-mono text-xs font-medium text-sky-600 dark:text-sky-400', render: (v) => v.voucher_code },
    {
        key: 'type',
        header: 'Loại',
        sortable: true,
        render: (v) => (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                v.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
                {v.type === 'import' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                {v.type === 'import' ? 'Nhập' : 'Xuất'}
            </span>
        ),
    },
    { key: 'transacted_at', header: 'Thời điểm', sortable: true, render: (v) => <span className="text-xs">{v.transacted_at}</span> },
    { key: 'note', header: 'Ghi chú', render: (v) => <span className="text-xs text-zinc-500">{v.note || '—'}</span> },
    { key: 'employee_name', header: 'Người tạo', render: (v) => <span className="text-xs">{v.employee_name || '—'}</span> },
];
```
Render:
```tsx
<DataTable
    columns={columns}
    rows={vouchers}
    rowKey={(v) => v.id}
    defaultSortKey="transacted_at"
    defaultSortDirection="desc"
    getSortValue={(v, key) => (v as any)[key] ?? ''}
    onRowClick={(v) => router.get(`/manager/inventory/vouchers/${v.id}`)}
    emptyMessage="Chưa có phiếu nào"
/>
```

- [ ] **Step 4: Types + build + backend test**

Run: `npm run types:check` + `npm run build` — PASS.
Run: `php artisan test tests\Feature\StockVoucherImportTest.php` — PASS (show đổi response nhưng test không assert show detail).

**Lưu ý:** test `StockVoucherImportTest` test 3 chỉ assert `get('/manager/inventory/vouchers')->assertOk()` (index) — không assert show. Nếu có test assert show detail cũ, cập nhật.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Manager/StockVoucherController.php resources/js/pages/manager/inventory/vouchers/StockVoucherDetail.tsx resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx
git commit -m "feat: trang chi tiet phieu rieng (StockVoucherDetail) + list dung DataTable"
```

---

## Task 6: Final verification

**Files:** không code — verify.

- [ ] **Step 1: Full suite**

Run: `php artisan test` — PASS (285 + 3 mới).

- [ ] **Step 2: Pint**

Run: `vendor/bin/pint --dirty --test` — sạch.

- [ ] **Step 3: Frontend**

Run: `npm run types:check` + `npm run build` — PASS.

- [ ] **Step 4: Dead code verify**

Run: `grep -rn "IngredientFilterBar\|VoucherDetailItem\|detail" resources/js/pages/manager/inventory` — kiểm tra không còn tham chiếu cũ (trừ `detail` nếu còn dùng hợp lệ).

- [ ] **Step 5: migrate:fresh + db:seed MySQL + smoke**

Run: `php artisan migrate:fresh; php artisan db:seed`
Run: `php artisan cache:clear` (flush user_inertia)
Smoke:
- Sidebar có nhóm "Kho" (3 trang).
- Mở `/manager/inventory/ingredients` — bảng render, nút Nhập kho mở modal hiển thị `SL (kg)`/`đ/kg`.
- Tạo nguyên liệu có purchase_unit='kg', conversion=1000 → nhập 10 kg × 200.000đ → stock tăng 10000g, cost_price đúng.
- Mở `/manager/inventory/vouchers` — list DataTable; bấm phiếu → trang chi tiết riêng.
- Các trang Products/Categories/Recipes/Tables — bảng render bình thường (DataTable).

- [ ] **Step 6: Fix phát sinh + commit nếu cần**

Nếu smoke phát hiện bug → fix + commit riêng.

---

## Final verification checklist

- [ ] `php artisan test` — pass
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `npm run types:check` + `npm run build` — pass
- [ ] Sidebar nhóm "Kho"; modal hiển thị đơn vị mua; quy đổi payload đúng; trang chi tiết phiếu riêng
- [ ] `grep -r "IngredientFilterBar" resources/js` = 0
- [ ] `git status` — tree sạch
