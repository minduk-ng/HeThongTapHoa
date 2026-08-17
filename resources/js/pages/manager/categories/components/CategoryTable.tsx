import React, { useState, useMemo } from 'react';
import { FolderTree, Folder, ChevronRight, ChevronUp, ChevronDown, Edit3, Trash2, Rows3 } from 'lucide-react';

export interface CategoryItem {
    id: number;
    category_id: number | null;
    name: string;
    price: number | string;
    is_available: boolean;
}

export interface CategoryData {
    id: number;
    name: string;
    description: string | null;
    display_order: number;
    sort_order?: number;
    items_count?: number;
    items_sum_price?: number | string | null;
    items?: CategoryItem[];
}

interface CategoryTableProps {
    categories: CategoryData[];
    onEdit: (category: CategoryData) => void;
    onDelete: (category: CategoryData) => void;
}

type SortField = 'id' | 'name' | 'display_order' | 'items_count' | 'items_sum_price';
type SortDirection = 'asc' | 'desc';

export default function CategoryTable({ categories, onEdit, onDelete }: CategoryTableProps) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('display_order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

    const toggleExpand = (id: number) => {
        setExpandedIds((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedCategories = useMemo(() => {
        const sorted = [...categories];
        sorted.sort((a, b) => {
            let valA: any = a[sortField as keyof CategoryData];
            let valB: any = b[sortField as keyof CategoryData];

            if (sortField === 'items_count') {
                valA = a.items_count ?? a.items?.length ?? 0;
                valB = b.items_count ?? b.items?.length ?? 0;
            } else if (sortField === 'items_sum_price') {
                valA = Number(a.items_sum_price || 0);
                valB = Number(b.items_sum_price || 0);
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [categories, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedCategories.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedCategories = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedCategories.slice(start, start + pageSize);
    }, [sortedCategories, safeCurrentPage, pageSize]);

    const formatCurrency = (val: number | string | null | undefined) => {
        if (val === null || val === undefined) return '0 đ';
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const renderSortIcon = (field: SortField) => {
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
                            <th
                                onClick={() => handleSort('display_order')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5 w-16' : 'py-4 w-20'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>STT</span>
                                    {renderSortIcon('display_order')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('name')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Tên danh mục</span>
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('items_count')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Tổng sản phẩm</span>
                                    {renderSortIcon('items_count')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('items_sum_price')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Tổng đơn giá</span>
                                    {renderSortIcon('items_sum_price')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2.5 w-24' : 'py-4 w-28'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedCategories.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-12 px-6">
                                    <div className="flex items-start space-x-4 max-w-md mx-auto">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center shrink-0">
                                            <FolderTree className="w-5 h-5 stroke-[1.5]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                Không tìm thấy danh mục
                                            </h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                                                Chưa có danh mục sản phẩm nào phù hợp với bộ lọc tìm kiếm. Thử thay đổi từ khóa tìm kiếm.
                                            </p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedCategories.map((category, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                const isExpanded = !!expandedIds[category.id];
                                const hasChildren = category.items && category.items.length > 0;

                                return (
                                    <React.Fragment key={category.id}>
                                        {/* Category Parent Row */}
                                        <tr
                                            className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                                                isExpanded ? 'bg-sky-50/40 dark:bg-sky-950/30' : ''
                                            }`}
                                            onClick={() => toggleExpand(category.id)}
                                        >
                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <div className="flex items-center justify-center space-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(category.id);
                                                        }}
                                                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                                    >
                                                        <ChevronRight
                                                            className={`w-4 h-4 transform transition-transform duration-200 stroke-[1.5] ${
                                                                isExpanded ? 'rotate-90 text-sky-600 dark:text-sky-400' : ''
                                                            }`}
                                                        />
                                                    </button>
                                                    <span className="text-xs text-zinc-500 tabular-nums">{realIndex}</span>
                                                </div>
                                            </td>

                                            <td className={`px-4 text-left font-semibold text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <div className="flex items-center space-x-2">
                                                    <Folder className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 stroke-[1.5]" />
                                                    <span>{category.name}</span>
                                                    {category.description && (
                                                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-2">
                                                            ({category.description})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 tabular-nums">
                                                    {category.items_count ?? category.items?.length ?? 0} sản phẩm
                                                </span>
                                            </td>

                                            <td className={`px-4 text-center font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                {formatCurrency(category.items_sum_price)}
                                            </td>

                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`} onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center space-x-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                                        title="Sửa danh mục"
                                                        aria-label="Sửa danh mục"
                                                    >
                                                        <Edit3 className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDelete(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                                        title="Xóa danh mục"
                                                        aria-label="Xóa danh mục"
                                                    >
                                                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Child Products Table (Expandable Accordion Row) */}
                                        {isExpanded && (
                                            <tr className="bg-zinc-50/90 dark:bg-zinc-950/80 border-t border-b border-zinc-200 dark:border-zinc-800">
                                                <td colSpan={5} className="py-3 px-6 pl-12">
                                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-xs">
                                                        <div className="bg-zinc-100/90 dark:bg-zinc-800/90 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                                                            <span>Danh sách sản phẩm thuộc: {category.name}</span>
                                                            <span>Tổng: {category.items?.length ?? 0} món</span>
                                                        </div>

                                                        {!hasChildren ? (
                                                            <div className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                                                                Danh mục này chưa có sản phẩm nào.
                                                            </div>
                                                        ) : (
                                                            <table className="w-full text-left text-xs">
                                                                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-medium">
                                                                    <tr className="text-center">
                                                                        <th className="py-2 px-4 w-28 text-center">Mã SP</th>
                                                                        <th className="py-2 px-4 text-center">Tên sản phẩm</th>
                                                                        <th className="py-2 px-4 text-center">Giá bán</th>
                                                                        <th className="py-2 px-4 text-center">Trạng thái</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
                                                                    {category.items!.map((child) => (
                                                                        <tr
                                                                            key={child.id}
                                                                            className="hover:bg-zinc-100/80 dark:hover:bg-zinc-800/90 transition-colors"
                                                                        >
                                                                            <td className="py-2 px-4 text-center font-mono text-sky-600 dark:text-sky-400 font-medium">
                                                                                SP{String(child.id).padStart(5, '0')}
                                                                            </td>
                                                                            <td className="py-2 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
                                                                                {child.name}
                                                                            </td>
                                                                            <td className="py-2 px-4 text-center font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                                                {formatCurrency(child.price)}
                                                                            </td>
                                                                            <td className="py-2 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                                                                    child.is_available
                                                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                                                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                                                                                }`}>
                                                                                    {child.is_available ? 'Hoạt động' : 'Ngừng bán'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Footer Controls */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
                {/* Left Side: Records Count & Compact Toggle */}
                <div className="flex items-center space-x-3">
                    <span className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                        {sortedCategories.length} danh mục
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsCompact(!isCompact)}
                        className={`rounded p-1 transition-colors ${
                            isCompact
                                ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                        }`}
                        title={isCompact ? 'Chế độ thường' : 'Chế độ compact'}
                    >
                        <Rows3 className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Right Side: Page Size & Pagination Bar */}
                <div className="flex items-center space-x-2">
                    {totalPages > 0 && (
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                            <option value={20}>20 / trang</option>
                            <option value={50}>50 / trang</option>
                            <option value={100}>100 / trang</option>
                        </select>
                    )}
                    <div className="flex items-center space-x-1">
                        <button
                            type="button"
                            disabled={safeCurrentPage <= 1}
                            onClick={() => setCurrentPage(safeCurrentPage - 1)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            Trước
                        </button>
                        <span className="px-2 text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                            {safeCurrentPage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={safeCurrentPage >= totalPages}
                            onClick={() => setCurrentPage(safeCurrentPage + 1)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            Sau
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
