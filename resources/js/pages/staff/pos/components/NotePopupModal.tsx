import { X } from 'lucide-react';
import React, { useState } from 'react';
import type { CartItem } from '../types/pos.types';

interface NotePopupModalProps {
    isOpen: boolean;
    item: CartItem | null;
    onSave: (menuItemId: number, note: string) => void;
    onClose: () => void;
}

const QUICK_NOTES = [
    'Ít đường',
    'Nhiều đá',
    'Ít đá',
    'Không đá',
    'Gia vị riêng',
    'Cay nhiều',
    'Cay ít',
    'Dị ứng hải sản',
    'Không hành',
    'Ít muối',
];

export default function NotePopupModal({
    isOpen,
    item,
    onSave,
    onClose,
}: NotePopupModalProps) {
    const [note, setNote] = useState(item?.note || '');

    if (!isOpen || !item) {
return null;
}

    const toggleQuickNote = (quickNote: string) => {
        setNote((prev) => {
            const notes = prev
                .split(',')
                .map((n) => n.trim())
                .filter(Boolean);
            const idx = notes.indexOf(quickNote);

            if (idx > -1) {
                return notes.filter((_, i) => i !== idx).join(', ');
            }

            return [...notes, quickNote].join(', ');
        });
    };

    const noteList = note
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="animate-in fade-in zoom-in-95 relative z-10 mx-4 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl duration-150 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                        Ghi chú cho {item.name}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                     aria-label="Đóng">
                        <X className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>

                <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Chọn nhanh
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {QUICK_NOTES.map((quickNote) => {
                            const isActive = noteList.includes(quickNote);

                            return (
                                <button
                                    key={quickNote}
                                    type="button"
                                    onClick={() => toggleQuickNote(quickNote)}
                                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        isActive
                                            ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-300'
                                            : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    {quickNote}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Hoặc nhập ghi chú
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Nhập ghi chú riêng..."
                        rows={3}
                        className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-sky-500"
                    />
                </div>

                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                        Đóng
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onSave(item.menu_item_id, note);
                            onClose();
                        }}
                        className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-700"
                    >
                        Lưu
                    </button>
                </div>
            </div>
        </div>
    );
}
