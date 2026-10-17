import { Calendar, User, Phone, Clock, FileText, Check } from 'lucide-react';
import React from 'react';
import type { POSTableData } from '../types/pos.types';

interface ReservationConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    table: POSTableData | null;
    onConfirm: () => void;
}

export default function ReservationConfirmModal({
    isOpen,
    onClose,
    table,
    onConfirm,
}: ReservationConfirmModalProps) {
    if (!isOpen || !table) {
        return null;
    }

    const formattedTime = table.reservation_time
        ? new Date(table.reservation_time).toLocaleString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
          })
        : '—';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-md space-y-5 rounded-2xl border border-purple-200/80 bg-white p-6 shadow-xl dark:border-purple-900/60 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex items-center space-x-3 border-b border-purple-100 pb-4 dark:border-purple-900/60">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-purple-200/60 bg-purple-50 text-purple-600 dark:border-purple-900/60 dark:bg-purple-950/60 dark:text-purple-400">
                        <Calendar className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <div>
                        <span className="block text-xs font-semibold text-purple-600 dark:text-purple-400">
                            Thông tin đặt bàn trước
                        </span>
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            {table.table_number} ({table.area || 'Trong nhà'})
                        </h2>
                    </div>
                </div>

                {/* Details Content Box */}
                <div className="space-y-3 rounded-xl border border-purple-200/60 bg-purple-50/60 p-4 text-xs text-zinc-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-zinc-200">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-500">
                            <User className="h-3.5 w-3.5 stroke-[1.5]" /> Người
                            đặt:
                        </span>
                        <span className="font-semibold text-purple-900 dark:text-purple-200">
                            {table.reservation_name || 'Khách đặt trước'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-500">
                            <Phone className="h-3.5 w-3.5 stroke-[1.5]" /> Số
                            điện thoại:
                        </span>
                        <span className="font-mono font-semibold">
                            {table.reservation_phone || '—'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-500">
                            <Clock className="h-3.5 w-3.5 stroke-[1.5]" /> Thời
                            gian hẹn:
                        </span>
                        <span className="rounded-md bg-purple-100/80 px-2 py-0.5 font-semibold text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                            {formattedTime}
                        </span>
                    </div>
                    {table.reservation_note && (
                        <div className="space-y-1 border-t border-purple-200/60 pt-2 dark:border-purple-900/50">
                            <span className="flex items-center gap-1.5 text-zinc-500">
                                <FileText className="h-3.5 w-3.5 stroke-[1.5]" />{' '}
                                Ghi chú:
                            </span>
                            <p className="rounded-lg border border-purple-100 bg-white p-2.5 text-zinc-700 dark:border-purple-900/40 dark:bg-zinc-800/80 dark:text-zinc-300">
                                “{table.reservation_note}”
                            </p>
                        </div>
                    )}
                </div>

                <p className="text-center text-[11px] leading-relaxed text-zinc-400">
                    Nhấn xác nhận để xếp khách vào bàn và bắt đầu thực hiện gọi
                    món.
                </p>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-zinc-100 px-3 py-2.5 text-xs font-semibold text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                        Hủy / Xem lại
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="flex items-center justify-center space-x-1.5 rounded-xl bg-purple-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-purple-700"
                    >
                        <Check className="h-3.5 w-3.5" />
                        <span>Nhận bàn & Gọi món</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
