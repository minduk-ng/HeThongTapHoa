import { useState, useRef, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import { POSTableData, CartItem, ReceiptModalState } from '../types/pos.types';
import { usePOSCheckoutLock } from './usePOSCheckoutLock';

export function usePOSCheckout(
    selectedTable: POSTableData | null = null,
    tables: POSTableData[] = []
) {
    const { auth } = usePage<any>().props;
    const [submitting, setSubmitting] = useState(false);
    const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
    const { lockedCheckoutTables, lockTableCheckout, unlockTableCheckout } = usePOSCheckoutLock();
    const [receiptModal, setReceiptModal] = useState<ReceiptModalState>({
        isOpen: false,
        paymentMethod: 'cash',
        amountReceived: 0,
        changeAmount: 0,
        cartItems: [],
        table: null,
    });

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const togglePaymentDrawer = (open: boolean) => {
        setIsPaymentDrawerOpen(open);
        if (selectedTable) {
            const groupId = selectedTable.merged_into_table_id || selectedTable.id;
            const linkedTableIds = tables
                .filter(
                    (t) =>
                        t.id === groupId ||
                        t.merged_into_table_id === groupId
                )
                .map((t) => t.id);

            if (open) {
                const employeeName = auth?.user?.name || 'Nhân viên';
                lockTableCheckout(selectedTable.id, employeeName, linkedTableIds);
            } else {
                unlockTableCheckout(selectedTable.id, linkedTableIds);
            }
        }
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const dateCode = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    };

    const handleSendToKitchen = (
        selectedTable: POSTableData | null,
        currentCart: CartItem[],
        activeInvoiceId?: string | null,
        onSuccessCallback?: () => void
    ) => {
        if (!selectedTable || currentCart.length === 0 || submitting) return;

        let orderId: number | null = null;
        if (activeInvoiceId && !activeInvoiceId.startsWith('draft_')) {
            const matchedOrder = selectedTable.active_orders?.find(
                (o) => o.order_code === activeInvoiceId || `order_${o.id}` === activeInvoiceId
            ) || selectedTable.active_order;
            if (matchedOrder) {
                orderId = matchedOrder.id;
            }
        }

        const newDeltaItems = currentCart
            .filter((item) => !item.isConfirmed && item.quantity > 0)
            .map((item) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                note: item.note || null,
                vat_rate: item.vat_rate,
            }));

        const reducedItems = currentCart
            .filter((item) => item.isConfirmed && (item.stagedReduceQty || 0) > 0 && item.orderItemId)
            .map((item) => ({
                order_item_id: item.orderItemId!,
                reduce_quantity: item.stagedReduceQty!,
                cancellation_reason: item.stagedReason || 'Khách đổi ý / Khách giảm số lượng',
                note: item.stagedNote || '',
            }));

        if (newDeltaItems.length === 0 && reducedItems.length === 0) return;

        setSubmitting(true);

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        const subtotal = newDeltaItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = newDeltaItems.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal + vatTotal;

        const idempotencyKey = `pos_send_${selectedTable.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const payload = {
            table_id: selectedTable.id,
            order_id: orderId,
            items: newDeltaItems,
            reduced_items: reducedItems,
            subtotal,
            vat_amount: vatTotal,
            total: totalAmount,
            idempotency_key: idempotencyKey,
        };

        router.post('/staff/pos/send-to-kitchen', payload, {
            onSuccess: () => {
                if (selectedTable && onSuccessCallback) {
                    onSuccessCallback();
                }
            },
            onFinish: () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
            },
            onError: () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
            },
        });
    };

    const handleConfirmPayment = (
        selectedTable: POSTableData | null,
        currentCart: CartItem[],
        activeInvoiceId: string | null,
        paymentMethod: 'cash' | 'bank_transfer',
        amountReceived: number,
        changeAmount: number,
        shouldPrint: boolean,
        onSuccessClearCart: () => void
    ) => {
        if (!selectedTable || submitting) return;

        let orderId: number | null = null;
        if (activeInvoiceId && !activeInvoiceId.startsWith('draft_')) {
            const matchedOrder = selectedTable.active_orders?.find(
                (o) => o.order_code === activeInvoiceId || `order_${o.id}` === activeInvoiceId
            ) || selectedTable.active_order;
            if (matchedOrder) {
                orderId = matchedOrder.id;
            }
        }

        if (!orderId) {
            alert('Không thể thanh toán đơn nháp chưa gửi bếp chế biến!');
            return;
        }

        const hasUnconfirmedDrafts = currentCart.some((i) => !i.isConfirmed || (i.stagedReduceQty || 0) > 0);
        if (hasUnconfirmedDrafts) return;

        if (lockedCheckoutTables[selectedTable.id]) {
            return;
        }

        setSubmitting(true);

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setSubmitting(false);
            alert('Kết nối cơ sở dữ liệu/máy chủ quá thời gian chờ (Timeout). Vui lòng thử thanh toán lại!');
        }, 8000);

        const idempotencyKey = `pos_pay_${orderId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const payload = {
            order_id: orderId,
            payment_method: paymentMethod,
            amount_received: amountReceived,
            change_amount: changeAmount,
            idempotency_key: idempotencyKey,
        };

        const snapshotCart = [...currentCart];
        const snapshotTable = { ...selectedTable };

        router.post('/staff/pos/checkout', payload, {
            onSuccess: () => {
                togglePaymentDrawer(false);
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
            onFinish: () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
            },
            onError: (errors) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
                const msg = errors.error || errors.message || 'Thanh toán thất bại do kết nối CSDL chập chờn. Vui lòng thử lại!';
                alert(msg);
            },
        });
    };

    return {
        submitting,
        isPaymentDrawerOpen,
        setIsPaymentDrawerOpen: togglePaymentDrawer,
        lockedCheckoutTables,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
    };
}
