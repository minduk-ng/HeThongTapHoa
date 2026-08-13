import React, { useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';

interface InvoiceRow {
    id: number;
    invoice_code: string;
    issued_at: string;
    table_name: string;
    subtotal_amount: number;
    discount_amount: number;
    total_amount: number;
    payment_method: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionId: number | null;
}

export default function PromotionInvoicesModal({ isOpen, onClose, promotionId }: Props) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextPage, setNextPage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || promotionId === null) return;
        setLoading(true);
        setInvoices([]);
        setHasMore(false);
        setNextPage(null);
        fetch(`/manager/promotions/${promotionId}/invoices?per_page=50`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setInvoices(data.invoices || []);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => setInvoices([]))
            .finally(() => setLoading(false));
    }, [isOpen, promotionId]);

    const loadMore = () => {
        if (!nextPage || loadingMore) return;
        setLoadingMore(true);
        fetch(nextPage, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setInvoices((prev) => [...prev, ...(data.invoices || [])]);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    };

    if (!isOpen) return null;

    const columns: DataTableColumn<InvoiceRow>[] = [
        { key: 'invoice_code', header: 'Mã hoá đơn', render: (i) => <span className="font-medium">{i.invoice_code}</span> },
        { key: 'issued_at', header: 'Thời gian', render: (i) => new Date(i.issued_at).toLocaleString('vi-VN') },
        { key: 'table_name', header: 'Bàn', align: 'center', render: (i) => i.table_name || 'Mang đi' },
        { key: 'subtotal_amount', header: 'Tổng tiền', align: 'right', render: (i) => `${Number(i.subtotal_amount).toLocaleString('vi-VN')} đ` },
        { key: 'discount_amount', header: 'Tiền giảm', align: 'right', render: (i) => `−${Number(i.discount_amount).toLocaleString('vi-VN')} đ` },
        { key: 'total_amount', header: 'Thực thu', align: 'right', render: (i) => <span className="font-semibold">{Number(i.total_amount).toLocaleString('vi-VN')} đ</span> },
        { key: 'payment_method', header: 'PTTT', align: 'center', render: (i) => ({ cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', e_wallet: 'Ví điện tử', mixed: 'Hỗn hợp' })[i.payment_method] || i.payment_method },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-auto p-6">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-5">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Hoá đơn đã dùng mã</h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-sm text-zinc-500">Đang tải...</div>
                ) : (
                    <>
                        <DataTable<InvoiceRow>
                            columns={columns}
                            rows={invoices}
                            rowKey={(i) => i.id}
                            emptyMessage="Chưa có hoá đơn nào dùng mã này"
                            showCompactToggle={false}
                            showPageSize={false}
                            defaultPageSize={50}
                        />
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <button
                                    type="button"
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                    <ChevronDown className="h-3.5 w-3.5 stroke-[1.5]" />
                                    <span>{loadingMore ? 'Đang tải...' : 'Tải thêm'}</span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
