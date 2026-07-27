import { router } from '@inertiajs/react';
import { AlertCircle, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

interface VoidItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'item' | 'order';
    orderItemId?: number | null;
    tableId?: number | null;
    menuItemName: string;
    onLogEvent?: (
        type: 'sent' | 'received' | 'error',
        message: string,
        details?: string,
    ) => void;
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
    onLogEvent,
}: VoidItemModalProps) {
    const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
    const [note, setNote] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) {
        return null;
    }

    if (mode === 'item' && !orderItemId) {
        return null;
    }

    if (mode === 'order' && !tableId) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        const endpoint =
            mode === 'order'
                ? '/staff/pos/cancel-order'
                : '/staff/kitchen/cancel-item';
        const payload =
            mode === 'order'
                ? {
                      table_id: tableId,
                      cancellation_reason: reason,
                      note: note.trim(),
                  }
                : {
                      order_item_id: orderItemId,
                      cancellation_reason: reason,
                      note: note.trim(),
                  };

        router.post(endpoint, payload, {
            onSuccess: () => {
                setSubmitting(false);
                onClose();

                if (onLogEvent) {
                    const actionText =
                        mode === 'order'
                            ? `Đã xác nhận hủy toàn bộ đơn ${menuItemName}`
                            : `Đã hủy món ${menuItemName}`;
                    onLogEvent('sent', actionText, `Lý do: ${reason}`);
                }
            },
            onError: (errs: any) => {
                setSubmitting(false);
                const msg =
                    errs?.error ||
                    errs?.message ||
                    (typeof errs === 'string'
                        ? errs
                        : 'Thao tác hủy thất bại. Vui lòng kiểm tra lại phân quyền.');
                setErrorMsg(msg);

                if (onLogEvent) {
                    const actionText =
                        mode === 'order'
                            ? `Hủy đơn thất bại (${menuItemName})`
                            : `Hủy món thất bại (${menuItemName})`;
                    onLogEvent('error', actionText, msg);
                }
            },
            onFinish: () => {
                setSubmitting(false);
            },
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs">
            <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400">
                        <Trash2 className="h-5 w-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {mode === 'order'
                                ? 'Xác nhận Hủy toàn bộ đơn hàng'
                                : 'Xác nhận Hủy món'}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    >
                        ✕
                    </button>
                </div>

                {errorMsg && (
                    <div className="mx-5 mt-4 flex items-center space-x-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                        <AlertCircle className="h-4 w-4 shrink-0 stroke-[1.5]" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    <div className="rounded-xl border border-rose-200/60 bg-rose-50/60 p-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                        {mode === 'order'
                            ? 'Đang chọn hủy:'
                            : 'Đang chọn hủy món:'}{' '}
                        <strong className="font-bold text-rose-600 dark:text-rose-400">
                            {menuItemName}
                        </strong>
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Lý do hủy <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {CANCEL_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className="flex cursor-pointer items-center space-x-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-200"
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
                        <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Ghi chú bổ sung (không bắt buộc)
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập chi tiết ví dụ: Khách đổi ý, khách bỏ về..."
                            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                    </div>

                    <div className="flex justify-end space-x-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
                        >
                            {submitting
                                ? 'Đang xử lý...'
                                : mode === 'order'
                                  ? 'Xác nhận Hủy cả đơn'
                                  : 'Xác nhận Hủy món'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
