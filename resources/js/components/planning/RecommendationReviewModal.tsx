import { router } from '@inertiajs/react';
import {
    Building2,
    CheckCircle2,
    FileText,
    Loader2,
    RefreshCw,
    ShieldAlert,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    formatCurrency,
    formatQuantity,
} from './planningFormatters';
import type { InventoryRecommendationItem } from './RecommendationDetailDrawer';

export interface ReviewItem {
    recommendation: InventoryRecommendationItem;
    finalQuantity: number;
    reason: string;
}

interface RecommendationReviewModalProps {
    isOpen: boolean;
    items: ReviewItem[];
    onClose: () => void;
    onSuccess?: () => void;
    syntheticDatasetId?: number | null;
}

export default function RecommendationReviewModal({
    isOpen,
    items,
    onClose,
    onSuccess,
    syntheticDatasetId,
}: RecommendationReviewModalProps) {
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isStaleError, setIsStaleError] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClose = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        setErrorMessage(null);
        setIsStaleError(false);
        setIsSubmitting(false);
        setIsRecalculating(false);
        onClose();
    }, [onClose]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting && !isRecalculating) {
                e.preventDefault();
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, isSubmitting, isRecalculating, handleClose]);

    // Group items by supplier
    const groupedSuppliers = useMemo(() => {
        const map = new Map<
            string,
            {
                supplierId: number | null;
                supplierName: string;
                supplierPhone: string | null;
                items: ReviewItem[];
                subtotal: number;
            }
        >();

        for (const item of items) {
            const sup = item.recommendation.supplier;
            const supKey = sup ? `sup-${sup.id}` : 'no-supplier';
            const supName = sup ? sup.name : 'Chưa phân công nhà cung cấp';
            const supPhone = sup?.phone || null;

            const ing = item.recommendation.ingredient;
            const baseUnit = ing?.unit || item.recommendation.unit;
            const purchaseUnit = item.recommendation.purchase_unit || ing?.purchase_unit || baseUnit;
            const unitConversion = Number(ing?.unit_conversion ?? 1);
            const baseCostPrice = Number(ing?.cost_price ?? 0);

            const isPurchaseUnitConverted =
                Boolean(ing?.purchase_unit) &&
                purchaseUnit === ing?.purchase_unit &&
                unitConversion > 0;

            const unitPrice = isPurchaseUnitConverted
                ? Math.round(baseCostPrice * unitConversion)
                : baseCostPrice;

            const itemTotal = Math.round(item.finalQuantity * unitPrice);

            if (!map.has(supKey)) {
                map.set(supKey, {
                    supplierId: sup ? sup.id : null,
                    supplierName: supName,
                    supplierPhone: supPhone,
                    items: [],
                    subtotal: 0,
                });
            }

            const current = map.get(supKey)!;

            current.items.push(item);
            current.subtotal += itemTotal;
        }

        return Array.from(map.values());
    }, [items]);

    const totalCost = useMemo(() => {
        return groupedSuppliers.reduce((sum, g) => sum + g.subtotal, 0);
    }, [groupedSuppliers]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = () => {
        if (items.length === 0 || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        setIsStaleError(false);

        // 8-second safety timeout guard
        timeoutRef.current = setTimeout(() => {
            setIsSubmitting(false);
            setErrorMessage('Yêu cầu phê duyệt phản hồi quá 8 giây. Vui lòng kiểm tra kết nối mạng và thử lại.');
        }, 8000);

        router.post(
            '/planning/procurement/plans',
            {
                items: items.map((i) => ({
                    recommendation_id: i.recommendation.id,
                    final_quantity: i.finalQuantity,
                    adjustment_reason:
                        Math.abs(i.finalQuantity - i.recommendation.suggested_quantity) > 0.0001
                            ? i.reason
                            : null,
                })),
                notes: notes.trim() || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                    }

                    setIsSubmitting(false);
                    onClose();
                    onSuccess?.();
                },
                onError: (errors) => {
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                    }

                    setIsSubmitting(false);
                    // Server returns 422: keep modal open
                    const stale = Boolean(
                        errors.recommendation ||
                            Object.values(errors).some((msg) =>
                                typeof msg === 'string' &&
                                (msg.includes('tồn kho') || msg.includes('snapshot') || msg.includes('không còn hiệu lực'))
                            )
                    );

                    setIsStaleError(stale);
                    const firstError = errors.recommendation || Object.values(errors)[0] || 'Không thể tạo kế hoạch mua hàng.';

                    setErrorMessage(String(firstError));
                },
                onFinish: () => {
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                    }
                },
            }
        );
    };

    const handleRecalculate = () => {
        setIsRecalculating(true);
        setErrorMessage(null);

        router.post(
            '/planning/runs',
            {
                horizon_days: 7,
                synthetic_dataset_id: syntheticDatasetId ?? null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsRecalculating(false);
                    onClose();
                },
                onError: (err) => {
                    setIsRecalculating(false);
                    setErrorMessage(String(Object.values(err)[0] || 'Lỗi khi kích hoạt tính lại dự báo.'));
                },
            }
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto"
            aria-labelledby="modal-review-title"
            role="dialog"
            aria-modal="true"
        >
            <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-6">
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
                    onClick={() => {
                        if (!isSubmitting && !isRecalculating) {
                            handleClose();
                        }
                    }}
                    aria-hidden="true"
                />

                <div className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div>
                                <h2
                                    id="modal-review-title"
                                    className="font-display text-xl font-bold text-slate-900 dark:text-white"
                                >
                                    Xem lại & Phê duyệt kế hoạch mua hàng
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Hệ thống sẽ tạo kế hoạch mua hàng riêng biệt cho từng nhà cung cấp
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting || isRecalculating}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Stale / Server Error Banner */}
                    {errorMessage && (
                        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                            <div className="flex-1 text-sm">
                                <div className="font-semibold">
                                    {isStaleError
                                        ? 'Dữ liệu tồn kho đã thay đổi sau thời điểm snapshot (422)'
                                        : 'Phát hiện dữ liệu không nhất quán (422)'}
                                </div>
                                <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
                                    {errorMessage}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleRecalculate}
                                        disabled={isRecalculating}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
                                    >
                                        {isRecalculating ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Tính lại dự báo & tồn kho
                                    </button>
                                    <span className="text-xs text-rose-600 dark:text-rose-400">
                                        (Lấy tồn kho thực tế và cập nhật lại đề xuất)
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Content: Grouped by Supplier */}
                    <div className="mt-4 max-h-[50vh] space-y-5 overflow-y-auto pr-1">
                        {groupedSuppliers.map((group, groupIdx) => (
                            <div
                                key={groupIdx}
                                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                            >
                                <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                        <span className="font-display font-semibold text-slate-900 dark:text-white">
                                            {group.supplierName}
                                        </span>
                                        {group.supplierPhone && (
                                            <span className="text-xs text-slate-400">
                                                ({group.supplierPhone})
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {group.items.length} mặt hàng
                                    </span>
                                </div>

                                <div className="space-y-2.5">
                                    {group.items.map((item, itemIdx) => {
                                        const ing = item.recommendation.ingredient;
                                        const baseUnit = ing?.unit || item.recommendation.unit;
                                        const purchaseUnit = item.recommendation.purchase_unit || ing?.purchase_unit || baseUnit;
                                        const unitConversion = Number(ing?.unit_conversion ?? 1);
                                        const baseCostPrice = Number(ing?.cost_price ?? 0);

                                        const isConverted =
                                            Boolean(ing?.purchase_unit) &&
                                            purchaseUnit === ing?.purchase_unit &&
                                            unitConversion > 0;

                                        const unitPrice = isConverted
                                            ? Math.round(baseCostPrice * unitConversion)
                                            : baseCostPrice;

                                        const itemTotal = Math.round(item.finalQuantity * unitPrice);
                                        const isAdjusted =
                                            Math.abs(item.finalQuantity - item.recommendation.suggested_quantity) > 0.0001;

                                        return (
                                            <div
                                                key={itemIdx}
                                                className="rounded-lg border border-slate-200/60 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                            {ing?.name || `Nguyên liệu #${item.recommendation.ingredient_id}`}
                                                        </span>
                                                        <span className="ml-2 font-mono text-[11px] text-slate-400">
                                                            ({ing?.code || '-'})
                                                        </span>
                                                    </div>
                                                    <div className="font-display font-bold tabular-nums text-slate-900 dark:text-white">
                                                        {formatCurrency(itemTotal)}
                                                    </div>
                                                </div>

                                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400">
                                                    <div>
                                                        Đề xuất:{' '}
                                                        <span className="tabular-nums">
                                                            {formatQuantity(item.recommendation.suggested_quantity)}
                                                        </span>{' '}
                                                        {purchaseUnit}
                                                    </div>
                                                    <div>
                                                        Đặt thực tế:{' '}
                                                        <span className={`font-semibold tabular-nums ${isAdjusted ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {formatQuantity(item.finalQuantity)}
                                                        </span>{' '}
                                                        {purchaseUnit}
                                                    </div>
                                                    <div>
                                                        Đơn giá:{' '}
                                                        <span className="tabular-nums">
                                                            {formatCurrency(unitPrice)}
                                                        </span>
                                                        /{purchaseUnit}
                                                    </div>
                                                </div>

                                                {isAdjusted && (
                                                    <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                        <span className="font-semibold">Lý do điều chỉnh:</span>{' '}
                                                        {item.reason || '(Chưa ghi lý do)'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 flex justify-between border-t border-slate-200/60 pt-2 text-xs font-semibold dark:border-slate-800">
                                    <span className="text-slate-600 dark:text-slate-400">
                                        Tổng tiền NCC ({group.supplierName}):
                                    </span>
                                    <span className="font-display tabular-nums text-slate-900 dark:text-white">
                                        {formatCurrency(group.subtotal)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Overall Notes */}
                    <div className="mt-4">
                        <label
                            htmlFor="plan-notes"
                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                            <FileText className="h-3.5 w-3.5" />
                            Ghi chú kế hoạch (tùy chọn)
                        </label>
                        <textarea
                            id="plan-notes"
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Nhập ghi chú chung cho đợt nhập hàng này..."
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
                        />
                    </div>

                    {/* Footer Summary & Action */}
                    <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                        <div className="text-left">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                Tổng cộng {items.length} mặt hàng ({groupedSuppliers.length} NCC)
                            </div>
                            <div className="font-display text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(totalCost)}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isSubmitting || isRecalculating}
                                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Hủy bỏ
                            </button>

                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || isRecalculating || items.length === 0}
                                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Đang tạo kế hoạch...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-4 w-4" />
                                        Xác nhận & Phê duyệt
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
