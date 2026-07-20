import React from 'react';

interface Category {
    id: number;
    name: string;
}

export interface MenuItemData {
    id: number;
    category_id: number | null;
    name: string;
    price: number | string;
    vat_rate: number | string;
    image: string | null;
    description: string | null;
    is_available: boolean;
    category?: Category | null;
}

interface ProductTableProps {
    items: MenuItemData[];
    onEdit: (item: MenuItemData) => void;
    onDelete: (item: MenuItemData) => void;
}

export default function ProductTable({ items, onEdit, onDelete }: ProductTableProps) {
    const formatCurrency = (val: number | string) => {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const formatProductCode = (id: number) => {
        return `SP${String(id).padStart(5, '0')}`;
    };

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="py-3 px-4 w-16 text-center">STT</th>
                            <th className="py-3 px-4 w-20">Ảnh</th>
                            <th className="py-3 px-4 w-28">Mã SP</th>
                            <th className="py-3 px-4">Tên sản phẩm</th>
                            <th className="py-3 px-4">Danh mục</th>
                            <th className="py-3 px-4 text-right">Giá bán</th>
                            <th className="py-3 px-4 text-center">Thuế VAT</th>
                            <th className="py-3 px-4 text-center">Trạng thái</th>
                            <th className="py-3 px-4 w-24 text-center">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Không có sản phẩm nào phù hợp với bộ lọc.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, index) => (
                                <tr key={item.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                                    <td className="py-3 px-4 text-center text-zinc-500 text-xs">
                                        {index + 1}
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                            {item.image ? (
                                                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
                                        {formatProductCode(item.id)}
                                    </td>
                                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                                        {item.name}
                                    </td>
                                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                                        {item.category?.name ?? '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(item.price)}
                                    </td>
                                    <td className="py-3 px-4 text-center text-xs text-zinc-500">
                                        {Number(item.vat_rate)}%
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            item.is_available
                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                        }`}>
                                            {item.is_available ? 'Hoạt động' : 'Ngừng bán'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center space-x-1">
                                            <button
                                                type="button"
                                                onClick={() => onEdit(item)}
                                                className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                title="Chỉnh sửa sản phẩm"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDelete(item)}
                                                className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                title="Xóa sản phẩm"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
