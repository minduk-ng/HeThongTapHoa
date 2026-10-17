import { router } from '@inertiajs/react';
import { Calendar, LayoutGrid, Users, Zap } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { ManagerFormModal, FormSection, FormField } from '@/components/form';
import type { TableData } from './TableListTable';

interface TableFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableToEdit?: TableData | null;
    areas: string[];
}

export default function TableFormModal({
    isOpen,
    onClose,
    tableToEdit,
    areas,
}: TableFormModalProps) {
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
        queueMicrotask(() => {
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

                if (tableToEdit.reservation_time) {
                    const d = new Date(tableToEdit.reservation_time);
                    const isoStr = new Date(
                        d.getTime() - d.getTimezoneOffset() * 60000,
                    )
                        .toISOString()
                        .slice(0, 16);
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
        });
    }, [tableToEdit, isOpen, areas]);

    const isDirty = useMemo(() => {
        if (tableToEdit) {
            return (
                tableNumber !== (tableToEdit.table_number || '') ||
                capacity !== String(tableToEdit.capacity || 4) ||
                status !== (tableToEdit.status || 'available') ||
                reservationName !== (tableToEdit.reservation_name || '') ||
                reservationPhone !== (tableToEdit.reservation_phone || '') ||
                reservationNote !== (tableToEdit.reservation_note || '')
            );
        }

        if (mode === 'batch') {
            return (
                batchPrefix !== 'Bàn ' || batchFrom !== '11' || batchTo !== '15'
            );
        }

        return (
            tableNumber.trim() !== '' ||
            reservationName.trim() !== '' ||
            reservationPhone.trim() !== '' ||
            reservationNote.trim() !== ''
        );
    }, [
        tableToEdit,
        mode,
        tableNumber,
        capacity,
        status,
        reservationName,
        reservationPhone,
        reservationNote,
        batchPrefix,
        batchFrom,
        batchTo,
    ]);

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

        if (submitting) {
            return;
        }

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
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            title={
                tableToEdit
                    ? 'Cập nhật thông tin bàn'
                    : mode === 'batch'
                      ? 'Tạo nhanh hàng loạt bàn'
                      : 'Thêm bàn mới'
            }
            subtitle={
                tableToEdit
                    ? 'Điều chỉnh số hiệu bàn, sức chứa và khu vực phục vụ'
                    : 'Thiết lập bàn đơn lẻ hoặc sinh dải số bàn tự động theo khu vực'
            }
            isEditing={!!tableToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="lg"
            formId="table-form"
        >
            {/* Mode Switcher for New Table */}
            {!tableToEdit && (
                <div className="flex items-center space-x-2 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-1.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                    <button
                        type="button"
                        onClick={() => setMode('single')}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                            mode === 'single'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                        }`}
                    >
                        Thêm đơn lẻ
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('batch')}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                            mode === 'batch'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                        }`}
                    >
                        <Zap className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>Tạo nhanh hàng loạt</span>
                    </button>
                </div>
            )}

            {mode === 'single' ? (
                <>
                    {/* Section 1: Nhận diện bàn */}
                    <FormSection
                        title="Nhận diện bàn"
                        description="Tên định danh và vị trí khu vực"
                        icon={LayoutGrid}
                        gridCols={2}
                    >
                        <FormField
                            label="Tên / Số hiệu bàn"
                            required
                            error={errors.table_number}
                            hint="Ví dụ: Bàn 01, VIP 1..."
                        >
                            <input
                                type="text"
                                value={tableNumber}
                                onChange={(e) =>
                                    handleTableNumberChange(e.target.value)
                                }
                                placeholder="Bàn 01"
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                        </FormField>

                        <FormField
                            label="Khu vực / Tầng"
                            required
                            error={errors.area}
                        >
                            <select
                                value={selectedArea}
                                onChange={(e) =>
                                    handleAreaSelectChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                                {areas.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                                <option value="__NEW__">
                                    + Nhập khu vực mới…
                                </option>
                            </select>

                            {isCustomArea && (
                                <input
                                    type="text"
                                    value={customArea}
                                    onChange={(e) =>
                                        setCustomArea(e.target.value)
                                    }
                                    placeholder="Nhập tên khu vực mới…"
                                    className="mt-2 w-full rounded-xl border border-sky-400 bg-sky-50/30 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-sky-500/50 dark:bg-sky-950/20 dark:text-zinc-100"
                                    required
                                    autoFocus
                                />
                            )}
                        </FormField>
                    </FormSection>

                    {/* Section 2: Sức chứa & Trạng thái */}
                    <FormSection
                        title="Sức chứa & Trạng thái"
                        description="Số ghế và tình trạng phục vụ"
                        icon={Users}
                        gridCols={2}
                    >
                        <FormField
                            label="Sức chứa (số ghế)"
                            error={errors.capacity}
                        >
                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </FormField>

                        <FormField label="Trạng thái" error={errors.status}>
                            <select
                                value={status}
                                onChange={(e) =>
                                    setStatus(e.target.value as any)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                                <option value="available">
                                    Bàn trống (Sẵn sàng)
                                </option>
                                <option value="occupied">Đang có khách</option>
                                <option value="reserved">Đặt bàn trước</option>
                                <option value="maintenance">
                                    Tạm ngưng phục vụ
                                </option>
                            </select>
                        </FormField>
                    </FormSection>

                    {/* Section 3: Thông tin Đặt bàn (chỉ hiện khi status === 'reserved') */}
                    {status === 'reserved' && (
                        <FormSection
                            title="Thông tin đặt bàn trước"
                            description="Thông tin khách hẹn và giờ nhận bàn"
                            icon={Calendar}
                            gridCols={2}
                        >
                            <FormField label="Tên khách hàng" required>
                                <input
                                    type="text"
                                    value={reservationName}
                                    onChange={(e) =>
                                        setReservationName(e.target.value)
                                    }
                                    placeholder="Anh Minh, Chị Lan…"
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    required
                                />
                            </FormField>

                            <FormField label="Số điện thoại" required>
                                <input
                                    type="tel"
                                    value={reservationPhone}
                                    onChange={(e) =>
                                        setReservationPhone(e.target.value)
                                    }
                                    placeholder="0912 345 678"
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    required
                                />
                            </FormField>

                            <FormField label="Thời gian nhận bàn" required>
                                <input
                                    type="datetime-local"
                                    value={reservationTime}
                                    onChange={(e) =>
                                        setReservationTime(e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                    required
                                />
                            </FormField>

                            <FormField label="Ghi chú đặt bàn">
                                <input
                                    type="text"
                                    value={reservationNote}
                                    onChange={(e) =>
                                        setReservationNote(e.target.value)
                                    }
                                    placeholder="Ví dụ: Trang trí sinh nhật, 1 ghế em bé…"
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                />
                            </FormField>
                        </FormSection>
                    )}
                </>
            ) : (
                <>
                    {/* Batch Mode Sections */}
                    <FormSection
                        title="Dải số bàn tự động"
                        description="Thiết lập tiền tố và khoảng số sinh hàng loạt"
                        icon={Zap}
                        gridCols={3}
                    >
                        <FormField label="Tiền tố tên bàn">
                            <input
                                type="text"
                                value={batchPrefix}
                                onChange={(e) => setBatchPrefix(e.target.value)}
                                placeholder="Bàn "
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                        </FormField>

                        <FormField label="Từ số" required>
                            <input
                                type="number"
                                value={batchFrom}
                                onChange={(e) => setBatchFrom(e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                        </FormField>

                        <FormField label="Đến số" required>
                            <input
                                type="number"
                                value={batchTo}
                                onChange={(e) => setBatchTo(e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                        </FormField>
                    </FormSection>

                    <FormSection
                        title="Khu vực & Sức chứa chung"
                        description="Áp dụng cho toàn bộ các bàn trong dải số"
                        icon={LayoutGrid}
                        gridCols={2}
                    >
                        <FormField label="Khu vực" required>
                            <select
                                value={selectedArea}
                                onChange={(e) =>
                                    handleAreaSelectChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                                {areas.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                                <option value="__NEW__">
                                    + Nhập khu vực mới…
                                </option>
                            </select>

                            {isCustomArea && (
                                <input
                                    type="text"
                                    value={customArea}
                                    onChange={(e) =>
                                        setCustomArea(e.target.value)
                                    }
                                    placeholder="Nhập tên khu vực mới…"
                                    className="mt-2 w-full rounded-xl border border-sky-400 bg-sky-50/30 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-sky-500/50 dark:bg-sky-950/20 dark:text-zinc-100"
                                    required
                                    autoFocus
                                />
                            )}
                        </FormField>

                        <FormField label="Số ghế mỗi bàn">
                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </FormField>
                    </FormSection>
                </>
            )}
        </ManagerFormModal>
    );
}
