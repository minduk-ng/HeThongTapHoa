import { X, CalendarX2 } from 'lucide-react';
import React, { useState } from 'react';

interface CancelReservationModalProps {
    isOpen: boolean;
    onClose: () => void;
    depositTotal: number;
    onConfirm: (resolution: 'refund' | 'forfeit', note: string) => void;
}

export default function CancelReservationModal({
    isOpen,
    onClose,
    depositTotal,
    onConfirm,
}: CancelReservationModalProps) {
    const [resolution, setResolution] = useState<'refund' | 'forfeit'>('refund');
    const [note, setNote] = useState('');

    if (!isOpen) {
return null;
}

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-150"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 dark:bg-zinc-900">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                        <CalendarX2 className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-display text-xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            Hủy đặt bàn
                        </h3>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                            Bạn có chắc chắn muốn hủy đặt bàn này không?
                        </p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    {depositTotal > 0 && (
                        <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/30 dark:bg-rose-900/10">
                            <p className="text-sm font-medium text-rose-800 dark:text-rose-300">
                                Đơn có khoản cọc {depositTotal.toLocaleString('vi-VN')} đ. Xử lý cọc:
                            </p>
                            
                            <label className="flex cursor-pointer items-start gap-3">
                                <div className="flex h-5 items-center">
                                    <input
                                        type="radio"
                                        name="resolution"
                                        className="h-4 w-4 border-zinc-300 text-rose-600 focus:ring-rose-600 dark:border-zinc-700 dark:bg-zinc-800"
                                        checked={resolution === 'refund'}
                                        onChange={() => setResolution('refund')}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        Hoàn cọc cho khách
                                    </span>
                                </div>
                            </label>

                            <label className="flex cursor-pointer items-start gap-3">
                                <div className="flex h-5 items-center">
                                    <input
                                        type="radio"
                                        name="resolution"
                                        className="h-4 w-4 border-zinc-300 text-rose-600 focus:ring-rose-600 dark:border-zinc-700 dark:bg-zinc-800"
                                        checked={resolution === 'forfeit'}
                                        onChange={() => setResolution('forfeit')}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        Thu cọc (khách không đến)
                                    </span>
                                </div>
                            </label>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Lý do hủy (tùy chọn)
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập lý do hủy..."
                            className="w-full resize-none rounded-xl border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-rose-500 focus:ring-rose-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                            rows={3}
                        />
                    </div>
                </div>

                <div className="mt-8 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        Đóng
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onConfirm(resolution, note);
                        }}
                        className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-semibold text-white transition-all hover:bg-rose-700 focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
                    >
                        Xác nhận hủy
                    </button>
                </div>
            </div>
        </div>
    );
}