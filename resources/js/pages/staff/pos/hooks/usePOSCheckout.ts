import { useState, useRef, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import { POSTableData, CartItem, ReceiptModalState } from '../types/pos.types';
import { usePOSCheckoutLock } from './usePOSCheckoutLock';

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

export function usePOSCheckout(
    selectedTable: POSTableData | null = null,
    tables: POSTableData[] = []
) {
    const { auth } = usePage<any>().props;
    const [processingOrders, setProcessingOrders] = useState<Record<number, boolean>>({});
    const [kitchenSubmitting, setKitchenSubmitting] = useState(false);
    const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);

    const submitting = kitchenSubmitting || (selectedTable
        ? (() => {
              const orders = selectedTable.active_orders || (selectedTable.active_order ? [selectedTable.active_order] : []);
              return orders.some((o) => !!processingOrders[o.id]);
          })()
        : false);
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

        setKitchenSubmitting(true);

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setKitchenSubmitting(false);
        }, 8000);

        const subtotal = newDeltaItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = newDeltaItems.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal + vatTotal;

        const idempotencyKey = `pos_send_${selectedTable.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const payload = {
            table_id: selectedTable.id === 0 ? null : selectedTable.id,
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
                setKitchenSubmitting(false);
            },
            onError: (errors) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setKitchenSubmitting(false);
                const firstError = errors && Object.values(errors)[0];
                alert(
                    typeof firstError === 'string'
                        ? firstError
                        : 'Gửi đơn xuống bếp thất bại. Vui lòng thử lại!',
                );
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
        onSuccessClearCart: () => void,
        onLogEntry?: (type: 'sent' | 'received' | 'error', message: string, details?: string) => void
    ) => {
        if (!selectedTable) return;

        let orderId: number | null = null;
        let matchedOrderObj: any = null;
        if (activeInvoiceId && !activeInvoiceId.startsWith('draft_')) {
            const matchedOrder = selectedTable.active_orders?.find(
                (o) => o.order_code === activeInvoiceId || `order_${o.id}` === activeInvoiceId
            ) || selectedTable.active_order;
            if (matchedOrder) {
                orderId = matchedOrder.id;
                matchedOrderObj = matchedOrder;
            }
        }

        if (!orderId) {
            alert('Không thể thanh toán đơn nháp chưa gửi bếp chế biến!');
            return;
        }

        // Prevent duplicate processing
        if (processingOrders[orderId]) return;

        const hasUnconfirmedDrafts = currentCart.some((i) => !i.isConfirmed || (i.stagedReduceQty || 0) > 0);
        if (hasUnconfirmedDrafts) return;

        if (lockedCheckoutTables[selectedTable.id]) {
            return;
        }

        // Lock order status to processing
        setProcessingOrders((prev) => ({ ...prev, [orderId]: true }));

        // Safety timeout (15s for background tasks) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setProcessingOrders((prev) => ({ ...prev, [orderId]: false }));
            alert('Kết nối cơ sở dữ liệu/máy chủ quá thời gian chờ (Timeout). Vui lòng thử thanh toán lại!');
        }, 15000);

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

        if (!shouldPrint) {
            togglePaymentDrawer(false);
        }

        const csrfToken = getCsrfTokenFromCookie();
        const currentOrderId = orderId;

        fetch('/staff/pos/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-XSRF-TOKEN': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(payload),
        })
            .then(async (response) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setProcessingOrders((prev) => ({ ...prev, [currentOrderId]: false }));

                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success) {
                    if (shouldPrint) {
                        togglePaymentDrawer(false);
                    }
                    onSuccessClearCart();

                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });

                    const invoiceCode = 'INV-' + dateCode();
                    onLogEntry?.(
                        'sent',
                        'Thanh toán thành công',
                        `Đã thanh toán thành công hóa đơn ${matchedOrderObj?.order_code || ''} tại Bàn ${selectedTable.table_number}`
                    );

                    if (shouldPrint) {
                        setReceiptModal({
                            isOpen: true,
                            paymentMethod,
                            amountReceived,
                            changeAmount,
                            cartItems: snapshotCart,
                            table: snapshotTable,
                            invoiceCode,
                        });
                    }
                } else {
                    const errorMsg = data.error || data.message || 'Thanh toán thất bại do kết nối CSDL chập chờn. Vui lòng thử lại!';
                    onLogEntry?.(
                        'error',
                        'Thanh toán thất bại',
                        `Hóa đơn ${matchedOrderObj?.order_code || ''} tại Bàn ${selectedTable.table_number}: ${errorMsg}`
                    );
                    alert(errorMsg);
                }
            })
            .catch((error) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setProcessingOrders((prev) => ({ ...prev, [currentOrderId]: false }));

                const errorMsg = error?.message || 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng!';
                onLogEntry?.(
                    'error',
                    'Thanh toán thất bại',
                    `Hóa đơn ${matchedOrderObj?.order_code || ''} tại Bàn ${selectedTable.table_number}: ${errorMsg}`
                );
                alert(errorMsg);
            });
    };

    const handleBulkCheckout = (
        selectedTable: POSTableData | null,
        allConfirmedOrders: { id: number; order_code?: string }[],
        paymentMethod: 'cash' | 'bank_transfer',
        amountReceived: number,
        changeAmount: number,
        onSuccess: () => void,
    ) => {
        if (!selectedTable || allConfirmedOrders.length === 0) return;

        const csrfToken = getCsrfTokenFromCookie();
        const idempotencyKey = `pos_bulk_${selectedTable.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        fetch('/staff/pos/bulk-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-XSRF-TOKEN': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                order_ids: allConfirmedOrders.map((o) => o.id),
                table_id: selectedTable.id === 0 ? null : selectedTable.id,
                payment_method: paymentMethod,
                amount_received: amountReceived,
                change_amount: changeAmount,
                idempotency_key: idempotencyKey,
            }),
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.success) {
                    onSuccess();
                    router.reload({ only: ['tables'] });
                } else {
                    alert(data.error || 'Thanh toán gộp thất bại!');
                }
            })
            .catch(() => {
                alert('Không thể kết nối đến máy chủ.');
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
        handleBulkCheckout,
    };
}
