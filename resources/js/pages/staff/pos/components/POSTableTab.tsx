import { Users, Check, ArrowRightLeft, ShoppingBag } from 'lucide-react';
import React, { useState } from 'react';
import type { CheckoutLockInfo } from '../hooks/usePOSCheckoutLock';
import type { POSTableData } from '../types/pos.types';

/** Virtual table ID for takeaway orders (table_id = null in backend) */
export const TAKEAWAY_TABLE_ID = 0;

interface POSTableTabProps {
    tables: POSTableData[];
    selectedTable: POSTableData | null;
    onSelectTable: (table: POSTableData) => void;
    lockedCheckoutTables?: Record<number, CheckoutLockInfo>;
    draftTableCounts?: Record<number, number>;
    autoSwitchToMenu?: boolean;
    onAutoSwitchChange?: (value: boolean) => void;
    searchQuery: string;
}

export default function POSTableTab({
    tables,
    selectedTable,
    onSelectTable,
    lockedCheckoutTables = {},
    draftTableCounts = {},
    autoSwitchToMenu = false,
    onAutoSwitchChange,
    searchQuery,
}: POSTableTabProps) {
    const safeTables = (
        Array.isArray(tables) ? tables : Object.values(tables || {})
    ) as POSTableData[];

    const groupedAreas = safeTables.reduce(
        (acc, table) => {
            const areaName = table.area || 'Khác';

            if (!acc[areaName]) {
acc[areaName] = [];
}

            acc[areaName].push(table);

            return acc;
        },
        {} as Record<string, POSTableData[]>,
    );

    // Sort tables by table_number within each area (natural sort)
    Object.values(groupedAreas).forEach((areaTables) => {
        areaTables.sort((a, b) =>
            a.table_number.localeCompare(b.table_number, undefined, {
                numeric: true,
            }),
        );
    });

    // Ensure "Mang đi (Takeaway)" appears first
    const sortedAreaEntries = Object.entries(groupedAreas).sort(([a], [b]) => {
        if (a.includes('Mang đi')) {
return -1;
}

        if (b.includes('Mang đi')) {
return 1;
}

        return a.localeCompare(b);
    });

    const [selectedArea, setSelectedArea] = useState<string>('all');

    // Build area names list with counts
    const areaOptions = sortedAreaEntries.map(([areaName, areaTables]) => ({
        name: areaName,
        count: areaTables.length,
    }));

    // Filter displayed entries based on selected area and search query
    const filteredTables = (
        selectedArea === 'all'
            ? [...safeTables].sort((a, b) => {
                  // Pin Mang đi (id=0) first, then natural sort by table_number
                  if (a.id === TAKEAWAY_TABLE_ID) {
return -1;
}

                  if (b.id === TAKEAWAY_TABLE_ID) {
return 1;
}

                  return a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
              })
            : safeTables.filter((t) => (t.area || 'Khác') === selectedArea)
    ).filter((t) => {
        if (!searchQuery) {
return true;
}

        const q = searchQuery.toLowerCase();

        return (
            t.table_number.toLowerCase().includes(q) ||
            (t.area || '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="flex h-full min-h-0 flex-col space-y-3">
            {/* Area Filter Pills */}
            <div className="no-scrollbar flex shrink-0 items-center space-x-2 overflow-x-auto pb-1">
                <button
                    type="button"
                    onClick={() => setSelectedArea('all')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
                        selectedArea === 'all'
                            ? 'bg-sky-600 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                >
                    Tất cả ({safeTables.length})
                </button>
                {areaOptions.map((area) => (
                    <button
                        key={area.name}
                        type="button"
                        onClick={() => setSelectedArea(area.name)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
                            selectedArea === area.name
                                ? 'bg-sky-600 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                    >
                        {area.name} ({area.count})
                    </button>
                ))}
            </div>

            {/* Scrollable Table Grid */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 lg:grid-cols-4">
                    {filteredTables.map((table) => {
                        const isSelected = selectedTable?.id === table.id;
                        const isOccupied = table.status === 'occupied';
                        const isReserved = table.status === 'reserved';
                        const draftCount = draftTableCounts[table.id] || 0;
                        const isDrafting =
                            !isOccupied && !isReserved && draftCount > 0;

                        // Total count of items across all orders in current table session
                        const totalSessionItemsCount = table.active_orders
                            ? table.active_orders.reduce(
                                  (sum, order) =>
                                      sum + (order.items?.length || 0),
                                  0,
                              )
                            : table.active_order?.items?.length || 0;

                        const resTimeStr = table.reservation_time
                            ? new Date(
                                  table.reservation_time,
                              ).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '';

                        const grpId = table.merged_into_table_id || table.id;
                        const grpTableIds = safeTables
                            .filter(
                                (t) =>
                                    t.id === grpId ||
                                    t.merged_into_table_id === grpId,
                            )
                            .map((t) => t.id);
                        const groupLockInfo = grpTableIds
                            .map((id) => lockedCheckoutTables[id])
                            .find(Boolean);

                        return (
                            <div
                                key={table.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectTable(table)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectTable(table);
                                    }
                                }}
                                className={`relative flex h-28 cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition-colors duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                    isSelected
                                        ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/50'
                                        : isOccupied
                                          ? 'border-amber-300 bg-amber-50/60 hover:border-amber-400 dark:bg-amber-950/30'
                                          : isReserved
                                            ? 'border-purple-300 bg-purple-50/60 hover:border-purple-400 dark:bg-purple-950/30'
                                            : isDrafting
                                              ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300 dark:bg-amber-950/20'
                                              : 'border-zinc-200 bg-white hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-500'
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <span className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100">
                                        {table.table_number}
                                    </span>
                                    <div className="flex flex-col items-end gap-1">
                                        <span
                                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                                                isOccupied
                                                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300'
                                                    : isReserved
                                                      ? 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900/60 dark:bg-purple-950/60 dark:text-purple-300'
                                                      : isDrafting
                                                        ? 'border-amber-300 bg-amber-100 font-bold text-amber-900 dark:border-amber-800/80 dark:bg-amber-900/60 dark:text-amber-200'
                                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300'
                                            }`}
                                        >
                                            {table.merged_into_table_id ||
                                            table.merged_into_table
                                                ? `Gộp với ${table.merged_into_table?.table_number || `Bàn #${table.merged_into_table_id}`}`
                                                : isOccupied
                                                  ? 'Đang dùng'
                                                  : isReserved
                                                    ? `Đặt trước ${resTimeStr ? `(${resTimeStr})` : ''}`
                                                    : isDrafting
                                                      ? `Chuẩn bị (${draftCount} món)`
                                                      : 'Trống'}
                                        </span>

                                        {groupLockInfo && (
                                            <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:border-rose-800/60 dark:bg-rose-950/60">
                                                Đang thanh toán:{' '}
                                                {groupLockInfo.employeeName}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                                    {table.id === TAKEAWAY_TABLE_ID ? (
                                        <span className="flex items-center gap-1">
                                            <ShoppingBag className="h-3.5 w-3.5 stroke-[1.5]" />
                                            Không tại bàn
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5 stroke-[1.5]" />
                                            {table.capacity} ghế
                                        </span>
                                    )}
                                    {totalSessionItemsCount > 0 && (
                                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                                            {totalSessionItemsCount} món
                                        </span>
                                    )}
                                </div>

                                {isSelected && (
                                    <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Auto-switch to menu toggle */}
            <div className="shrink-0 border-t border-zinc-200/80 pt-2 dark:border-zinc-800/80">
                <button
                    type="button"
                    onClick={() => onAutoSwitchChange?.(!autoSwitchToMenu)}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                        autoSwitchToMenu
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                    }`}
                >
                    <div
                        className={`relative h-4 w-7 rounded-full transition-colors duration-150 ${
                            autoSwitchToMenu
                                ? 'bg-sky-600'
                                : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                    >
                        <div
                            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                                autoSwitchToMenu
                                    ? 'translate-x-3.5'
                                    : 'translate-x-0.5'
                            }`}
                        />
                    </div>
                    <ArrowRightLeft className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Mở menu khi chọn bàn</span>
                </button>
            </div>
        </div>
    );
}
