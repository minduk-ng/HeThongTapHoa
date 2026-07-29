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
    const [reservationDrafts, setReservationDrafts] = useState<Record<string, import('../types/pos.types').ReservationDraft>>({});

    const getDraftKey = (tableId: number, invoiceId: string) => `${tableId}_${invoiceId}`;

    const getDraft = (tableId: number, invoiceId: string) => reservationDrafts[getDraftKey(tableId, invoiceId)] || null;

    const setDraft = (tableId: number, invoiceId: string, draft: import('../types/pos.types').ReservationDraft) => {
        setReservationDrafts(prev => ({ ...prev, [getDraftKey(tableId, invoiceId)]: draft }));
    };

    const clearDraft = (tableId: number, invoiceId: string) => {
        setReservationDrafts(prev => {
            const next = { ...prev };
            delete next[getDraftKey(tableId, invoiceId)];
            return next;
        });
    };

    /**
     * Set a table as reserved (no deposit, no items)
     * Legacy /staff/pos/tables/{id}/reserve is replaced by /staff/pos/reserve
     */
    const reserveTable = useCallback(async (
        tableId: number, 
        data: {
            reservation_time: string;
            reservation_name: string;
            reservation_phone: string;
            reservation_note?: string;
        },
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/reserve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    table_id: tableId,
                    ...data,
                    items: [],
                    deposit_amount: 0,
                    payment_method: 'cash'
                })
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
     * Submit a reservation with items and deposit
     */
    const submitReservation = useCallback(async (
        data: {
            table_id: number;
            reservation_time: string;
            reservation_name: string;
            reservation_phone: string;
            reservation_note?: string;
            deposit_amount: number;
            payment_method: string;
            items: Array<{ menu_item_id: number; quantity: number }>;
        },
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/reserve`, {
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
     * Check in a reservation
     */
    const checkInReservation = useCallback(async (
        orderId: number,
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/reservation/check-in`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ order_id: orderId })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                if (onSuccess) onSuccess(result.table);
                return result.table;
            } else {
                throw new Error(result.message || 'Không thể nhận bàn');
            }
        } catch (error: any) {
            console.error('Lỗi khi nhận bàn:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Cancel a reservation
     */
    const cancelReservation = useCallback(async (
        orderId: number,
        resolution: 'refund' | 'forfeit' | 'none',
        note?: string,
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/reservation/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    order_id: orderId,
                    resolution,
                    note
                })
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

    /**
     * Submit a deposit for an existing reservation
     */
    const submitDeposit = useCallback(async (
        orderId: number,
        amount: number,
        paymentMethod: string,
        onSuccess?: (table: POSTableData) => void
    ) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/staff/pos/deposit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfTokenFromCookie(),
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    order_id: orderId,
                    amount,
                    payment_method: paymentMethod
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                if (onSuccess) onSuccess(result.table);
                return result.table;
            } else {
                throw new Error(result.message || 'Không thể nạp tiền cọc');
            }
        } catch (error: any) {
            console.error('Lỗi khi nạp tiền cọc:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        reservationDrafts,
        getDraft,
        setDraft,
        clearDraft,
        reserveTable,
        submitReservation,
        checkInReservation,
        cancelReservation,
        submitDeposit,
        isLoading
    };
}
