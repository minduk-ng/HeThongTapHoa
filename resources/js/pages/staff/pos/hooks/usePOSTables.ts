import { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { POSTableData } from '../types/pos.types';

export function usePOSTables(tables: POSTableData[]) {
    const [selectedTable, setSelectedTable] = useState<POSTableData | null>(tables[0] || null);
    const [pendingReservationTable, setPendingReservationTable] = useState<POSTableData | null>(null);
    const [acknowledgedReservations, setAcknowledgedReservations] = useState<Record<number, boolean>>({});

    // Non-blocking 5s background refresh for table session updates
    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({
                only: ['tables'],
                onError: () => { /* silently skip if server/DB is unreachable */ },
            });
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const handleSelectTable = (table: POSTableData) => {
        if (table.status === 'reserved' && !acknowledgedReservations[table.id]) {
            setPendingReservationTable(table);
            return;
        }
        setSelectedTable(table);
    };

    const handleConfirmReservationPrompt = () => {
        if (!pendingReservationTable) return;
        setAcknowledgedReservations((prev) => ({ ...prev, [pendingReservationTable.id]: true }));
        setSelectedTable(pendingReservationTable);
        setPendingReservationTable(null);
    };

    return {
        selectedTable,
        setSelectedTable,
        pendingReservationTable,
        setPendingReservationTable,
        acknowledgedReservations,
        handleSelectTable,
        handleConfirmReservationPrompt,
    };
}
