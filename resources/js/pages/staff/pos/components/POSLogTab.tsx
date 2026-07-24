import React from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';

export interface SystemLogEntry {
    id: string;
    timestamp: string;
    type: 'sent' | 'received';
    source: 'POS' | 'Kitchen';
    message: string;
    details?: string;
}

interface POSLogTabProps {
    logs: SystemLogEntry[];
    onClearLogs: () => void;
}

export default function POSLogTab({ logs, onClearLogs }: POSLogTabProps) {
    return (
        <div className="h-full flex flex-col min-h-0 space-y-3">
            <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100">
                    <Activity className="w-4 h-4 text-sky-600 dark:text-sky-400 stroke-[1.5]" />
                    <h3 className="font-display text-sm font-bold">Lịch sử Event Realtime</h3>
                </div>
                {logs.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearLogs}
                        className="px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 flex items-center space-x-1"
                    >
                        <Trash2 className="w-3 h-3 stroke-[1.5]" />
                        <span>Xóa log</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 font-mono text-xs">
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs py-8 space-y-1">
                        <Activity className="w-8 h-8 stroke-[1.5] text-zinc-300 dark:text-zinc-700" />
                        <span>Chưa có sự kiện event nào được ghi nhận.</span>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-start space-x-2 transition-colors"
                        >
                            <span className="tabular-nums font-bold text-zinc-400 shrink-0">
                                {log.timestamp}
                            </span>
                            <span
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase shrink-0 flex items-center gap-0.5 ${
                                    log.type === 'sent'
                                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                }`}
                            >
                                {log.type === 'sent' ? (
                                    <>
                                        <ArrowUpRight className="w-3 h-3 stroke-[1.5]" /> Gửi
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownLeft className="w-3 h-3 stroke-[1.5]" /> Nhận
                                    </>
                                )}
                            </span>
                            <div className="flex-1 text-zinc-800 dark:text-zinc-200 break-words">
                                {log.message}
                                {log.details && (
                                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                                        {log.details}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
