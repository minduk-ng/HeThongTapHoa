import React from 'react';
import { POSTableData } from './POSTableTab';

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
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
                {/* Header Badge */}
                <div className="flex items-center space-x-3 border-b border-purple-100 dark:border-purple-900/60 pb-4">
                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 flex items-center justify-center text-2xl shrink-0">
                        📅
                    </div>
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                            Thông tin Đặt bàn trước
                        </span>
                        <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                            {table.table_number} ({table.area || 'Trong nhà'})
                        </h2>
                    </div>
                </div>

                {/* Details Content Box */}
                <div className="bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-900/50 rounded-xl p-4 space-y-2.5 text-xs text-zinc-800 dark:text-zinc-200">
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">👤 Người đặt:</span>
                        <span className="font-extrabold text-sm text-purple-900 dark:text-purple-200">
                            {table.reservation_name || 'Khách đặt trước'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">📞 Số điện thoại:</span>
                        <span className="font-bold font-mono">{table.reservation_phone || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 font-medium">⏰ Giờ hẹn (Ngày & Giờ):</span>
                        <span className="font-extrabold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/80 px-2 py-0.5 rounded-md">
                            {formattedTime}
                        </span>
                    </div>
                    {table.reservation_note && (
                        <div className="pt-2 border-t border-purple-200/50 dark:border-purple-900/50">
                            <span className="text-zinc-500 font-medium block mb-0.5">📝 Ghi chú:</span>
                            <p className="italic text-zinc-700 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/60 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                                "{table.reservation_note}"
                            </p>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-zinc-400 italic text-center">
                    Bấm xác nhận để nhận khách vào bàn và bắt đầu gọi món.
                </p>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="py-2.5 px-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl transition-colors"
                    >
                        Hủy / Xem lại
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="py-2.5 px-3 text-xs font-extrabold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-1"
                    >
                        <span>✓ Nhận bàn & Gọi món</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
