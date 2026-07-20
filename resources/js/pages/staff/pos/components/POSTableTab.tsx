import React from 'react';

export interface POSTableData {
    id: number;
    table_number: string;
    capacity: number;
    area: string;
    status: 'available' | 'occupied' | 'reserved' | 'maintenance';
    active_order?: {
        id: number;
        order_code: string;
        subtotal: number;
        vat_amount: number;
        total: number;
        items: Array<{
            id: number;
            menu_item_id: number;
            quantity: number;
            unit_price: number;
            subtotal: number;
            note?: string | null;
            menu_item?: {
                id: number;
                name: string;
                price: number;
                vat_rate: number;
            };
        }>;
    } | null;
}

interface POSTableTabProps {
    tables: POSTableData[];
    selectedTable: POSTableData | null;
    onSelectTable: (table: POSTableData) => void;
}

export default function POSTableTab({ tables, selectedTable, onSelectTable }: POSTableTabProps) {
    const groupedAreas = tables.reduce((acc, table) => {
        const areaName = table.area || 'Khác';
        if (!acc[areaName]) acc[areaName] = [];
        acc[areaName].push(table);
        return acc;
    }, {} as Record<string, POSTableData[]>);

    return (
        <div className="h-full overflow-y-auto pr-1 space-y-5">
            {Object.entries(groupedAreas).map(([areaName, areaTables]) => (
                <div key={areaName} className="space-y-3">
                    <div className="flex items-center space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                            {areaName} <span className="text-zinc-400 font-normal">({areaTables.length} bàn)</span>
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {areaTables.map((table) => {
                            const isSelected = selectedTable?.id === table.id;
                            const isOccupied = table.status === 'occupied';

                            return (
                                <div
                                    key={table.id}
                                    onClick={() => onSelectTable(table)}
                                    className={`relative cursor-pointer p-3.5 rounded-xl border-2 transition-all select-none flex flex-col justify-between h-28 ${
                                        isSelected
                                            ? 'border-blue-600 bg-blue-50/90 dark:bg-blue-950/70 shadow-md ring-2 ring-blue-500/40'
                                            : isOccupied
                                            ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 hover:border-amber-500'
                                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className="font-black text-base text-zinc-900 dark:text-zinc-100">
                                            {table.table_number}
                                        </span>
                                        <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                isOccupied
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200'
                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                            }`}
                                        >
                                            {isOccupied ? 'Đang dùng' : 'Trống'}
                                        </span>
                                    </div>

                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                                        <span>🪑 {table.capacity} ghế</span>
                                        {table.active_order && (
                                            <span className="font-bold text-amber-700 dark:text-amber-300">
                                                {table.active_order.items?.length || 0} món
                                            </span>
                                        )}
                                    </div>

                                    {isSelected && (
                                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shadow-xs">
                                            ✓
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
