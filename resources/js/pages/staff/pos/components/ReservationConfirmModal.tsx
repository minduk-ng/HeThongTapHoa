import React from 'react';
import { Calendar, User, Phone, Clock, FileText, Check } from 'lucide-react';
import { POSTableData } from '../types/pos.types';

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
    if (!isOpen || !table) return null;

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
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-purple-200/80 dark:border-purple-900/60 rounded-2xl shadow-xl p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center space-x-3 border-b border-purple-100 dark:border-purple-900/60 pb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Calendar className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 block">
                            Thông tin đặt bàn trước
                        </span>
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            {table.table_number} ({table.area || 'Trong nhà'})
                        </h2>
                    </div>
                </div>

                {/* Details Content Box */}
                <div className="bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/50 rounded-xl p-4 space-y-3 text-xs text-zinc-800 dark:text-zinc-200">
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 stroke-[1.5]" /> Người đặt:
                        </span>
                        <span className="font-semibold text-purple-900 dark:text-purple-200">
                            {table.reservation_name || 'Khách đặt trước'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 stroke-[1.5]" /> Số điện thoại:
                        </span>
                        <span className="font-semibold font-mono">{table.reservation_phone || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 stroke-[1.5]" /> Thời gian hẹn:
                        </span>
                        <span className="font-semibold text-purple-700 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/60 px-2 py-0.5 rounded-md">
                            {formattedTime}
                        </span>
                    </div>
                    {table.reservation_note && (
                        <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/50 space-y-1">
                            <span className="text-zinc-500 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 stroke-[1.5]" /> Ghi chú:
                            </span>
                            <p className="text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800/80 p-2.5 rounded-lg border border-purple-100 dark:border-purple-900/40">
                                “{table.reservation_note}”
                            </p>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                    Nhấn xác nhận để xếp khách vào bàn và bắt đầu thực hiện gọi món.
                </p>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="py-2.5 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl transition-colors duration-150"
                    >
                        Hủy / Xem lại
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="py-2.5 px-3 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors duration-150 flex items-center justify-center space-x-1.5"
                    >
                        <Check className="w-3.5 h-3.5" />
                        <span>Nhận bàn & Gọi món</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
