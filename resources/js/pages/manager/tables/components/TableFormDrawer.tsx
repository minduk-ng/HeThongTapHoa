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
    const [mode, setMode] = useState<'single' | 'batch'>('single');

    // Single mode states
    const [tableNumber, setTableNumber] = useState('');
    const [selectedArea, setSelectedArea] = useState('Tầng 1 (Trong nhà)');
    const [customArea, setCustomArea] = useState('');
    const [isCustomArea, setIsCustomArea] = useState(false);
    const [capacity, setCapacity] = useState('4');
    const [status, setStatus] = useState<TableData['status']>('available');

    // Reservation states
    const [reservationName, setReservationName] = useState('');
    const [reservationPhone, setReservationPhone] = useState('');
    const [reservationTime, setReservationTime] = useState('');
    const [reservationNote, setReservationNote] = useState('');

    // Batch mode states
    const [batchPrefix, setBatchPrefix] = useState('Bàn ');
    const [batchFrom, setBatchFrom] = useState('11');
    const [batchTo, setBatchTo] = useState('15');

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (tableToEdit) {
            setMode('single');
            setTableNumber(tableToEdit.table_number || '');
            
            const areaExists = areas.includes(tableToEdit.area);
            if (areaExists) {
                setSelectedArea(tableToEdit.area);
                setIsCustomArea(false);
            } else {
                setSelectedArea('__NEW__');
                setCustomArea(tableToEdit.area || '');
                setIsCustomArea(true);
            }

            setCapacity(String(tableToEdit.capacity || 4));
            setStatus(tableToEdit.status || 'available');
            setReservationName(tableToEdit.reservation_name || '');
            setReservationPhone(tableToEdit.reservation_phone || '');
            
            // Format ISO datetime string for datetime-local input
            if (tableToEdit.reservation_time) {
                const d = new Date(tableToEdit.reservation_time);
                const isoStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                setReservationTime(isoStr);
            } else {
                setReservationTime('');
            }
            setReservationNote(tableToEdit.reservation_note || '');
        } else {
            setMode('single');
            setTableNumber('');
            setSelectedArea(areas[0] || 'Tầng 1 (Trong nhà)');
            setIsCustomArea(false);
            setCustomArea('');
            setCapacity('4');
            setStatus('available');
            setReservationName('');
            setReservationPhone('');
            setReservationTime('');
            setReservationNote('');
        }
        setErrors({});
    }, [tableToEdit, isOpen, areas]);

    if (!isOpen) return null;

    // Smart Table Number handler: auto-prefixes numeric input e.g. "11" -> "Bàn 11"
    const handleTableNumberChange = (val: string) => {
        if (/^\d+$/.test(val.trim())) {
            setTableNumber(`Bàn ${val.trim()}`);
        } else {
            setTableNumber(val);
        }
    };

    const handleAreaSelectChange = (val: string) => {
        if (val === '__NEW__') {
            setIsCustomArea(true);
            setSelectedArea('__NEW__');
        } else {
            setIsCustomArea(false);
            setSelectedArea(val);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const finalArea = isCustomArea ? customArea.trim() : selectedArea;

        if (mode === 'batch') {
            const payload = {
                prefix: batchPrefix,
                from_number: Number(batchFrom),
                to_number: Number(batchTo),
                area: finalArea,
                capacity: Number(capacity) || 4,
            };

            router.post('/manager/tables/batch', payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
            return;
        }

        const payload = {
            table_number: tableNumber,
            area: finalArea,
            capacity: Number(capacity) || 4,
            status,
            reservation_name: status === 'reserved' ? reservationName : null,
            reservation_phone: status === 'reserved' ? reservationPhone : null,
            reservation_time: status === 'reserved' ? reservationTime : null,
            reservation_note: status === 'reserved' ? reservationNote : null,
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
                    {/* Drawer Header */}
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                {tableToEdit ? 'Cập nhật thông tin bàn' : mode === 'batch' ? 'Tạo nhanh hàng loạt bàn' : 'Thêm bàn mới'}
                            </h2>
                            {!tableToEdit && (
                                <div className="flex items-center space-x-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setMode('single')}
                                        className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            mode === 'single'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                        }`}
                                    >
                                        Thêm đơn lẻ
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('batch')}
                                        className={`px-3 py-1 text-xs font-bold rounded-full ${
                                            mode === 'batch'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                        }`}
                                    >
                                        ⚡ Tạo nhanh nhiều bàn
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Drawer Form Body */}
                    <form id="table-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                        {/* Single Mode Form */}
                        {mode === 'single' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Tên / Số bàn <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={tableNumber}
                                        onChange={(e) => handleTableNumberChange(e.target.value)}
                                        placeholder="Gõ số (vd 11) -> Tự nhảy Bàn 11"
                                        className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold"
                                    />
                                    {errors.table_number && <p className="text-xs text-red-500 mt-1">{errors.table_number}</p>}
                                </div>
                            </>
                        ) : (
                            /* Batch Mode Form */
                            <div className="space-y-4 p-4 border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl">
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">
                                    Tự động tạo dãy bàn từ A tới B
                                </span>
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                        Tiền tố tên bàn:
                                    </label>
                                    <input
                                        type="text"
                                        value={batchPrefix}
                                        onChange={(e) => setBatchPrefix(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-bold"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                            Từ số bàn:
                                        </label>
                                        <input
                                            type="number"
                                            value={batchFrom}
                                            onChange={(e) => setBatchFrom(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                            Đến số bàn:
                                        </label>
                                        <input
                                            type="number"
                                            value={batchTo}
                                            onChange={(e) => setBatchTo(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-bold"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Area Select Dropdown + Custom Area Input */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Khu vực / Vị trí <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedArea}
                                onChange={(e) => handleAreaSelectChange(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                            >
                                {areas.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                                <option value="__NEW__">➕ Thêm khu vực mới...</option>
                            </select>

                            {isCustomArea && (
                                <input
                                    type="text"
                                    value={customArea}
                                    onChange={(e) => setCustomArea(e.target.value)}
                                    placeholder="Nhập tên khu vực mới..."
                                    className="w-full mt-2 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-blue-400 focus:ring-2 focus:ring-blue-500"
                                />
                            )}
                            {errors.area && <p className="text-xs text-red-500 mt-1">{errors.area}</p>}
                        </div>

                        {/* Capacity */}
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

                        {/* Status (Single mode only) */}
                        {mode === 'single' && (
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Trạng thái bàn
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as TableData['status'])}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
                                >
                                    <option value="available">Bàn trống</option>
                                    <option value="occupied">Đang dùng</option>
                                    <option value="reserved">📅 Đã đặt trước</option>
                                    <option value="maintenance">Bảo trì</option>
                                </select>
                            </div>
                        )}

                        {/* Reservation Details Fields (Shown when status === 'reserved') */}
                        {mode === 'single' && status === 'reserved' && (
                            <div className="space-y-3 p-4 border border-purple-300 dark:border-purple-800/80 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl">
                                <span className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider block">
                                    📅 Thông tin Đặt bàn trước
                                </span>

                                <div>
                                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                        Họ tên người đặt <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={reservationName}
                                        onChange={(e) => setReservationName(e.target.value)}
                                        placeholder="Ví dụ: Anh Tuấn"
                                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                        Số điện thoại <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={reservationPhone}
                                        onChange={(e) => setReservationPhone(e.target.value)}
                                        placeholder="Ví dụ: 0912345678"
                                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                        Thời gian hẹn (Ngày & Giờ) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={reservationTime}
                                        onChange={(e) => setReservationTime(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-semibold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                        Ghi chú đặt bàn
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={reservationNote}
                                        onChange={(e) => setReservationNote(e.target.value)}
                                        placeholder="Ví dụ: 4 khách, lấy bàn gần cửa sổ"
                                        className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700"
                                    />
                                </div>
                            </div>
                        )}
                    </form>

                    {/* Footer Buttons */}
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
                            {submitting ? 'Đang lưu...' : mode === 'batch' ? 'Khởi tạo danh sách bàn' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
