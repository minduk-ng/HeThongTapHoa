import React from 'react';
import { Activity, AlertCircle, ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';
import { SystemLogEntry } from '@/pages/staff/pos/components/POSLogTab';

interface KitchenLogPanelProps {
    logs: SystemLogEntry[];
    onClearLogs: () => void;
}

export default function KitchenLogPanel({ logs, onClearLogs }: KitchenLogPanelProps) {
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/60 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 rounded-xl p-3 space-y-2">
            <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <div className="flex items-center space-x-1.5 text-zinc-800 dark:text-zinc-200">
                    <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[1.5]" />
                    <span className="font-display text-xs font-bold">Nhật ký Bếp</span>
                </div>
                {logs.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearLogs}
                        className="p-1 text-zinc-400 hover:text-rose-500 rounded-md transition-colors"
                        title="Xóa nhật ký"
                    >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5 font-mono text-[11px]">
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-xs py-4">
                        Chưa có nhật ký sự kiện.
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className={`p-1.5 rounded-lg border flex items-start space-x-1.5 ${
                                log.type === 'error'
                                    ? 'bg-rose-50/90 dark:bg-rose-950/60 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-200 font-semibold'
                                    : 'bg-white dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                            }`}
                        >
                            <span className={`tabular-nums font-bold shrink-0 ${log.type === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}>
                                {log.timestamp}
                            </span>
                            <span
                                className={`px-1 py-0.2 text-[9px] font-bold rounded-sm uppercase shrink-0 flex items-center gap-0.5 ${
                                    log.type === 'error'
                                        ? 'bg-rose-600 text-white border border-rose-700 shadow-xs'
                                        : log.type === 'sent'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                            >
                                {log.type === 'error' ? (
                                    <>
                                        <AlertCircle className="w-2.5 h-2.5 stroke-[1.5]" /> Lỗi
                                    </>
                                ) : log.type === 'sent' ? (
                                    <>
                                        <ArrowUpRight className="w-2.5 h-2.5 stroke-[1.5]" /> Gửi
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownLeft className="w-2.5 h-2.5 stroke-[1.5]" /> Nhận
                                    </>
                                )}
                            </span>
                            <span className="break-words flex-1">
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
