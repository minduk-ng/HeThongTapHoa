import {
    Activity,
    AlertCircle,
    ArrowDownLeft,
    ArrowUpRight,
    Trash2,
} from 'lucide-react';
import React from 'react';

export interface SystemLogEntry {
    id: string;
    timestamp: string;
    type: 'sent' | 'received' | 'error';
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
        <div className="flex h-full min-h-0 flex-col space-y-3">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
                <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100">
                    <Activity className="h-4 w-4 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                    <h3 className="font-display text-sm font-bold">
                        Lịch sử Hoạt động Realtime
                    </h3>
                </div>
                {logs.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearLogs}
                        className="flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
                    >
                        <Trash2 className="h-3 w-3 stroke-[1.5]" />
                        <span>Xóa nhật ký</span>
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 font-mono text-xs">
                {logs.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center space-y-1 py-8 text-xs text-zinc-400">
                        <Activity className="h-8 w-8 stroke-[1.5] text-zinc-300 dark:text-zinc-700" />
                        <span>
                            Chưa có nhật ký hoạt động nào được ghi nhận.
                        </span>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className={`flex items-start space-x-2 rounded-xl border p-2.5 transition-colors ${
                                log.type === 'error'
                                    ? 'border-rose-300 bg-rose-50/90 font-semibold text-rose-900 dark:border-rose-900/80 dark:bg-rose-950/50 dark:text-rose-200'
                                    : 'border-zinc-200/80 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-200'
                            }`}
                        >
                            <span
                                className={`shrink-0 font-bold tabular-nums ${log.type === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}
                            >
                                {log.timestamp}
                            </span>
                            <span
                                className={`flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                    log.type === 'error'
                                        ? 'border border-rose-700 bg-rose-600 text-white shadow-xs'
                                        : log.type === 'sent'
                                          ? 'border border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                          : 'border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                            >
                                {log.type === 'error' ? (
                                    <>
                                        <AlertCircle className="h-3 w-3 stroke-[1.5]" />{' '}
                                        Lỗi
                                    </>
                                ) : log.type === 'sent' ? (
                                    <>
                                        <ArrowUpRight className="h-3 w-3 stroke-[1.5]" />{' '}
                                        Gửi
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownLeft className="h-3 w-3 stroke-[1.5]" />{' '}
                                        Nhận
                                    </>
                                )}
                            </span>
                            <div className="flex-1 break-words">
                                {log.message}
                                {log.details && (
                                    <span
                                        className={`mt-0.5 block text-[11px] ${log.type === 'error' ? 'font-normal text-rose-700 dark:text-rose-300' : 'font-normal text-zinc-400'}`}
                                    >
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
