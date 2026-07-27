import {
    Activity,
    AlertCircle,
    ArrowDownLeft,
    ArrowUpRight,
    Trash2,
} from 'lucide-react';
import React from 'react';
import type { SystemLogEntry } from '@/pages/staff/pos/components/POSLogTab';

interface KitchenLogPanelProps {
    logs: SystemLogEntry[];
    onClearLogs: () => void;
}

export default function KitchenLogPanel({
    logs,
    onClearLogs,
}: KitchenLogPanelProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
                <div className="flex items-center space-x-1.5 text-zinc-800 dark:text-zinc-200">
                    <Activity className="h-3.5 w-3.5 stroke-[1.5] text-amber-600 dark:text-amber-400" />
                    <span className="font-display text-xs font-bold">
                        Nhật ký Bếp
                    </span>
                </div>
                {logs.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearLogs}
                        className="rounded-md p-1 text-zinc-400 transition-colors hover:text-rose-500"
                        title="Xóa nhật ký"
                    >
                        <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 font-mono text-[11px]">
                {logs.length === 0 ? (
                    <div className="flex h-full items-center justify-center py-4 text-xs text-zinc-400">
                        Chưa có nhật ký sự kiện.
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className={`flex items-start space-x-1.5 rounded-lg border p-1.5 ${
                                log.type === 'error'
                                    ? 'border-rose-300 bg-rose-50/90 font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
                                    : 'border-zinc-200/60 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200'
                            }`}
                        >
                            <span
                                className={`shrink-0 font-bold tabular-nums ${log.type === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}
                            >
                                {log.timestamp}
                            </span>
                            <span
                                className={`py-0.2 flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-[9px] font-bold uppercase ${
                                    log.type === 'error'
                                        ? 'border border-rose-700 bg-rose-600 text-white shadow-xs'
                                        : log.type === 'sent'
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                            >
                                {log.type === 'error' ? (
                                    <>
                                        <AlertCircle className="h-2.5 w-2.5 stroke-[1.5]" />{' '}
                                        Lỗi
                                    </>
                                ) : log.type === 'sent' ? (
                                    <>
                                        <ArrowUpRight className="h-2.5 w-2.5 stroke-[1.5]" />{' '}
                                        Gửi
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownLeft className="h-2.5 w-2.5 stroke-[1.5]" />{' '}
                                        Nhận
                                    </>
                                )}
                            </span>
                            <span className="flex-1 break-words">
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
