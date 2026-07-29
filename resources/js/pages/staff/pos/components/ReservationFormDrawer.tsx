import React, { useState, useEffect } from 'react';
import { X, CalendarClock, Save, Calendar } from 'lucide-react';
import { POSTableData, ReservationDraft } from '../types/pos.types';

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
    }, [isOpen, initialDraft]);

    if (!isOpen || !table) return null;

    const isFormValid = name.trim() !== '' && phone.trim() !== '' && time.trim() !== '';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid) return;
        
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
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 h-full border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="flex-none p-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <CalendarClock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                Đặt bàn — {table.table_number}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                Điền thông tin khách hàng đặt trước
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-sm text-zinc-500 dark:text-zinc-400"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 pb-8">
                    <form id="reservation-form" onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-4 p-5 border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/20 rounded-2xl">
                            <span className="text-xs font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300 flex items-center gap-1.5 mb-2">
                                <Calendar className="w-4 h-4 stroke-[2]" /> Thông tin Đặt bàn
                            </span>

                            <div>
                                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Họ tên khách hàng <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ví dụ: Anh Tuấn"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-2.5 text-base border rounded-xl bg-white dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border-violet-200 dark:border-violet-800/80 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Số điện thoại <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Ví dụ: 0912345678"
                                    required
                                    className="w-full px-4 py-2.5 text-base border rounded-xl bg-white dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border-violet-200 dark:border-violet-800/80 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Thời gian hẹn <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    required
                                    min={new Date().toISOString().slice(0, 16)}
                                    className="w-full px-4 py-2.5 text-base border rounded-xl bg-white dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border-violet-200 dark:border-violet-800/80 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 shadow-sm font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Ghi chú (tùy chọn)
                                </label>
                                <textarea
                                    rows={3}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Ví dụ: 4 khách, lấy bàn gần cửa sổ, có trẻ em..."
                                    className="w-full px-4 py-2.5 text-base border rounded-xl bg-white dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border-violet-200 dark:border-violet-800/80 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 shadow-sm resize-none"
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900">
                    <button
                        type="submit"
                        form="reservation-form"
                        disabled={!isFormValid}
                        className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-base transition-all shadow-sm ${
                            isFormValid
                                ? 'bg-violet-600 hover:bg-violet-700 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                        }`}
                    >
                        <Save className="w-5 h-5" />
                        Tiếp tục
                    </button>
                </div>
            </div>
        </div>
    );
}
