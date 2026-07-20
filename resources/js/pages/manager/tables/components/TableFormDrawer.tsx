import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { TableData } from './TableListTable';

interface TableFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    tableToEdit?: TableData | null;
    areas: string[];
}

export default function TableFormDrawer({
    isOpen,
    onClose,
    tableToEdit,
    areas,
}: TableFormDrawerProps) {
    const [tableNumber, setTableNumber] = useState('');
    const [area, setArea] = useState('Tầng 1 (Trong nhà)');
    const [capacity, setCapacity] = useState('4');
    const [status, setStatus] = useState<TableData['status']>('available');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (tableToEdit) {
            setTableNumber(tableToEdit.table_number || '');
            setArea(tableToEdit.area || 'Tầng 1 (Trong nhà)');
            setCapacity(String(tableToEdit.capacity || 4));
            setStatus(tableToEdit.status || 'available');
        } else {
            setTableNumber('');
            setArea('Tầng 1 (Trong nhà)');
            setCapacity('4');
            setStatus('available');
        }
        setErrors({});
    }, [tableToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const payload = {
            table_number: tableNumber,
            area,
            capacity: Number(capacity) || 4,
            status,
        };

        if (tableToEdit) {
            router.post(`/manager/tables/${tableToEdit.id}`, payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        } else {
            router.post('/manager/tables', payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                <div className="w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between">
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {tableToEdit ? 'Cập nhật thông tin bàn' : 'Thêm bàn mới'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <form id="table-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Tên / Mã bàn <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                placeholder="Ví dụ: Bàn 011"
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            {errors.table_number && <p className="text-xs text-red-500 mt-1">{errors.table_number}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Khu vực / Vị trí <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={area}
                                onChange={(e) => setArea(e.target.value)}
                                placeholder="Tầng 1 (Trong nhà), Tầng 2, Sân vườn..."
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            {errors.area && <p className="text-xs text-red-500 mt-1">{errors.area}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Số ghế (Sức chứa) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Trạng thái bàn
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as TableData['status'])}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="available">Bàn trống</option>
                                <option value="occupied">Đang dùng</option>
                                <option value="reserved">Đã đặt trước</option>
                                <option value="maintenance">Bảo trì</option>
                            </select>
                        </div>
                    </form>

                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 rounded-lg shadow-xs"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            form="table-form"
                            disabled={submitting}
                            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
