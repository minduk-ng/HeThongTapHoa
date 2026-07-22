import React from 'react';
import { Users, Check } from 'lucide-react';
import { POSTableData } from '../types/pos.types';
import { CheckoutLockInfo } from '../hooks/usePOSCheckoutLock';

interface POSTableTabProps {
    tables: POSTableData[];
    selectedTable: POSTableData | null;
    onSelectTable: (table: POSTableData) => void;
    lockedCheckoutTables?: Record<number, CheckoutLockInfo>;
}

export default function POSTableTab({ tables, selectedTable, onSelectTable, lockedCheckoutTables = {} }: POSTableTabProps) {
    const groupedAreas = tables.reduce((acc, table) => {
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

    return (
        <div className="h-full overflow-y-auto pr-1 space-y-5">
            {sortedAreaEntries.map(([areaName, areaTables]) => (
                <div key={areaName} className="space-y-3">
                    <div className="flex items-center space-x-2 border-b border-zinc-200/80 dark:border-zinc-800/80 pb-2 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                        <span className={`w-2 h-2 rounded-full ${areaName.includes('Mang đi') ? 'bg-amber-500' : 'bg-sky-600'}`}></span>
                        <h3 className="font-display text-sm font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {areaName} <span className="text-zinc-400 font-sans text-xs">({areaTables.length} bàn/vị trí)</span>
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {areaTables.map((table) => {
                            const isSelected = selectedTable?.id === table.id;
                            const isOccupied = table.status === 'occupied';
                            const isReserved = table.status === 'reserved';

                            // Total count of items across all orders in current table session
                            const totalSessionItemsCount = table.active_orders
                                ? table.active_orders.reduce((sum, order) => sum + (order.items?.length || 0), 0)
                                : table.active_order?.items?.length || 0;

                            const resTimeStr = table.reservation_time
                                ? new Date(table.reservation_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                                : '';

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
                                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60'
                                                }`}
                                            >
                                                {isOccupied ? 'Đang dùng' : isReserved ? `Đặt trước ${resTimeStr ? `(${resTimeStr})` : ''}` : 'Trống'}
                                            </span>

                                            {lockedCheckoutTables[table.id] && (
                                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800/60">
                                                    Đang thanh toán: {lockedCheckoutTables[table.id].employeeName}
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
                                            <Check className="w-3 h-3 stroke-[2.5]" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
