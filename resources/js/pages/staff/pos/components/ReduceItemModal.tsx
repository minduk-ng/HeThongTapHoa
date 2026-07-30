import React, { useState } from 'react';
import { MinusCircle, X } from 'lucide-react';
import { CartItem } from '../types/pos.types';

interface ReduceItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: CartItem | null;
    onConfirm: (orderItemId: number, reduceQty: number, reason: string, note?: string) => void;
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

    if (!isOpen || !item || !item.orderItemId) return null;

    const maxReduce = item.quantity;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(item.orderItemId!, reduceQty, reason, note.trim());
        setNote('');
        setReduceQty(1);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                        <MinusCircle className="w-5 h-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            Xác nhận Giảm số lượng món
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                        <X className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200">
                        Đang chọn giảm món: <strong className="text-amber-700 dark:text-amber-300 font-bold">“{item.name}”</strong> (Hiện có <span className="tabular-nums font-bold">{item.quantity}</span> phần)
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Số lượng giảm <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center space-x-3">
                            <button
                                type="button"
                                onClick={() => setReduceQty((q) => Math.max(1, q - 1))}
                                disabled={reduceQty <= 1}
                                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-700 dark:text-zinc-200 disabled:opacity-40"
                            >
                                -
                            </button>
                            <span className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100 w-8 text-center">
                                {reduceQty}
                            </span>
                            <button
                                type="button"
                                onClick={() => setReduceQty((q) => Math.min(maxReduce, q + 1))}
                                disabled={reduceQty >= maxReduce}
                                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-700 dark:text-zinc-200 disabled:opacity-40"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            Lý do giảm <span className="text-rose-500">*</span>
                        </label>
                        <div className="space-y-2">
                            {REDUCE_REASONS.map((r) => (
                                <label
                                    key={r}
                                    className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 cursor-pointer hover:bg-zinc-100/50 text-xs font-semibold text-zinc-800 dark:text-zinc-200"
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
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Ghi chú bổ sung (không bắt buộc)
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập chi tiết lý do..."
                            className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
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
                            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                        >
                            Xác nhận Giảm món (Chờ gửi Bếp)
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
