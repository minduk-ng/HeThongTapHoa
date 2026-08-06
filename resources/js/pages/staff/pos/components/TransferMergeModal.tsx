import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { ArrowRightLeft, Layers, Split, AlertCircle, X } from 'lucide-react';
import { POSTableData } from '../types/pos.types';

interface TransferMergeModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedTable: POSTableData | null;
    tables: POSTableData[];
}

export default function TransferMergeModal({
    isOpen,
    onClose,
    selectedTable,
    tables,
}: TransferMergeModalProps) {
    const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
    const isMerged = !!(selectedTable && (selectedTable.merged_into_table_id || safeTables.some((t) => t.merged_into_table_id === selectedTable.id)));
    const [activeTab, setActiveTab] = useState<'transfer' | 'merge' | 'unmerge'>('transfer');

    // Transfer state
    const [targetTransferTableId, setTargetTransferTableId] = useState<number | ''>('');

    // Merge state
    const [targetMergeTableId, setTargetMergeTableId] = useState<number | ''>('');

    // Unmerge state
    const [keepTableId, setKeepTableId] = useState<number | ''>('');

    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (selectedTable) {
            setErrorMsg(null);
            setTargetTransferTableId('');
            setTargetMergeTableId('');
            setKeepTableId(selectedTable.id);
            if (isMerged) {
                setActiveTab('unmerge');
            } else {
                setActiveTab('transfer');
            }
        }
    }, [selectedTable, isOpen, isMerged]);

    if (!isOpen || !selectedTable) return null;

    const availableTransferTables = safeTables.filter(
        (t) => t.id !== selectedTable.id && t.status === 'available' && !t.merged_into_table_id
    );

    // Only allow merging with tables that are NOT already merged into another table
    const availableMergeTables = safeTables.filter(
        (t) => t.id !== selectedTable.id && !t.merged_into_table_id
    );

    // Group tables for unmerge selection
    const groupId = selectedTable.merged_into_table_id || selectedTable.id;
    const currentGroupTables = safeTables.filter(
        (t) => t.id === groupId || t.merged_into_table_id === groupId
    );

    const handleExecuteTransfer = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetTransferTableId) {
            setErrorMsg('Vui lòng chọn bàn trống đích muốn chuyển tới.');
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/staff/pos/transfer-table',
            {
                source_table_id: selectedTable.id,
                target_table_id: targetTransferTableId,
                idempotency_key: `pos_transfer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setSubmitting(false);
                    setErrorMsg(errs.error || 'Chuyển bàn thất bại. Vui lòng thử lại!');
                },
            }
        );
    };

    const handleExecuteMerge = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetMergeTableId) {
            setErrorMsg('Vui lòng chọn bàn muốn gộp cùng.');
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/staff/pos/merge-tables',
            {
                source_table_id: selectedTable.id,
                target_table_id: targetMergeTableId,
                idempotency_key: `pos_merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setSubmitting(false);
                    setErrorMsg(errs.error || 'Gộp bàn thất bại. Vui lòng thử lại!');
                },
            }
        );
    };

    const handleExecuteUnmerge = (e: React.FormEvent) => {
        e.preventDefault();
        if (!keepTableId) {
            setErrorMsg('Vui lòng chọn bàn sẽ giữ lại tất cả các món.');
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/staff/pos/unmerge-table',
            {
                source_table_id: selectedTable.id,
                keep_table_id: keepTableId,
                idempotency_key: `pos_unmerge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setSubmitting(false);
                    setErrorMsg(errs.error || 'Tách gộp bàn thất bại. Vui lòng thử lại!');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                    <div>
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            Quản lý Chuyển, Gộp & Tách Bàn
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Đang thao tác trên <strong className="text-sky-600 dark:text-sky-400">{selectedTable.table_number}</strong> ({selectedTable.area})
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                        <X className="w-5 h-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Tab Controls */}
                <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-800/60 p-1.5 gap-1">
                    <button
                        type="button"
                        onClick={() => { setActiveTab('transfer'); setErrorMsg(null); }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 ${
                            activeTab === 'transfer'
                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50'
                        }`}
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Chuyển bàn</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setActiveTab('merge'); setErrorMsg(null); }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 ${
                            activeTab === 'merge'
                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Gộp bàn</span>
                    </button>

                    {isMerged && (
                        <button
                            type="button"
                            onClick={() => { setActiveTab('unmerge'); setErrorMsg(null); }}
                            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 ${
                                activeTab === 'unmerge'
                                    ? 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-xs'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50'
                            }`}
                        >
                            <Split className="w-3.5 h-3.5" />
                            <span>Tách bàn</span>
                        </button>
                    )}
                </div>

                {/* Error Banner */}
                {errorMsg && (
                    <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 shrink-0 stroke-[1.5]" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Tab Content Forms */}
                <div className="p-5 flex-1 overflow-y-auto">
                    {activeTab === 'transfer' && (
                        <form onSubmit={handleExecuteTransfer} className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-200 space-y-1">
                                <strong className="font-semibold">Chuyển sang bàn trống:</strong>
                                <p className="text-zinc-600 dark:text-zinc-400">
                                    Chuyển toàn bộ đơn hàng hiện tại từ <span className="font-bold text-sky-600">{selectedTable.table_number}</span> sang một bàn trống khác.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    Chọn bàn trống đích <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={targetTransferTableId}
                                    onChange={(e) => setTargetTransferTableId(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                                >
                                    <option value="">— Chọn bàn trống —</option>
                                    {availableTransferTables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.table_number} ({t.area}) — Sức chứa: {t.capacity} ghế
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !targetTransferTableId}
                                    className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50"
                                >
                                    {submitting ? 'Đang chuyển...' : 'Xác nhận chuyển bàn'}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'merge' && (
                        <form onSubmit={handleExecuteMerge} className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-200 space-y-1">
                                <strong className="font-semibold">Gộp bàn:</strong>
                                <p className="text-zinc-600 dark:text-zinc-400">
                                    Dồn toàn bộ các món đã gọi từ <span className="font-bold text-sky-600">{selectedTable.table_number}</span> sang bàn được chọn thành 1 hóa đơn duy nhất.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    Chọn bàn muốn gộp vào <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={targetMergeTableId}
                                    onChange={(e) => setTargetMergeTableId(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                                >
                                    <option value="">— Chọn bàn —</option>
                                    {availableMergeTables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.table_number} ({t.area}) [{t.status === 'occupied' ? 'Đang dùng' : 'Trống'}]
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !targetMergeTableId}
                                    className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-50"
                                >
                                    {submitting ? 'Đang gộp...' : 'Xác nhận gộp bàn'}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'unmerge' && (
                        <form onSubmit={handleExecuteUnmerge} className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                                <strong className="font-semibold">Tách nhóm bàn gộp:</strong>
                                <p className="text-zinc-600 dark:text-zinc-400">
                                    Chọn 1 bàn duy nhất sẽ giữ lại tất cả các món đã chọn. Tất cả các bàn còn lại trong nhóm sẽ được giải phóng về trạng thái bàn trống.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    Chọn bàn sẽ giữ lại tất cả đơn hàng <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={keepTableId}
                                    onChange={(e) => setKeepTableId(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                                >
                                    {currentGroupTables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.table_number} ({t.area})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !keepTableId}
                                    className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs disabled:opacity-50"
                                >
                                    {submitting ? 'Đang xử lý...' : 'Xác nhận tách bàn'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
