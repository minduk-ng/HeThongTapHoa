import { router, usePage } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
import type { POSTableData, CartItem, PosCustomer, ReceiptModalState, PromotionCandidate } from '../types/pos.types';
import { usePOSCheckoutLock } from './usePOSCheckoutLock';

function getCsrfTokenFromCookie(): string {
    if (typeof document === 'undefined') {
return '';
}

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
    tables: POSTableData[] = [],
    promotions: PromotionCandidate[] = []
) {
    const { auth } = usePage<any>().props;
    const [processingOrders, setProcessingOrders] = useState<Record<number, boolean>>({});
    const [kitchenSubmitting, setKitchenSubmitting] = useState(false);
    const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
    const [availablePromotions, setAvailablePromotions] = useState<PromotionCandidate[]>(promotions);
    const [selectedAutoId, setSelectedAutoId] = useState<number | null>(null);
    const [appliedPromotions, setAppliedPromotions] = useState<{ id: number; name: string; code: string | null; discount_amount: number }[]>([]);
    const [totalDiscount, setTotalDiscount] = useState(0);
    const [promotionCode, setPromotionCode] = useState<string | null>(null);
    const [promotionDiscount, setPromotionDiscount] = useState(0);
    const [promotionName, setPromotionName] = useState<string | null>(null);
    const [customer, setCustomer] = useState<PosCustomer | null>(null);

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

    // Hủy mã coupon/voucher: giữ auto promotion (selectedAutoId + entries code=null) nguyên vẹn
    // để display và checkout khớp nhau (không reset selectedAutoId — chỉ xoá phần mã nhập).
    const clearPromotion = () => {
        setPromotionCode(null);
        const autoOnly = appliedPromotions.filter((ap) => ap.code === null);
        const autoDiscount = autoOnly.reduce((sum, ap) => sum + ap.discount_amount, 0);
        setAppliedPromotions(autoOnly);
        setTotalDiscount(autoDiscount);
        setPromotionDiscount(autoDiscount);
        setPromotionName(autoOnly[0]?.name ?? null);
    };

    const togglePaymentDrawer = (open: boolean) => {
        setIsPaymentDrawerOpen(open);

        if (!open) {
            // Đóng drawer: reset hoàn toàn (kể cả auto) để lần sau mở lại tự pick lại
            setPromotionCode(null);
            setAppliedPromotions([]);
            setTotalDiscount(0);
            setPromotionDiscount(0);
            setPromotionName(null);
            setSelectedAutoId(null);
            setCustomer(null);
        }

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

    useEffect(() => {
        queueMicrotask(() => {
            setAvailablePromotions(promotions);

            if (promotions.length > 0 && selectedAutoId === null) {
                // mặc định chọn promotion ước tính cao nhất (payload cache không có estimated_discount → giữ đầu list)
                setSelectedAutoId(promotions.reduce((best, p) => (p.estimated_discount > (best?.estimated_discount ?? -1) ? p : best), promotions[0])?.id ?? null);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promotions]);

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
        if (!selectedTable || currentCart.length === 0 || submitting) {
return;
}

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

        if (newDeltaItems.length === 0 && reducedItems.length === 0) {
return;
}

        setKitchenSubmitting(true);

        // Safety timeout (8s) if DB/Server hangs indefinitely
        if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

        timeoutRef.current = setTimeout(() => {
            setKitchenSubmitting(false);
        }, 8000);

        const subtotal = newDeltaItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = newDeltaItems.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;

            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal;

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
                if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

                setKitchenSubmitting(false);
            },
            onError: (errors) => {
                if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

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

    const syncApplied = (data: any) => {
        setTotalDiscount(Number(data.discount_amount) || 0);
        setPromotionDiscount(Number(data.discount_amount) || 0); // giữ cho ReceiptPrintModal
        const list = Array.isArray(data.promotions) && data.promotions.length
            ? data.promotions.map((x: any) => ({ id: x.id, name: x.name, code: x.code ?? null, discount_amount: Number(x.discount_amount) || 0 }))
            : [];
        setAppliedPromotions(list);
        setPromotionName(data.promotion?.name ?? null); // giữ cho ReceiptPrintModal

        if (!list.some((x: any) => x.code !== null)) {
            // không còn coupon mã (toàn auto/empty) → xoá promotion_code để checkout không tự ý áp lại mã cũ
            setPromotionCode(null);
        }
    };

    const applyPromotion = async (
        code: string,
        subtotal: number,
        items: { menu_item_id: number; quantity: number; unit_price: number }[] = []
    ): Promise<{ ok: boolean; discount_amount?: number; total?: number; error?: string }> => {
        const csrfToken = getCsrfTokenFromCookie();

        try {
            const response = await fetch('/staff/pos/validate-promotion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ code, subtotal, items, selected_promotion_id: selectedAutoId }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok) {
                setPromotionCode(code);
                syncApplied(data);

                return {
                    ok: true,
                    discount_amount: data.discount_amount,
                    total: data.total,
                };
            }

            return {
                ok: false,
                error: data.error || 'Mã khuyến mãi không hợp lệ.',
            };
        } catch {
            return { ok: false, error: 'Không thể kết nối máy chủ.' };
        }
    };

    const applyAutoPromotions = async (
        subtotal: number,
        items: { menu_item_id: number; quantity: number; unit_price: number }[] = []
    ) => {
        const csrfToken = getCsrfTokenFromCookie();

        try {
            const response = await fetch('/staff/pos/validate-promotion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({
                    subtotal,
                    items,
                    selected_promotion_id: selectedAutoId,
                    code: promotionCode ?? undefined,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok) {
syncApplied(data);
}
        } catch { /* bỏ qua */ }
    };

    // Lấy danh sách auto promotion khớp giỏ hàng kèm estimated_discount (từ available-promotions),
    // cập nhật dropdown; nếu chưa chọn → tự chọn promotion ước tính cao nhất.
    const loadAvailablePromotions = async (
        subtotal: number,
        items: { menu_item_id: number; quantity: number; unit_price: number }[] = []
    ) => {
        const csrfToken = getCsrfTokenFromCookie();

        try {
            const response = await fetch('/staff/pos/available-promotions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ subtotal, items }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok && Array.isArray(data.promotions)) {
                const list = data.promotions as PromotionCandidate[];
                setAvailablePromotions(list);
                const currentlyUnset = selectedAutoId === null || selectedAutoId === 0;

                if (currentlyUnset && list.length > 0) {
                    const best = list.reduce<PromotionCandidate | undefined>(
                        (acc, p) => (p.estimated_discount > (acc?.estimated_discount ?? -1) ? p : acc),
                        list[0]
                    );
                    setSelectedAutoId(best?.id ?? null);
                }
            }
        } catch { /* bỏ qua */ }
    };

    const searchCustomers = async (q: string): Promise<PosCustomer[]> => {
        const csrfToken = getCsrfTokenFromCookie();

        try {
            const response = await fetch('/staff/pos/customers/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ q }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok && Array.isArray(data.customers)) {
                return data.customers;
            }
        } catch { /* bỏ qua */ }

        return [];
    };

    const createCustomer = async (full_name: string, phone: string): Promise<{ ok: boolean; customer?: PosCustomer; error?: string }> => {
        const csrfToken = getCsrfTokenFromCookie();

        try {
            const response = await fetch('/staff/pos/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ full_name, phone }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.ok && data.customer) {
                return { ok: true, customer: data.customer };
            }

            return { ok: false, error: data.error || 'Tạo khách hàng thất bại.' };
        } catch {
            return { ok: false, error: 'Không thể kết nối máy chủ.' };
        }
    };

    const handleConfirmPayment = (
        selectedTable: POSTableData | null,
        currentCart: CartItem[],
        activeInvoiceId: string | null,
        paymentMethod: 'cash' | 'bank_transfer',
        amountReceived: number,
        changeAmount: number,
        shouldPrint: boolean,
        customerId: number | null,
        onSuccessClearCart: () => void,
        onLogEntry?: (type: 'sent' | 'received' | 'error', message: string, details?: string) => void
    ) => {
        if (!selectedTable) {
return;
}

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
        if (processingOrders[orderId]) {
return;
}

        const hasUnconfirmedDrafts = currentCart.some((i) => !i.isConfirmed || (i.stagedReduceQty || 0) > 0);

        if (hasUnconfirmedDrafts) {
return;
}

        if (lockedCheckoutTables[selectedTable.id]) {
            return;
        }

        // Lock order status to processing
        setProcessingOrders((prev) => ({ ...prev, [orderId]: true }));

        // Safety timeout (15s for background tasks) if DB/Server hangs indefinitely
        if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

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
            ...(promotionCode ? { promotion_code: promotionCode } : {}),
            ...(selectedAutoId !== null ? { selected_promotion_id: selectedAutoId } : {}),
            ...(customerId !== null ? { customer_id: customerId } : {}),
            idempotency_key: idempotencyKey,
        };

        const snapshotCart = [...currentCart];
        const snapshotTable = { ...selectedTable };

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
                if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

                setProcessingOrders((prev) => ({ ...prev, [currentOrderId]: false }));

                const data = await response.json().catch(() => ({}));

                if (response.ok && data.success) {
                    togglePaymentDrawer(false);
                    onSuccessClearCart();

                    if (data.deposit_refund > 0) {
                        alert(`Hoàn khách ${data.deposit_refund.toLocaleString('vi-VN')} đ từ tiền cọc thừa.`);
                    }

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
                            depositAmount: matchedOrderObj?.deposit_total || 0,
                            depositRefund: data.deposit_refund || 0,
                            promotionDiscount: promotionDiscount || 0,
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
                if (timeoutRef.current) {
clearTimeout(timeoutRef.current);
}

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
        shouldPrint: boolean,
        snapshotCart: CartItem[],
        snapshotTable: POSTableData | null,
        depositTotal: number,
        customerId: number | null,
        onSuccess: () => void,
    ) => {
        if (!selectedTable || allConfirmedOrders.length === 0) {
return;
}

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
                ...(promotionCode ? { promotion_code: promotionCode } : {}),
                ...(selectedAutoId !== null ? { selected_promotion_id: selectedAutoId } : {}),
                ...(customerId !== null ? { customer_id: customerId } : {}),
                idempotency_key: idempotencyKey,
            }),
        })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));

                if (response.ok && data.success) {
                    togglePaymentDrawer(false);

                    if (data.deposit_refund > 0) {
                        alert(`Hoàn khách ${data.deposit_refund.toLocaleString('vi-VN')} đ từ tiền cọc thừa.`);
                    }

                    if (shouldPrint) {
                        setReceiptModal({
                            isOpen: true,
                            paymentMethod,
                            amountReceived,
                            changeAmount,
                            cartItems: snapshotCart,
                            table: snapshotTable,
                            invoiceCode: 'INV-' + dateCode(),
                            depositAmount: depositTotal,
                            depositRefund: data.deposit_refund || 0,
                            promotionDiscount: promotionDiscount || 0,
                        });
                    }

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
        availablePromotions,
        selectedAutoId,
        setSelectedAutoId,
        appliedPromotions,
        totalDiscount,
        applyAutoPromotions,
        loadAvailablePromotions,
        promotionCode,
        promotionName,
        promotionDiscount,
        applyPromotion,
        clearPromotion,
        lockedCheckoutTables,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
        handleBulkCheckout,
        customer,
        setCustomer,
        searchCustomers,
        createCustomer,
    };
}
