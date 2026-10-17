import { X, CalendarClock, Save, Calendar } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type { POSTableData, ReservationDraft } from '../types/pos.types';

interface ReservationFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    table: POSTableData | null;
    initialDraft?: ReservationDraft | null;
    onSubmit: (draft: ReservationDraft) => void;
}

export default function ReservationFormDrawer({
    isOpen,
    onClose,
    table,
    initialDraft,
    onSubmit,
}: ReservationFormDrawerProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        queueMicrotask(() => {
            if (isOpen) {
                if (initialDraft) {
                    setName(initialDraft.name);
                    setPhone(initialDraft.phone);
                    setTime(initialDraft.time);
                    setNote(initialDraft.note);
                } else {
                    setName('');
                    setPhone('');
                    setTime('');
                    setNote('');
                }
            }
        });
    }, [isOpen, initialDraft]);

    if (!isOpen || !table) {
        return null;
    }

    const isFormValid =
        name.trim() !== '' && phone.trim() !== '' && time.trim() !== '';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!isFormValid) {
            return;
        }

        onSubmit({
            name: name.trim(),
            phone: phone.trim(),
            time: time,
            note: note.trim(),
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div
                className="animate-in fade-in absolute inset-0 bg-black/60 backdrop-blur-sm duration-200"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="animate-in slide-in-from-right relative z-10 flex h-full w-full max-w-md flex-col justify-between border-l border-zinc-200/80 bg-white shadow-lg duration-300 dark:border-zinc-800/80 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex-none border-b border-zinc-100 bg-zinc-50/50 p-5 pb-4 dark:border-zinc-800/60 dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                <CalendarClock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                Đặt bàn — {table.table_number}
                            </h2>
                            <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                Điền thông tin khách hàng đặt trước
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-full border border-zinc-200 bg-white p-2.5 text-zinc-500 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                            aria-label="Đóng"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 pb-8">
                    <form
                        id="reservation-form"
                        onSubmit={handleSubmit}
                        className="space-y-4"
                    >
                        <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/60 dark:bg-violet-950/20">
                            <span className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider text-violet-800 uppercase dark:text-violet-300">
                                <Calendar className="h-4 w-4 stroke-[2]" />{' '}
                                Thông tin Đặt bàn
                            </span>

                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                    Họ tên khách hàng{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ví dụ: Anh Tuấn"
                                    required
                                    autoFocus
                                    className="w-full rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-base text-zinc-900 shadow-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-violet-800/80 dark:bg-zinc-900/80 dark:text-zinc-100"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                    Số điện thoại{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Ví dụ: 0912345678"
                                    required
                                    className="w-full rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-base text-zinc-900 shadow-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-violet-800/80 dark:bg-zinc-900/80 dark:text-zinc-100"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                    Thời gian hẹn{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    required
                                    min={new Date().toISOString().slice(0, 16)}
                                    className="w-full rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-base font-medium text-zinc-900 shadow-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-violet-800/80 dark:bg-zinc-900/80 dark:text-zinc-100"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                    Ghi chú (tùy chọn)
                                </label>
                                <textarea
                                    rows={3}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Ví dụ: 4 khách, lấy bàn gần cửa sổ, có trẻ em..."
                                    className="w-full resize-none rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-base text-zinc-900 shadow-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-violet-800/80 dark:bg-zinc-900/80 dark:text-zinc-100"
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-100 bg-white p-5 dark:border-zinc-800/60 dark:bg-zinc-900">
                    <button
                        type="submit"
                        form="reservation-form"
                        disabled={!isFormValid}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold shadow-sm transition-colors ${
                            isFormValid
                                ? 'bg-violet-600 text-white hover:bg-violet-700'
                                : 'cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                        }`}
                    >
                        <Save className="h-5 w-5" />
                        Tiếp tục
                    </button>
                </div>
            </div>
        </div>
    );
}
