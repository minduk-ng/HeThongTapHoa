import { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { POSTableData } from '../types/pos.types';

export function usePOSTables(tables: POSTableData[]) {
    const [selectedTable, setSelectedTable] = useState<POSTableData | null>(tables[0] || null);


    const [draftTableCounts, setDraftTableCounts] = useState<Record<number, number>>({});

    // Realtime WebSocket Listener via Reverb for order status & table updates
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.private('pos-channel');
            channel
                .listen('.OrderSentToKitchen', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })
                .listen('.OrderCompleted', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })
                .listen('.TableStatusUpdated', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })
                .listen('.TableTransferred', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })

            const presence = window.Echo.join('pos-room');
            presence.listenForWhisper('table-draft-cart-updated', (e: { tableId: number; unconfirmedCount: number }) => {
                if (e && e.tableId !== undefined) {
                    setDraftTableCounts((prev) => ({
                        ...prev,
                        [e.tableId]: e.unconfirmedCount || 0,
                    }));
                }
            });

            return () => {
                window.Echo.leave('pos-channel');
            };
        }
    }, []);

    // Sync selectedTable when Inertia reloads tables prop
    useEffect(() => {
        const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
        if (selectedTable) {
            const updated = safeTables.find((t) => t.id === selectedTable.id);
            if (updated) {
                setSelectedTable(updated);
            }
        } else if (safeTables.length > 0) {
            setSelectedTable(safeTables[0] || null);
        }
    }, [tables]);

    const handleSelectTable = (table: POSTableData) => {
        setSelectedTable(table);
    };

    return {
        selectedTable,
        setSelectedTable,
        draftTableCounts,
        handleSelectTable,
    };
}
