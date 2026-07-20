import React, { useState } from 'react';

export interface ChildItem {
    id: number;
    name: string;
    price: number | string;
    is_available: boolean;
    image?: string | null;
}

export interface CategoryData {
    id: number;
    name: string;
    description: string | null;
    sort_order: number;
    items_count?: number;
    items_sum_price?: number | string | null;
    items?: ChildItem[];
}

interface CategoryTableProps {
    categories: CategoryData[];
    onEdit: (category: CategoryData) => void;
    onDelete: (category: CategoryData) => void;
}

export default function CategoryTable({ categories, onEdit, onDelete }: CategoryTableProps) {
    const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

    const toggleExpand = (id: number) => {
        setExpandedIds((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const formatCurrency = (val?: number | string | null) => {
        if (val === null || val === undefined) return '0 đ';
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="py-4 px-4 w-16 text-center">STT</th>
                            <th className="py-4 px-4">Tên danh mục</th>
                            <th className="py-4 px-4 text-center">Tổng sản phẩm</th>
                            <th className="py-4 px-4 text-right">Tổng đơn giá</th>
                            <th className="py-4 px-4 w-28 text-center">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {categories.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Chưa có danh mục nào phù hợp.
                                </td>
                            </tr>
                        ) : (
                            categories.map((category, index) => {
                                const isExpanded = !!expandedIds[category.id];
                                const hasChildren = category.items && category.items.length > 0;

                                return (
                                    <React.Fragment key={category.id}>
                                        {/* Category Parent Row with increased vertical padding (py-5) */}
                                        <tr
                                            className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                                                isExpanded ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                                            }`}
                                            onClick={() => toggleExpand(category.id)}
                                        >
                                            <td className="py-5 px-4 text-center">
                                                <div className="flex items-center justify-center space-x-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(category.id);
                                                        }}
                                                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 transform transition-transform duration-200 ${
                                                                isExpanded ? 'rotate-90 text-blue-600 dark:text-blue-400' : ''
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </button>
                                                    <span className="text-xs text-zinc-500">{index + 1}</span>
                                                </div>
                                            </td>

                                            <td className="py-5 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                                                <div className="flex items-center space-x-2">
                                                    <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                    </svg>
                                                    <span>{category.name}</span>
                                                    {category.description && (
                                                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-2">
                                                            ({category.description})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="py-5 px-4 text-center">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                                    {category.items_count ?? category.items?.length ?? 0} sản phẩm
                                                </span>
                                            </td>

                                            <td className="py-5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(category.items_sum_price)}
                                            </td>

                                            <td className="py-5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center space-x-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                        title="Sửa danh mục"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDelete(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                        title="Xóa danh mục"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Child Products Table (Expandable Accordion Row) */}
                                        {isExpanded && (
                                            <tr className="bg-zinc-50/90 dark:bg-zinc-950/80 border-t border-b border-zinc-200 dark:border-zinc-800">
                                                <td colSpan={5} className="py-4 px-6 pl-12">
                                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-xs">
                                                        <div className="bg-zinc-100/90 dark:bg-zinc-800/90 px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
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
                                                                    <tr>
                                                                        <th className="py-2.5 px-4 w-28">Mã SP</th>
                                                                        <th className="py-2.5 px-4">Tên sản phẩm</th>
                                                                        <th className="py-2.5 px-4 text-right">Giá bán</th>
                                                                        <th className="py-2.5 px-4 text-center">Trạng thái</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
                                                                    {category.items!.map((child) => (
                                                                        <tr
                                                                            key={child.id}
                                                                            className="hover:bg-zinc-100/80 dark:hover:bg-zinc-800/90 transition-colors"
                                                                        >
                                                                            <td className="py-2.5 px-4 font-mono text-blue-600 dark:text-blue-400 font-medium">
                                                                                SP{String(child.id).padStart(5, '0')}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                                                                                {child.name}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                                                {formatCurrency(child.price)}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-center">
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
        </div>
    );
}
