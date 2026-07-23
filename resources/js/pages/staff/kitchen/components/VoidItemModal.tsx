import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertCircle, Trash2 } from 'lucide-react';

interface VoidItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'item' | 'order';
    orderItemId?: number | null;
    tableId?: number | null;
    menuItemName: string;
}

const CANCEL_REASONS = [
    'Khách đổi ý / Khách hủy',
    'Món bị hỏng / Làm sai',
    'Hết nguyên liệu / Hết hàng',
    'Khác',
];

export default function VoidItemModal({
    isOpen,
    onClose,
    mode = 'item',
    orderItemId,
    tableId,
    menuItemName,
}: VoidItemModalProps) {
    const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
    const [note, setNote] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;
    if (mode === 'item' && !orderItemId) return null;
    if (mode === 'order' && !tableId) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg(null);

        const endpoint = mode === 'order' ? '/staff/pos/cancel-order' : '/staff/kitchen/cancel-item';
        const payload = mode === 'order'
            ? { table_id: tableId, cancellation_reason: reason, note: note.trim() }
            : { order_item_id: orderItemId, cancellation_reason: reason, note: note.trim() };

        router.post(endpoint, payload, {
            onSuccess: () => {
                setSubmitting(false);
                onClose();
            },
            onError: (errs) => {
                setSubmitting(false);
                setErrorMsg(errs.error || 'Thao tác hủy thất bại. Vui lòng kiểm tra lại phân quyền.');
            },
        });
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400">
                        <Trash2 className="w-5 h-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {mode === 'order' ? 'Xác nhận Hủy toàn bộ đơn hàng' : 'Xác nhận Hủy món'}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                        ✕
                    </button>
                </div>

                {errorMsg && (
                    <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 shrink-0 stroke-[1.5]" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200">
                        {mode === 'order' ? 'Đang chọn hủy:' : 'Đang chọn hủy món:'}{' '}
                        <strong className="text-rose-600 dark:text-rose-400 font-bold">{menuItemName}</strong>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            Lý do hủy <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {CANCEL_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 cursor-pointer hover:bg-zinc-100/50 text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                                >
                                    <input
                                        type="radio"
                                        name="cancelReason"
                                        value={r}
                                        checked={reason === r}
                                        onChange={() => setReason(r)}
                                        className="text-rose-600 focus:ring-rose-500"
                                    />
                                    <span>{r}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Ghi chú bổ sung (không bắt buộc)
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập chi tiết ví dụ: Khách đổi ý, khách bỏ về..."
                            className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                        />
                    </div>

                    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang xử lý...' : mode === 'order' ? 'Xác nhận Hủy cả đơn' : 'Xác nhận Hủy món'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
