import { router } from '@inertiajs/react';
import { X, ChevronDown, Download } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { DataTableColumn } from '../../../../components/DataTable';
import DataTable from '../../../../components/DataTable';
import { exportXLSX } from '../../../../components/reports/reportExport';

interface CodeRow {
    id: number;
    code: string;
    status: string;
    used_at: string | null;
    invoice_code: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotion: { id: number; code_prefix: string | null; name: string; type: string; codes_count: number; codes_used: number } | null;
}

export default function PromotionCodesModal({ isOpen, onClose, promotion }: Props) {
    const [codes, setCodes] = useState<CodeRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [nextPage, setNextPage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !promotion) {
return;
}

        queueMicrotask(() => {
            setLoading(true);
            setError(null);
            setCodes([]);
            setHasMore(false);
            setNextPage(null);
        });
        fetch(`/manager/promotions/${promotion.id}/codes?per_page=50`, { headers: { Accept: 'application/json' } })
            .then((r) => {
                if (!r.ok) {
throw new Error('fail');
}

                return r.json();
            })
            .then((data) => {
                setCodes(data.codes || []);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => setError('Không thể tải danh sách mã. Vui lòng thử lại.'))
            .finally(() => setLoading(false));
    }, [isOpen, promotion]);

    useEffect(() => {
        if (!isOpen) {
return;
}

        const h = (e: KeyboardEvent) => {
 if (e.key === 'Escape') {
onClose();
} 
};
        window.addEventListener('keydown', h);

        return () => window.removeEventListener('keydown', h);
    }, [isOpen, onClose]);

    const loadMore = () => {
        if (!nextPage || loadingMore) {
return;
}

        setLoadingMore(true);
        fetch(nextPage, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setCodes((prev) => [...prev, ...(data.codes || [])]);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    };

    const toggleCodes = (action: 'disable' | 'enable') => {
        if (!promotion) {
return;
}

        router.post(`/manager/promotions/${promotion.id}/codes/toggle`, { action }, { preserveScroll: true });
    };

    const handleExport = async () => {
        if (!promotion || exporting) {
return;
}

        setExporting(true);

        try {
            const res = await fetch(`/manager/promotions/${promotion.id}/codes?export=1`, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const all = (data.codes || []) as CodeRow[];
            const rows = all.map((c) => [
                c.code,
                c.status === 'used' ? 'Đã dùng' : c.status === 'disabled' ? 'Vô hiệu hoá' : 'Chưa dùng',
                c.used_at ? new Date(c.used_at).toLocaleString('vi-VN') : '—',
                c.invoice_code || '—',
            ]);
            await exportXLSX(
                `Danh sách mã ${promotion.code_prefix || 'KM'}`,
                promotion.name,
                ['Mã', 'Trạng thái', 'Thời gian dùng', 'Hoá đơn'],
                rows,
                `ma-${promotion.code_prefix || 'km'}`,
            );
        } catch {
            setError('Không thể xuất Excel. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) {
return null;
}

    const columns: DataTableColumn<CodeRow>[] = [
        { key: 'code', header: 'Mã', align: 'center', render: (c) => <span className="font-mono font-medium text-sky-600 dark:text-sky-400">{c.code}</span> },
        { key: 'status', header: 'Trạng thái', align: 'center', render: (c) => (
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${c.status === 'used' ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800' : c.status === 'disabled' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                {c.status === 'used' ? 'Đã dùng' : c.status === 'disabled' ? 'Vô hiệu hoá' : 'Chưa dùng'}
            </span>
        )},
        { key: 'used_at', header: 'Thời gian dùng', align: 'center', render: (c) => c.used_at ? <span className="tabular-nums">{new Date(c.used_at).toLocaleString('vi-VN')}</span> : '—' },
        { key: 'invoice_code', header: 'Hoá đơn', align: 'center', render: (c) => c.invoice_code ? <span className="font-mono tabular-nums">{c.invoice_code}</span> : '—' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
                    <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">Danh sách mã {promotion?.code_prefix || ''}</h3>
                    <div className="flex items-center gap-2">
                        {promotion && promotion.codes_count > 0 && (promotion.type === 'coupon' || promotion.type === 'voucher') && (
                            <>
                                <button type="button" onClick={() => toggleCodes('disable')} disabled={promotion.codes_used === promotion.codes_count}
                                    className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">
                                    Vô hiệu hoá
                                </button>
                                <button type="button" onClick={() => toggleCodes('enable')}
                                    className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300">
                                    Kích hoạt lại
                                </button>
                            </>
                        )}
                        <button type="button" onClick={handleExport} disabled={exporting || codes.length === 0}
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                            <Download className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>{exporting ? 'Đang xuất...' : 'Export Excel'}</span>
                        </button>
                        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg" aria-label="Đóng"><X className="w-5 h-5" /></button>
                    </div>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-sm text-zinc-500">Đang tải...</div>
                ) : error ? (
                    <div className="py-10 text-center text-sm text-rose-600">{error}</div>
                ) : (
                    <>
                        <DataTable<CodeRow> columns={columns} rows={codes} rowKey={(c) => c.id}
                            emptyMessage="Chưa có mã nào" showCompactToggle={false} showPageSize={false} defaultPageSize={50} />
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <button type="button" onClick={loadMore} disabled={loadingMore}
                                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
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
