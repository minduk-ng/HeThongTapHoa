import { useState, useCallback } from 'react';
import { POSTableData } from '../types/pos.types';

function getCsrfTokenFromCookie(): string {
    if (typeof document === 'undefined') return '';
    const name = 'XSRF-TOKEN=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }
    return '';
}

export function usePOSReservation() {
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Set a table as reserved
     */
    const reserveTable = useCallback(async (
        tableId: number, 
        data: {
            reservation_time: string;
            reservation_name: string;
            reservation_phone: string;
            reservation_note?: string;
            deposit_amount?: number;
        },
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/tables/${tableId}/reserve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                if (onSuccess) onSuccess(result.table);
                return result.table;
            } else {
                throw new Error(result.message || 'Không thể đặt trước bàn');
            }
        } catch (error: any) {
            console.error('Lỗi khi đặt bàn:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Cancel a reservation
     */
    const cancelReservation = useCallback(async (
        tableId: number,
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/tables/${tableId}/cancel-reservation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                if (onSuccess) onSuccess(result.table);
                return result.table;
            } else {
                throw new Error(result.message || 'Không thể huỷ đặt bàn');
            }
        } catch (error: any) {
            console.error('Lỗi khi huỷ đặt bàn:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        reserveTable,
        cancelReservation,
        isLoading
    };
}
