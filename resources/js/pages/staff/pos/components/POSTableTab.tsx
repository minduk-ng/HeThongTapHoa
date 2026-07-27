import React, { useState } from 'react';
import { Users, Check } from 'lucide-react';
import { POSTableData } from '../types/pos.types';
import { CheckoutLockInfo } from '../hooks/usePOSCheckoutLock';

interface POSTableTabProps {
    tables: POSTableData[];
    selectedTable: POSTableData | null;
    onSelectTable: (table: POSTableData) => void;
    lockedCheckoutTables?: Record<number, CheckoutLockInfo>;
    draftTableCounts?: Record<number, number>;
}

export default function POSTableTab({ tables, selectedTable, onSelectTable, lockedCheckoutTables = {}, draftTableCounts = {} }: POSTableTabProps) {
    const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
    const groupedAreas = safeTables.reduce((acc, table) => {
        const areaName = table.area || 'Khác';
        if (!acc[areaName]) acc[areaName] = [];
        acc[areaName].push(table);
        return acc;
    }, {} as Record<string, POSTableData[]>);

    // Ensure "Mang đi (Takeaway)" appears first
    const sortedAreaEntries = Object.entries(groupedAreas).sort(([a], [b]) => {
        if (a.includes('Mang đi')) return -1;
        if (b.includes('Mang đi')) return 1;
        return a.localeCompare(b);
    });

    const [selectedArea, setSelectedArea] = useState<string>('all');

    // Build area names list with counts
    const areaOptions = sortedAreaEntries.map(([areaName, areaTables]) => ({
        name: areaName,
        count: areaTables.length,
    }));

    // Filter displayed entries based on selected area
    const displayedEntries = selectedArea === 'all'
        ? sortedAreaEntries
        : sortedAreaEntries.filter(([areaName]) => areaName === selectedArea);

    return (
        <div className="h-full flex flex-col min-h-0 space-y-3">
            {/* Area Filter Pills */}
            <div className="shrink-0 flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                    type="button"
                    onClick={() => setSelectedArea('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors duration-150 ${
                        selectedArea === 'all'
                            ? 'bg-sky-600 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                    }`}
                >
                    Tất cả ({safeTables.length})
                </button>
                {areaOptions.map((area) => (
                    <button
                        key={area.name}
                        type="button"
                        onClick={() => setSelectedArea(area.name)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors duration-150 ${
                            selectedArea === area.name
                                ? 'bg-sky-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                        }`}
                    >
                        {area.name} ({area.count})
                    </button>
                ))}
            </div>

            {/* Scrollable Table Grid */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-5">
                {displayedEntries.map(([areaName, areaTables]) => (
                    <div key={areaName} className="space-y-3">
                        {/* Only show area header when "Tất cả" is selected */}
                        {selectedArea === 'all' && (
                            <div className="flex items-center space-x-2 border-b border-zinc-200/80 dark:border-zinc-800/80 pb-2 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                                <span className={`w-2 h-2 rounded-full ${areaName.includes('Mang đi') ? 'bg-amber-500' : 'bg-sky-600'}`}></span>
                                <h3 className="font-display text-sm font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                    {areaName} <span className="text-zinc-400 font-sans text-xs">({areaTables.length} bàn/vị trí)</span>
                                </h3>
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {areaTables.map((table) => {
                                const isSelected = selectedTable?.id === table.id;
                                const isOccupied = table.status === 'occupied';
                                const isReserved = table.status === 'reserved';
                                const draftCount = draftTableCounts[table.id] || 0;
                                const isDrafting = !isOccupied && !isReserved && draftCount > 0;

                                // Total count of items across all orders in current table session
                                const totalSessionItemsCount = table.active_orders
                                    ? table.active_orders.reduce((sum, order) => sum + (order.items?.length || 0), 0)
                                    : table.active_order?.items?.length || 0;

                                const resTimeStr = table.reservation_time
                                    ? new Date(table.reservation_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                                    : '';

                                const grpId = table.merged_into_table_id || table.id;
                                const grpTableIds = safeTables.filter((t) => t.id === grpId || t.merged_into_table_id === grpId).map((t) => t.id);
                                const groupLockInfo = grpTableIds.map((id) => lockedCheckoutTables[id]).find(Boolean);

                                return (
                                    <div
                                        key={table.id}
                                        onClick={() => onSelectTable(table)}
                                        className={`relative cursor-pointer p-3.5 rounded-xl border transition-colors duration-150 select-none flex flex-col justify-between h-28 ${
                                            isSelected
                                                ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/50'
                                                : isOccupied
                                                ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 hover:border-amber-400'
                                                : isReserved
                                                ? 'border-purple-300 bg-purple-50/60 dark:bg-purple-950/30 hover:border-purple-400'
                                                : isDrafting
                                                ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-300'
                                                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100">
                                                {table.table_number}
                                            </span>
                                            <div className="flex flex-col items-end gap-1">
                                                <span
                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                                        isOccupied
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/60'
                                                            : isReserved
                                                            ? 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900/60'
                                                            : isDrafting
                                                            ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-800/80 font-bold'
                                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60'
                                                    }`}
                                                >
                                                    {table.merged_into_table_id || table.merged_into_table
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
                                                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800/60">
                                                        Đang thanh toán: {groupLockInfo.employeeName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5 stroke-[1.5]" />
                                                {table.capacity} ghế
                                            </span>
                                            {totalSessionItemsCount > 0 && (
                                                <span className="font-semibold text-amber-700 dark:text-amber-300">
                                                    {totalSessionItemsCount} món
                                                </span>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">
                                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
