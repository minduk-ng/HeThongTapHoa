import { useState } from 'react';
import { router } from '@inertiajs/react';
import { POSTableData, CartItem, ReceiptModalState } from '../types/pos.types';

export function usePOSCheckout() {
    const [submitting, setSubmitting] = useState(false);
    const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
    const [receiptModal, setReceiptModal] = useState<ReceiptModalState>({
        isOpen: false,
        paymentMethod: 'cash',
        amountReceived: 0,
        changeAmount: 0,
        cartItems: [],
        table: null,
    });

    const dateCode = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    };

    const handleSendToKitchen = (selectedTable: POSTableData | null, currentCart: CartItem[]) => {
        if (!selectedTable || currentCart.length === 0) return;

        const newDeltaItems = currentCart
            .map((item) => {
                const initialQty = item.isConfirmed ? (item.initialQuantity || 0) : 0;
                const newDelta = item.quantity - initialQty;
                if (newDelta > 0) {
                    return {
                        menu_item_id: item.menu_item_id,
                        quantity: newDelta,
                        unit_price: item.unit_price,
                        note: item.note || null,
                        vat_rate: item.vat_rate,
                    };
                }
                return null;
            })
            .filter(Boolean) as Array<{
                menu_item_id: number;
                quantity: number;
                unit_price: number;
                note: string | null;
                vat_rate: number;
            }>;

        if (newDeltaItems.length === 0) return;

        setSubmitting(true);

        const subtotal = newDeltaItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = newDeltaItems.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal + vatTotal;

        const payload = {
            table_id: selectedTable.id,
            items: newDeltaItems,
            subtotal,
            vat_amount: vatTotal,
            total: totalAmount,
        };

        router.post('/staff/pos/send-to-kitchen', payload, {
            onSuccess: () => {
                setSubmitting(false);
            },
            onError: () => {
                setSubmitting(false);
            },
        });
    };

    const handleConfirmPayment = (
        selectedTable: POSTableData | null,
        currentCart: CartItem[],
        paymentMethod: 'cash' | 'bank_transfer',
        amountReceived: number,
        changeAmount: number,
        shouldPrint: boolean,
        onSuccessClearCart: () => void
    ) => {
        if (!selectedTable) return;

        setSubmitting(true);

        const payload = {
            table_id: selectedTable.id,
            payment_method: paymentMethod,
            amount_received: amountReceived,
            change_amount: changeAmount,
        };

        const snapshotCart = [...currentCart];
        const snapshotTable = { ...selectedTable };

        router.post('/staff/pos/checkout', payload, {
            onSuccess: () => {
                setSubmitting(false);
                setIsPaymentDrawerOpen(false);

                onSuccessClearCart();

                if (shouldPrint) {
                    setReceiptModal({
                        isOpen: true,
                        paymentMethod,
                        amountReceived,
                        changeAmount,
                        cartItems: snapshotCart,
                        table: snapshotTable,
                        invoiceCode: 'INV-' + dateCode(),
                    });
                }
            },
            onError: () => {
                setSubmitting(false);
            },
        });
    };

    return {
        submitting,
        isPaymentDrawerOpen,
        setIsPaymentDrawerOpen,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
    };
}
