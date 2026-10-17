import { router } from '@inertiajs/react';
import {
    AlertTriangle,
    CalendarClock,
    Check,
    Clock,
    Pencil,
    Printer,
    X,
    XCircle,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type { QueueCommand } from '../../../../lib/commandQueue';
import type { QueueGroup } from '../utils/dispatchQueue';
import { isGroupLongWait } from '../utils/dispatchQueue';

export interface KitchenOrderData {
    id: number;
    order_code: string;
    created_at: string;
    status?: string;
    note?: string | null;
    has_additional_items?: boolean;
    table?: {
        id: number;
        table_number: string;
        area: string;
    } | null;
    items: Array<{
        id: number;
        quantity: number;
        unit_price: number;
        status: 'pending' | 'processing' | 'completed' | 'cancelled';
        note?: string | null;
        created_at?: string;
        menu_item?: {
            id: number;
            name: string;
            category?: {
                id: number;
                name: string;
            } | null;
        };
    }>;
}

interface KitchenOrderCardProps {
    order: KitchenOrderData;
    group?: QueueGroup;
    nowMs?: number;
    canManageDeadline?: boolean;
    isDisconnected?: boolean;
    queueCommands: QueueCommand[];
    onEnqueue: (
        type: 'kitchen.complete' | 'kitchen.complete-items',
        url: string,
        payload: Record<string, unknown>,
    ) => void;
    onRetry: (commandId: string) => void;
    onDiscard: (commandId: string) => void;
    onPrint: (order: KitchenOrderData) => void;
    density?: 'compact' | 'normal' | 'comfortable';
    cardMode?: 'auto' | 'compact';
}

export default function KitchenOrderCard({
    order,
    group,
    nowMs,
    canManageDeadline = false,
    isDisconnected = false,
    queueCommands,
    onEnqueue,
    onRetry,
    onDiscard,
    onPrint,
    density = 'normal',
    cardMode = 'auto',
}: KitchenOrderCardProps) {
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(
        () => {
            const initial: Record<number, boolean> = {};
            const items = group ? group.items : order.items;

            items.forEach((item) => {
                if (item.status === 'completed') {
                    initial[item.id] = true;
                }
            });

            return initial;
        },
    );

    const [localNowTime, setLocalNowTime] = useState(() => Date.now());

    // Update fallback elapsed timer periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setLocalNowTime(Date.now());
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // Sync state when order/group items change
    useEffect(() => {
        queueMicrotask(() => {
            setCheckedItems((prev) => {
                const next = { ...prev };
                const items = group ? group.items : order.items;

                items.forEach((item) => {
                    if (item.status === 'completed') {
                        next[item.id] = true;
                    }
                });

                return next;
            });
        });
    }, [order.items, group]);

    // Deadline edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [deadlineInput, setDeadlineInput] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmittingDeadline, setIsSubmittingDeadline] = useState(false);
    const [deadlineError, setDeadlineError] = useState<string | null>(null);

    const openEditDeadline = () => {
        if (!group || isDisconnected) {
            return;
        }

        const d = new Date(group.deadlineAt);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

        setDeadlineInput(formatted);
        setReason('');
        setDeadlineError(null);
        setIsEditModalOpen(true);
    };

    const addMinutesToDeadline = (minutes: number) => {
        const current = deadlineInput
            ? new Date(deadlineInput)
            : new Date(group?.deadlineAt || Date.now());
        const updated = new Date(current.getTime() + minutes * 60000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        setDeadlineInput(
            `${updated.getFullYear()}-${pad(updated.getMonth() + 1)}-${pad(updated.getDate())}T${pad(updated.getHours())}:${pad(updated.getMinutes())}`,
        );
    };

    const handleSubmitDeadline = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!group) {
            return;
        }

        const trimmedReason = reason.trim();

        if (!trimmedReason) {
            setDeadlineError(
                'Vui lòng nhập lý do thay đổi hạn (bắt buộc, tối đa 255 ký tự).',
            );

            return;
        }

        if (trimmedReason.length > 255) {
            setDeadlineError('Lý do không được vượt quá 255 ký tự.');

            return;
        }

        if (!deadlineInput) {
            setDeadlineError('Vui lòng chọn thời hạn mới.');

            return;
        }

        setIsSubmittingDeadline(true);
        setDeadlineError(null);

        try {
            const deadlineIso = new Date(deadlineInput).toISOString();
            const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
            const csrfToken = match ? decodeURIComponent(match[1]) : '';

            const response = await fetch(
                `/staff/kitchen/work-groups/${group.id}/deadline`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        deadline_at: deadlineIso,
                        reason: trimmedReason,
                        expected_version: group.version,
                    }),
                },
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setDeadlineError(
                    data.message ||
                        data.error ||
                        `Lỗi cập nhật hạn (${response.status})`,
                );
                setIsSubmittingDeadline(false);

                // On deadline failure: keep old value, show server message, no optimistic update
                return;
            }

            setIsSubmittingDeadline(false);
            setIsEditModalOpen(false);

            router.reload({
                only: [
                    'workGroups',
                    'serverNow',
                    'orders',
                    'stats',
                    'stations',
                    'dispatchSettings',
                    'categoryStations',
                    'kitchenReadiness',
                ],
                onError: () => {},
            });
        } catch {
            setIsSubmittingDeadline(false);
            setDeadlineError('Lỗi kết nối khi cập nhật thời hạn điều phối.');
        }
    };

    // Calculate wait and deadlines
    const effectiveNowMs = nowMs ?? localNowTime;
    let elapsedMinutes = 0;
    let isLongWait = false;
    let isOverdue = false;
    let deadlineLabel = '';

    if (group) {
        const sentAtMs = Date.parse(group.sentAt);
        const deadlineMs = Date.parse(group.deadlineAt);

        elapsedMinutes = Math.max(
            0,
            Math.floor((effectiveNowMs - sentAtMs) / 60000),
        );
        isLongWait = isGroupLongWait(group, effectiveNowMs);
        isOverdue = effectiveNowMs > deadlineMs;
        deadlineLabel = new Date(group.deadlineAt).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    } else {
        const pendingItems = order.items.filter(
            (item) => item.status === 'pending',
        );
        const referenceTime =
            pendingItems.length > 0
                ? pendingItems.reduce((oldest, item) => {
                      if (!item.created_at) {
                          return oldest;
                      }

                      return new Date(item.created_at).getTime() <
                          new Date(oldest).getTime()
                          ? item.created_at
                          : oldest;
                  }, pendingItems[0].created_at || order.created_at)
                : order.created_at;

        const createdAtTime = new Date(referenceTime).getTime();
        elapsedMinutes = Math.max(
            0,
            Math.floor((effectiveNowMs - createdAtTime) / 60000),
        );
    }

    const isOver10Mins = !group && elapsedMinutes >= 10;
    const hasAdditional = order.has_additional_items;

    const displayItems = group
        ? group.items.map((gi) => ({
              id: gi.id,
              name: gi.name,
              quantity: gi.quantity,
              status: gi.status,
              note: gi.note,
          }))
        : order.items.map((oi) => ({
              id: oi.id,
              name: oi.menu_item?.name || 'Món ăn',
              quantity: oi.quantity,
              status: oi.status,
              note: oi.note,
          }));

    const completedItemsCount = displayItems.filter(
        (i) => checkedItems[i.id] || i.status === 'completed',
    ).length;

    const toggleCheckItem = (itemId: number) => {
        setCheckedItems((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }));
    };

    const pendItems = displayItems.filter((i) => i.status !== 'completed');
    const checkedItemIds = pendItems
        .filter((i) => checkedItems[i.id])
        .map((i) => i.id);
    const isPartial = checkedItemIds.length > 0;

    // Commands queued for this order
    const cardCommands = queueCommands.filter(
        (c) => (c.payload.order_id as number) === order.id,
    );
    const hasSyncing = cardCommands.some(
        (c) => c.status === 'pending' || c.status === 'flushing',
    );
    const failed = cardCommands.find((c) => c.status === 'failed');

    const handleCompleteOrder = () => {
        const subjectIds = isPartial
            ? checkedItemIds
            : pendItems.map((i) => i.id);

        const isPaidOrder = order.status === 'paid';

        // Paid-order groups use item-level completion only.
        // Group cards or partial checklists also always use item-level completion.
        if (group || isPaidOrder || isPartial) {
            onEnqueue(
                'kitchen.complete-items',
                '/staff/kitchen/complete-items',
                {
                    order_id: order.id,
                    item_ids: subjectIds,
                },
            );
        } else {
            onEnqueue(
                'kitchen.complete',
                `/staff/kitchen/complete/${order.id}`,
                {
                    order_id: order.id,
                },
            );
        }

        // Optimistic: mark subject items completed locally
        setCheckedItems((prev) => {
            const next = { ...prev };
            subjectIds.forEach((id) => {
                next[id] = true;
            });

            return next;
        });
    };

    const handleRetryFailed = () => {
        if (failed) {
            onRetry(failed.id);
        }
    };

    const handleDiscardFailed = () => {
        if (!failed) {
            return;
        }

        onDiscard(failed.id);

        const failedIds: number[] = Array.isArray(failed.payload.item_ids)
            ? (failed.payload.item_ids as number[])
            : displayItems
                  .filter((i) => i.status !== 'completed')
                  .map((i) => i.id);

        setCheckedItems((prev) => {
            const next = { ...prev };
            failedIds.forEach((id) => {
                delete next[id];
            });

            return next;
        });
    };

    const handlePrintTicket = () => {
        if (group) {
            onPrint({
                ...order,
                items: group.items.map((gi) => ({
                    id: gi.id,
                    quantity: gi.quantity,
                    unit_price: 0,
                    status: gi.status as any,
                    note: gi.note,
                    created_at: group.sentAt,
                    menu_item: {
                        id: 0,
                        name: gi.name,
                    },
                })),
            });
        } else {
            onPrint(order);
        }
    };

    // Header styling & Alert-driven coloring
    const isAlert = isOverdue || isLongWait || isOver10Mins || hasAdditional;

    let headerBgClass =
        'bg-zinc-100 dark:bg-zinc-800/90 border-b border-zinc-200/80 dark:border-zinc-700/60';
    let cardBorderClass = 'border-zinc-200/80 dark:border-zinc-800 shadow-xs';
    let codeClass = 'text-zinc-500 dark:text-zinc-400';
    let tableTitleClass = 'text-zinc-900 dark:text-zinc-100';
    let stationBadgeClass = 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200';
    let timeBadgeClass = 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200';
    let progressBadgeClass = 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200';
    let subBorderClass = 'border-zinc-200 dark:border-zinc-700/60';
    let subTextClass = 'text-zinc-600 dark:text-zinc-300';

    if (isOverdue) {
        headerBgClass =
            'bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-700/90 dark:to-rose-800/90 text-white animate-pulse shadow-xs';
        cardBorderClass = 'border-rose-400 dark:border-rose-800/80 shadow-md shadow-rose-500/10 ring-1 ring-rose-500/20';
        codeClass = 'text-white/85';
        tableTitleClass = 'text-white';
        stationBadgeClass = 'bg-white/20 text-white';
        timeBadgeClass = 'bg-black/25 text-white';
        progressBadgeClass = 'bg-white/20 text-white';
        subBorderClass = 'border-white/15';
        subTextClass = 'text-white/90';
    } else if (isLongWait || isOver10Mins || hasAdditional) {
        headerBgClass =
            'bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600/90 dark:to-amber-700/90 text-white shadow-xs';
        cardBorderClass = 'border-amber-400 dark:border-amber-800/80 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/20';
        codeClass = 'text-white/85';
        tableTitleClass = 'text-white';
        stationBadgeClass = 'bg-white/20 text-white';
        timeBadgeClass = 'bg-black/25 text-white';
        progressBadgeClass = 'bg-white/20 text-white';
        subBorderClass = 'border-white/15';
        subTextClass = 'text-white/90';
    }

    return (
        <div
            className={`border bg-white dark:bg-zinc-900 ${cardBorderClass} flex w-full flex-col justify-between overflow-hidden rounded-2xl transition-all duration-200 hover:shadow-md`}
        >
            {/* Header */}
            <div className={`p-3 ${headerBgClass} space-y-1.5`}>
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`block font-mono text-[11px] font-bold tracking-wider uppercase ${codeClass}`}>
                                {order.order_code}
                            </span>
                            {group && (
                                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${stationBadgeClass}`}>
                                    {group.stationName}
                                </span>
                            )}
                            {isLongWait && (
                                <span className="rounded-md border border-amber-300/40 bg-amber-400/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
                                    Chờ lâu
                                </span>
                            )}
                            {isOverdue && (
                                <span className="rounded-md border border-rose-300/40 bg-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-100">
                                    Quá hạn
                                </span>
                            )}
                            {group?.origin === 'legacy_item' && (
                                <span
                                    className="rounded-md border border-zinc-400/30 bg-zinc-600/50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200"
                                    title="Thời gian gửi ước lượng"
                                >
                                    Ước lượng
                                </span>
                            )}
                        </div>
                        <h3 className={`mt-1 flex flex-wrap items-center gap-1.5 font-display text-lg leading-tight font-bold ${tableTitleClass}`}>
                            <span>
                                {order.table?.table_number || 'Mang về'}
                            </span>
                            {hasAdditional && (
                                <span className="inline-flex shrink-0 items-center space-x-0.5 rounded-md border border-amber-300/40 bg-amber-300/35 px-1.5 py-0.5 text-[11px] font-semibold text-amber-100">
                                    <AlertTriangle className="h-2.5 w-2.5 stroke-[1.5]" />
                                    <span>Gọi thêm</span>
                                </span>
                            )}
                        </h3>
                    </div>
                    <div className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${timeBadgeClass}`}>
                        <Clock className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span className="tabular-nums">{elapsedMinutes}'</span>
                    </div>
                </div>

                <div className={`flex items-center justify-between border-t pt-1.5 text-xs ${subBorderClass} ${subTextClass}`}>
                    {group ? (
                        <div className="flex items-center gap-1.5">
                            <span className="opacity-80">Hạn:</span>
                            <span className="font-mono font-bold">
                                {deadlineLabel}
                            </span>
                            {canManageDeadline && (
                                <button
                                    type="button"
                                    onClick={openEditDeadline}
                                    disabled={isDisconnected}
                                    className="rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/20 disabled:opacity-40"
                                    title={
                                        isDisconnected
                                            ? 'Không thể sửa hạn khi mất kết nối mạng'
                                            : 'Chỉnh sửa hạn điều phối'
                                    }
                                >
                                    <Pencil className="h-3 w-3 stroke-[2]" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <span className="font-medium opacity-80">
                            Tiến độ pha chế
                        </span>
                    )}
                    <span className={`rounded-md px-2 py-0.5 font-bold tabular-nums ${progressBadgeClass}`}>
                        {completedItemsCount}/{displayItems.length} món
                    </span>
                </div>
            </div>

            {/* Checklist */}
            <div className="min-h-0 max-h-96 flex-1 divide-y divide-zinc-100 overflow-y-auto px-4 py-2 dark:divide-zinc-800/60">
                {displayItems
                    .filter((item) => item.status !== 'completed')
                    .map((item) => {
                        const isChecked = !!checkedItems[item.id];
                        const rowPaddingClass =
                            density === 'compact'
                                ? 'py-1.5'
                                : density === 'comfortable'
                                  ? 'py-3.5'
                                  : 'py-2.5';

                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleCheckItem(item.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 ${rowPaddingClass} transition-all duration-150 select-none ${
                                    isChecked
                                        ? 'line-through opacity-50'
                                        : 'hover:text-sky-600 dark:hover:text-sky-400'
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-center space-x-3">
                                    <div
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-150 ${
                                            isChecked
                                                ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500'
                                                : 'border-zinc-300 bg-white hover:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-sky-400'
                                        }`}
                                    >
                                        {isChecked && (
                                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={`block text-base font-extrabold break-words whitespace-normal text-zinc-900 dark:text-zinc-100 ${isChecked ? 'text-zinc-400 dark:text-zinc-500' : ''}`}
                                        >
                                            {item.name}
                                        </span>
                                        {item.note && (
                                            <span className="mt-1 block w-fit max-w-full rounded border border-amber-100/60 bg-amber-50 px-1.5 py-0.5 text-xs font-medium break-words whitespace-normal text-amber-600 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                                                Ghi chú: {item.note}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center">
                                    <span className="rounded-lg bg-sky-50/60 px-2.5 py-1 text-sm font-black text-sky-700 tabular-nums dark:bg-sky-950/30 dark:text-sky-300">
                                        {item.quantity} ly/phần
                                    </span>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Complete / Actions Footer */}
            <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/80 p-3.5 dark:border-zinc-800/40 dark:bg-zinc-900/20">
                {failed && (
                    <div className="dark:text-rose-350 flex items-center justify-between gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                            <span className="truncate">
                                {failed.error ||
                                    'Không thể đồng bộ. Kiểm tra mạng và thử lại.'}
                            </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={handleRetryFailed}
                                className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-rose-700"
                            >
                                Thử lại
                            </button>
                            <button
                                type="button"
                                onClick={handleDiscardFailed}
                                className="rounded-md border border-rose-300 px-2 py-1 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
                            >
                                Bỏ qua
                            </button>
                        </div>
                    </div>
                )}
                <button
                    type="button"
                    onClick={handlePrintTicket}
                    className="flex w-full items-center justify-center space-x-2 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                    <Printer className="h-4 w-4 stroke-[2]" />
                    <span>In ticket</span>
                </button>
                <button
                    type="button"
                    disabled={hasSyncing}
                    onClick={handleCompleteOrder}
                    className="flex w-full items-center justify-center space-x-2 rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-sky-700 disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                    <Check className="h-4 w-4 stroke-[2]" />
                    <span>
                        {hasSyncing
                            ? 'Đang đồng bộ…'
                            : isPartial
                              ? `Hoàn thành ${checkedItemIds.length}/${pendItems.length} món`
                              : group
                                ? 'Hoàn thành nhóm chế biến'
                                : 'Hoàn thành toàn bộ đơn'}
                    </span>
                </button>
            </div>

            {/* Deadline Edit Modal */}
            {isEditModalOpen && group && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <div className="flex items-center space-x-2">
                                <CalendarClock className="h-5 w-5 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                                <h3 className="font-display text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    Điều chỉnh hạn điều phối
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                                <X className="h-4 w-4 stroke-[2]" />
                            </button>
                        </div>

                        <form
                            onSubmit={handleSubmitDeadline}
                            className="mt-4 space-y-4"
                        >
                            <div className="space-y-1 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
                                <div>
                                    Đơn:{' '}
                                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                        {order.order_code}
                                    </span>{' '}
                                    ({order.table?.table_number || 'Mang về'})
                                </div>
                                <div>
                                    Khu vực:{' '}
                                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                        {group.stationName}
                                    </span>{' '}
                                    | Hạn hiện tại:{' '}
                                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                        {deadlineLabel}
                                    </span>
                                </div>
                            </div>

                            {deadlineError && (
                                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                                    <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.5] text-rose-600 dark:text-rose-400" />
                                    <span>{deadlineError}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Thời hạn mới{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={deadlineInput}
                                    onChange={(e) =>
                                        setDeadlineInput(e.target.value)
                                    }
                                    required
                                    className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                />

                                <div className="mt-2 flex items-center gap-1.5">
                                    <span className="text-[11px] text-zinc-400">
                                        Gợi ý:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => addMinutesToDeadline(5)}
                                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                    >
                                        +5p
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addMinutesToDeadline(10)}
                                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                    >
                                        +10p
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addMinutesToDeadline(15)}
                                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                    >
                                        +15p
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addMinutesToDeadline(30)}
                                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                    >
                                        +30p
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                        Lý do thay đổi{' '}
                                        <span className="text-rose-500">*</span>
                                    </label>
                                    <span className="text-[11px] text-zinc-400 tabular-nums">
                                        {reason.trim().length}/255
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={reason}
                                    maxLength={255}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Ví dụ: Khách VIP, Chờ thêm nguyên liệu..."
                                    required
                                    className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                />
                            </div>

                            <div className="flex items-center justify-end space-x-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    disabled={isSubmittingDeadline}
                                    className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={
                                        isSubmittingDeadline ||
                                        reason.trim().length === 0 ||
                                        isDisconnected
                                    }
                                    className="rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {isSubmittingDeadline
                                        ? 'Đang lưu…'
                                        : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
