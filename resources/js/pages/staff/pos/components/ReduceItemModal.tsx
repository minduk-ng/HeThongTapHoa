import { MinusCircle, X } from 'lucide-react';
import React, { useState } from 'react';
import type { CartItem } from '../types/pos.types';

interface ReduceItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: CartItem | null;
    onConfirm: (
        orderItemId: number,
        reduceQty: number,
        reason: string,
        note?: string,
    ) => void;
}

const REDUCE_REASONS = [
    'Khách đổi ý / Khách giảm số lượng',
    'Món bị hỏng / Làm sai',
    'Hết nguyên liệu / Hết hàng',
    'Khác',
];

export default function ReduceItemModal({
    isOpen,
    onClose,
    item,
    onConfirm,
}: ReduceItemModalProps) {
    const [reason, setReason] = useState<string>(REDUCE_REASONS[0]);
    const [note, setNote] = useState<string>('');
    const [reduceQty, setReduceQty] = useState<number>(1);

    if (!isOpen || !item || !item.orderItemId) {
        return null;
    }

    const maxReduce = item.quantity;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(item.orderItemId!, reduceQty, reason, note.trim());
        setNote('');
        setReduceQty(1);
        onClose();
    };

    return (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs duration-150">
            <div className="animate-in zoom-in-95 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg duration-150 dark:border-zinc-800 dark:bg-zinc-900">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                        <MinusCircle className="h-5 w-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            Xác nhận Giảm số lượng món
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        aria-label="Đóng"
                    >
                        <X className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        Đang chọn giảm món:{' '}
                        <strong className="font-bold text-amber-700 dark:text-amber-300">
                            “{item.name}”
                        </strong>{' '}
                        (Hiện có{' '}
                        <span className="font-bold tabular-nums">
                            {item.quantity}
                        </span>{' '}
                        phần)
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Số lượng giảm{' '}
                            <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center space-x-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setReduceQty((q) => Math.max(1, q - 1))
                                }
                                disabled={reduceQty <= 1}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-sm font-bold text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200"
                            >
                                -
                            </button>
                            <span className="w-8 text-center text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                                {reduceQty}
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    setReduceQty((q) =>
                                        Math.min(maxReduce, q + 1),
                                    )
                                }
                                disabled={reduceQty >= maxReduce}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-sm font-bold text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Lý do giảm <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {REDUCE_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className="flex cursor-pointer items-center space-x-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-200"
                                >
                                    <input
                                        type="radio"
                                        name="reduceReason"
                                        value={r}
                                        checked={reason === r}
                                        onChange={() => setReason(r)}
                                        className="text-amber-600 focus:ring-amber-500"
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
                            placeholder="Nhập chi tiết lý do..."
                            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                            className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700"
                        >
                            Xác nhận Giảm món (Chờ gửi Bếp)
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
