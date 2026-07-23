import { useState, useRef, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import { POSTableData, CartItem, ReceiptModalState } from '../types/pos.types';
import { usePOSCheckoutLock } from './usePOSCheckoutLock';

export function usePOSCheckout(selectedTable: POSTableData | null = null) {
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
            if (open) {
                const employeeName = auth?.user?.name || 'Nhân viên';
                lockTableCheckout(selectedTable.id, employeeName);
            } else {
                unlockTableCheckout(selectedTable.id);
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
        onSuccessCallback?: () => void
    ) => {
        if (!selectedTable || currentCart.length === 0 || submitting) return;

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

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setSubmitting(false);
            alert('Kết nối cơ sở dữ liệu/máy chủ quá thời gian chờ (Timeout). Vui lòng bấm gửi lại!');
        }, 8000);

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
                if (selectedTable && onSuccessCallback) {
                    onSuccessCallback();
                }
            },
            onFinish: () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
            },
            onError: (errors) => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setSubmitting(false);
                const msg = errors.error || errors.message || 'Gửi đơn thất bại do kết nối CSDL chập chờn. Vui lòng gửi lại!';
                alert(msg);
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
        if (!selectedTable || submitting) return;

        if (lockedCheckoutTables[selectedTable.id]) {
            alert(`Không thể thanh toán: Bàn này đang được thanh toán bởi ${lockedCheckoutTables[selectedTable.id].employeeName}!`);
            return;
        }

        setSubmitting(true);

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setSubmitting(false);
            alert('Kết nối cơ sở dữ liệu/máy chủ quá thời gian chờ (Timeout). Vui lòng thử thanh toán lại!');
        }, 8000);

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
