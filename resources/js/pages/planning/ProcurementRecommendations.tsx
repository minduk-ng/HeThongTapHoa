import { Head } from '@inertiajs/react';
import {
    AlertCircle,
    Building2,
    Eye,
    Filter,
    RotateCcw,
    Search,
    Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    formatCurrency,
    formatDateTime,
    formatQuantity,
} from '../../components/planning/planningFormatters';
import PlanningResultState from '../../components/planning/PlanningResultState';
import RecommendationDetailDrawer from '../../components/planning/RecommendationDetailDrawer';
import type { InventoryRecommendationItem } from '../../components/planning/RecommendationDetailDrawer';
import RecommendationReviewModal from '../../components/planning/RecommendationReviewModal';
import type { ReviewItem } from '../../components/planning/RecommendationReviewModal';
import RunStatusBanner from '../../components/planning/RunStatusBanner';
import type { ForecastRunSummary } from '../../components/planning/RunStatusBanner';
import DashboardLayout from '../../layouts/DashboardLayout';
import type { PlanningResultSummary } from '../../types/planning';

interface ProcurementRecommendationsProps {
    resultSummary: PlanningResultSummary;
    activeRun?: ForecastRunSummary | null;
    recommendations?: InventoryRecommendationItem[];
    filters?: {
        synthetic_dataset_id?: number | null;
        horizon_days?: number | null;
    };
}

interface ItemEditState {
    finalQuantity: number;
    reason: string;
}

export default function ProcurementRecommendations({
    resultSummary,
    activeRun,
    recommendations = [],
    filters = {},
}: ProcurementRecommendationsProps) {
    const [search, setSearch] = useState('');
    const [supplierFilter, setSupplierFilter] = useState<string>('all');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
        // Pre-select items with suggested quantity > 0
        const initial = new Set<number>();

        for (const r of recommendations) {
            if (r.suggested_quantity > 0 && r.status === 'pending') {
                initial.add(r.id);
            }
        }

        return initial;
    });

    const [edits, setEdits] = useState<Record<number, ItemEditState>>(() => {
        const initial: Record<number, ItemEditState> = {};

        for (const r of recommendations) {
            initial[r.id] = {
                finalQuantity: r.suggested_quantity,
                reason: '',
            };
        }

        return initial;
    });

    const [selectedDetailItem, setSelectedDetailItem] =
        useState<InventoryRecommendationItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const reviewBarRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const bar = reviewBarRef.current;
        const page = pageRef.current;

        if (!bar || !page || typeof ResizeObserver === 'undefined') {
            return;
        }

        const measure = () => {
            page.style.paddingBottom = `${bar.getBoundingClientRect().height + 16}px`;
        };
        const observer = new ResizeObserver(measure);

        measure();
        observer.observe(bar);

        return () => observer.disconnect();
    }, []);

    // Filter suppliers for dropdown
    const supplierOptions = useMemo(() => {
        const set = new Map<string, string>();

        for (const r of recommendations) {
            if (r.supplier) {
                set.set(String(r.supplier.id), r.supplier.name);
            }
        }

        return Array.from(set.entries());
    }, [recommendations]);

    // Filter recommendations by search and supplier
    const filteredRecommendations = useMemo(() => {
        return recommendations.filter((r) => {
            const ing = r.ingredient;
            const term = search.toLowerCase().trim();
            const matchesSearch =
                !term ||
                (ing?.name && ing.name.toLowerCase().includes(term)) ||
                (ing?.code && ing.code.toLowerCase().includes(term)) ||
                (r.supplier?.name && r.supplier.name.toLowerCase().includes(term));

            const matchesSupplier =
                supplierFilter === 'all' ||
                (r.supplier && String(r.supplier.id) === supplierFilter) ||
                (supplierFilter === 'none' && !r.supplier);

            return matchesSearch && matchesSupplier;
        });
    }, [recommendations, search, supplierFilter]);

    // Handle quantity edit
    const handleQuantityChange = (id: number, val: number) => {
        const num = Math.max(0, val);

        setEdits((prev) => ({
            ...prev,
            [id]: {
                finalQuantity: num,
                reason: prev[id]?.reason || '',
            },
        }));
    };

    // Handle reason edit
    const handleReasonChange = (id: number, reason: string) => {
        setEdits((prev) => ({
            ...prev,
            [id]: {
                finalQuantity: prev[id]?.finalQuantity ?? 0,
                reason,
            },
        }));
    };

    // Reset single item edit
    const handleResetItem = (id: number, originalSuggested: number) => {
        setEdits((prev) => ({
            ...prev,
            [id]: {
                finalQuantity: originalSuggested,
                reason: '',
            },
        }));
    };

    // Toggle selection
    const toggleSelect = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    };

    // Select/deselect all visible
    const toggleSelectAllVisible = () => {
        const visibleIds = filteredRecommendations
            .filter((r) => r.status === 'pending')
            .map((r) => r.id);
        const allSelected = visibleIds.every((id) => selectedIds.has(id));

        setSelectedIds((prev) => {
            const next = new Set(prev);

            if (allSelected) {
                for (const id of visibleIds) {
                    next.delete(id);
                }
            } else {
                for (const id of visibleIds) {
                    next.add(id);
                }
            }

            return next;
        });
    };

    // Calculate item unit price
    const getItemUnitPrice = (r: InventoryRecommendationItem): number => {
        const ing = r.ingredient;
        const baseUnit = ing?.unit || r.unit;
        const purchaseUnit = r.purchase_unit || ing?.purchase_unit || baseUnit;
        const unitConversion = Number(ing?.unit_conversion ?? 1);
        const baseCostPrice = Number(ing?.cost_price ?? 0);

        const isConverted =
            Boolean(ing?.purchase_unit) &&
            purchaseUnit === ing?.purchase_unit &&
            unitConversion > 0;

        return isConverted ? Math.round(baseCostPrice * unitConversion) : baseCostPrice;
    };

    // Prepare items for review modal
    const reviewItems: ReviewItem[] = useMemo(() => {
        const list: ReviewItem[] = [];

        for (const r of recommendations) {
            if (selectedIds.has(r.id)) {
                const edit = edits[r.id] || {
                    finalQuantity: r.suggested_quantity,
                    reason: '',
                };

                list.push({
                    recommendation: r,
                    finalQuantity: edit.finalQuantity,
                    reason: edit.reason,
                });
            }
        }

        return list;
    }, [recommendations, selectedIds, edits]);

    // Validation check for review readiness
    const invalidAdjustedItems = useMemo(() => {
        return reviewItems.filter((item) => {
            const isAdjusted =
                Math.abs(item.finalQuantity - item.recommendation.suggested_quantity) > 0.0001;

            return isAdjusted && (!item.reason || item.reason.trim().length < 3);
        });
    }, [reviewItems]);

    const canSubmitReview =
        reviewItems.length > 0 &&
        invalidAdjustedItems.length === 0 &&
        reviewItems.every((item) => item.finalQuantity > 0);

    const invalidQuantityCount = reviewItems.filter((item) => item.finalQuantity <= 0).length;

    // Review bar summary metrics
    const selectedMetrics = useMemo(() => {
        const suppliers = new Set<string>();
        let totalEstimated = 0;

        for (const item of reviewItems) {
            const supKey = item.recommendation.supplier
                ? String(item.recommendation.supplier.id)
                : 'none';

            suppliers.add(supKey);

            const unitPrice = getItemUnitPrice(item.recommendation);

            totalEstimated += item.finalQuantity * unitPrice;
        }

        return {
            itemCount: reviewItems.length,
            supplierCount: suppliers.size,
            totalCost: totalEstimated,
        };
    }, [reviewItems]);

    return (
        <DashboardLayout>
            <Head title="Đề xuất nhập hàng & Tối ưu tồn kho" />

            <div ref={pageRef} className="planning-ui min-w-0 space-y-6 break-words pb-28">
                {/* Header Banner */}
                <div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        Đề xuất mua hàng & Bù tồn kho
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Tính toán tự động theo mô hình EOQ, điểm đặt hàng và chính sách MOQ từ nhà cung cấp
                    </p>
                    <details className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        <summary className="cursor-pointer font-semibold">Giải thích EOQ</summary>
                        <p className="mt-1">EOQ là lượng đặt hàng tính theo chi phí đặt hàng và lưu kho. Bù thiếu hụt tồn kho bổ sung phần thiếu so với điểm đặt hàng; số lượng cuối còn theo chính sách nhà cung cấp.</p>
                    </details>
                </div>

                {/* Forecast Run Status */}
                <RunStatusBanner
                    run={activeRun}
                    defaultHorizon={filters.horizon_days ?? activeRun?.horizon_days ?? 7}
                    sourceDatasetId={filters.synthetic_dataset_id}
                    latestRunStatus={resultSummary.latest_run_status}
                />
                {recommendations.length > 0 && resultSummary.empty_reason && (
                    <PlanningResultState reason={resultSummary.empty_reason} />
                )}
                {recommendations.length > 0 && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {resultSummary.empty_reason === null && resultSummary.positive_recommendation_count === 0 && 'Không có đề xuất nhập thêm trong lượt này. '}
                        Lượt #{activeRun?.id} · {formatDateTime(activeRun?.completed_at || activeRun?.data_cutoff)}.
                        {' '}Chỉ phản ánh {resultSummary.recommendation_count} bản ghi đề xuất đã tạo, không xác nhận đủ tồn kho cho mọi nguyên liệu.
                    </p>
                )}

                {/* Filters & Search Toolbar */}
                <div className="flex flex-col flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px]">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Tìm theo tên hoặc mã nguyên liệu..."
                                aria-label="Tìm theo tên hoặc mã nguyên liệu"
                                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-hidden focus:ring-1 focus:ring-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                            />
                        </div>

                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Filter className="h-4 w-4 text-slate-400" />
                            <select
                                value={supplierFilter}
                                aria-label="Nhà cung cấp"
                                onChange={(e) => setSupplierFilter(e.target.value)}
                                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="all">Tất cả nhà cung cấp</option>
                                {supplierOptions.map(([id, name]) => (
                                    <option key={id} value={id}>
                                        {name}
                                    </option>
                                ))}
                                <option value="none">Chưa phân NCC</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                            Hiển thị <strong className="text-slate-900 dark:text-white">{filteredRecommendations.length}</strong> / {recommendations.length} đề xuất
                        </span>

                        <button
                            type="button"
                            onClick={toggleSelectAllVisible}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            Chọn tất cả
                        </button>
                    </div>
                </div>

                {/* Empty State */}
                {filteredRecommendations.length === 0 && (
                    recommendations.length > 0 ? (
                        <PlanningResultState title="Không có kết quả phù hợp" description="Thử thay đổi điều kiện tìm kiếm hoặc nhà cung cấp.">
                            <button type="button" onClick={() => {
                                setSearch('');
                                setSupplierFilter('all');
                            }} className="mt-3 text-sm font-semibold underline">Xóa bộ lọc</button>
                        </PlanningResultState>
                    ) : <PlanningResultState reason={resultSummary.empty_reason} />
                )}

                {/* Desktop Table View */}
                {filteredRecommendations.length > 0 && (
                    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs md:block dark:border-slate-800 dark:bg-slate-900">
                        <div role="region" aria-label="Đề xuất nhập hàng" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                                    <tr>
                                        <th className="w-12 px-4 py-3.5 text-center">
                                            <input
                                                type="checkbox"
                                                aria-label="Chọn tất cả đề xuất đang hiển thị"
                                                checked={
                                                    filteredRecommendations.length > 0 &&
                                                    filteredRecommendations.every((r) => selectedIds.has(r.id))
                                                }
                                                onChange={toggleSelectAllVisible}
                                                className="rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                                            />
                                        </th>
                                        <th className="px-4 py-3.5">Nguyên liệu</th>
                                        <th className="px-4 py-3.5">Nhà cung cấp</th>
                                        <th className="px-4 py-3.5 text-right">Khả dụng / Điểm đặt hàng</th>
                                        <th className="px-4 py-3.5 text-right">Nhu cầu / Tồn kho an toàn</th>
                                        <th className="px-4 py-3.5 text-center">Phương pháp</th>
                                        <th className="px-4 py-3.5 text-right">Đề xuất</th>
                                        <th className="w-48 px-4 py-3.5 text-center">Số lượng đặt</th>
                                        <th className="px-4 py-3.5 text-right">Thành tiền</th>
                                        <th className="w-20 px-4 py-3.5 text-center">Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {filteredRecommendations.map((r) => {
                                        const ing = r.ingredient;
                                        const isSelected = selectedIds.has(r.id);
                                        const edit = edits[r.id] || {
                                            finalQuantity: r.suggested_quantity,
                                            reason: '',
                                        };
                                        const isAdjusted =
                                            Math.abs(edit.finalQuantity - r.suggested_quantity) > 0.0001;
                                        const unitPrice = getItemUnitPrice(r);
                                        const totalRowCost = edit.finalQuantity * unitPrice;

                                        const onHand = Number(r.stock_snapshot_quantity ?? r.stock_quantity ?? 0);
                                        const reserved = Number(r.reserved_quantity ?? 0);
                                        const available = Math.max(0, onHand - reserved);

                                        const purchaseUnit = r.purchase_unit || ing?.purchase_unit || r.unit;
                                        const isReasonMissing =
                                            isAdjusted && (!edit.reason || edit.reason.trim().length < 3);

                                        return (
                                            <tr
                                                key={r.id}
                                                className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${
                                                    isSelected ? 'bg-sky-50/30 dark:bg-sky-950/20' : ''
                                                }`}
                                            >
                                                {/* Checkbox */}
                                                <td className="px-4 py-3.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        aria-label={`Chọn ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                        disabled={r.status !== 'pending'}
                                                        onChange={() => toggleSelect(r.id)}
                                                        className="rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                                                    />
                                                </td>

                                                {/* Ingredient */}
                                                <td className="px-4 py-3.5">
                                                    <div className="font-semibold text-slate-900 dark:text-white">
                                                        {ing?.name || `Nguyên liệu #${r.ingredient_id}`}
                                                    </div>
                                                    <div className="text-xs font-mono text-slate-400">
                                                        {ing?.code || '-'}
                                                    </div>
                                                </td>

                                                {/* Supplier */}
                                                <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                                                    {r.supplier ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                                            {r.supplier.name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Chưa gán</span>
                                                    )}
                                                </td>

                                                {/* Stock / ROP */}
                                                <td className="px-4 py-3.5 text-right tabular-nums">
                                                    <div className="font-medium text-slate-900 dark:text-slate-200">
                                                        {formatQuantity(available)} {r.unit}
                                                    </div>
                                                    <div className="text-sm text-slate-400">
                                                        Điểm đặt hàng: {formatQuantity(r.reorder_point)}
                                                    </div>
                                                </td>

                                                {/* Demand / SS */}
                                                <td className="px-4 py-3.5 text-right tabular-nums">
                                                    <div className="font-medium text-slate-800 dark:text-slate-300">
                                                        {formatQuantity(r.demand_quantity, 1)} {r.unit}
                                                    </div>
                                                    <div className="text-sm text-amber-600 dark:text-amber-400">
                                                        Tồn kho an toàn: {formatQuantity(r.safety_stock, 1)}
                                                    </div>
                                                </td>

                                                {/* Method */}
                                                <td className="px-4 py-3.5 text-center">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                            r.method === 'eoq'
                                                                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                                        }`}
                                                    >
                                                        {r.method === 'eoq' ? 'EOQ' : 'Bù thiếu hụt tồn kho'}
                                                    </span>
                                                </td>

                                                {/* Suggested */}
                                                <td className="px-4 py-3.5 text-right tabular-nums">
                                                    <span className="font-display font-semibold text-slate-700 dark:text-slate-300">
                                                        {formatQuantity(r.suggested_quantity)}
                                                    </span>{' '}
                                                    <span className="text-xs text-slate-400">{purchaseUnit}</span>
                                                </td>

                                                {/* Final Quantity Input & Reason */}
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="number"
                                                            aria-label={`Số lượng đặt ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                            min="0"
                                                            step="1"
                                                            value={edit.finalQuantity}
                                                            onChange={(e) =>
                                                                handleQuantityChange(r.id, parseFloat(e.target.value) || 0)
                                                            }
                                                            className={`w-24 rounded-lg border px-2.5 py-1 text-right text-xs font-semibold tabular-nums focus:outline-hidden ${
                                                                isAdjusted
                                                                    ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                                                                    : 'border-slate-200 bg-white text-slate-900 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                                                            }`}
                                                        />
                                                        <span className="text-xs text-slate-400">{purchaseUnit}</span>

                                                        {isAdjusted && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleResetItem(r.id, r.suggested_quantity)}
                                                                title="Đặt lại số lượng đề xuất"
                                                                aria-label={`Đặt lại số lượng đề xuất ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                                className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                            >
                                                                <RotateCcw className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Reason input if adjusted */}
                                                    {isAdjusted && (
                                                        <div className="mt-1.5">
                                                            <input
                                                                type="text"
                                                                placeholder="Nhập lý do điều chỉnh..."
                                                                aria-label={`Lý do điều chỉnh ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                                aria-invalid={isReasonMissing}
                                                                aria-describedby={isReasonMissing ? `procurement-reason-error-${r.id}` : undefined}
                                                                value={edit.reason}
                                                                onChange={(e) => handleReasonChange(r.id, e.target.value)}
                                                                className={`w-full rounded-md border px-2 py-1 text-[11px] focus:outline-hidden ${
                                                                    isReasonMissing
                                                                        ? 'border-rose-300 bg-rose-50/50 text-rose-900 placeholder-rose-400 focus:border-rose-500'
                                                                        : 'border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white'
                                                                }`}
                                                            />
                                                            {isReasonMissing && (
                                                                <span id={`procurement-reason-error-${r.id}`} className="text-[10px] text-rose-500">
                                                                    Cần lý do (≥ 3 ký tự)
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Total Price */}
                                                <td className="px-4 py-3.5 text-right tabular-nums">
                                                    <div className="font-display font-semibold text-slate-900 dark:text-white">
                                                        {formatCurrency(totalRowCost)}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {formatCurrency(unitPrice)}/{purchaseUnit}
                                                    </div>
                                                </td>

                                                {/* Action Drawer */}
                                                <td className="px-4 py-3.5 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedDetailItem(r);
                                                            setIsDrawerOpen(true);
                                                        }}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                                                        aria-label="Xem giải trình chi tiết"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Mobile Card List View */}
                {filteredRecommendations.length > 0 && (
                    <div className="space-y-4 md:hidden">
                        {filteredRecommendations.map((r) => {
                            const ing = r.ingredient;
                            const isSelected = selectedIds.has(r.id);
                            const edit = edits[r.id] || {
                                finalQuantity: r.suggested_quantity,
                                reason: '',
                            };
                            const isAdjusted =
                                Math.abs(edit.finalQuantity - r.suggested_quantity) > 0.0001;
                            const unitPrice = getItemUnitPrice(r);
                            const totalRowCost = edit.finalQuantity * unitPrice;
                            const purchaseUnit = r.purchase_unit || ing?.purchase_unit || r.unit;
                            const isReasonMissing =
                                isAdjusted && (!edit.reason || edit.reason.trim().length < 3);

                            return (
                                <div
                                    key={r.id}
                                    className={`rounded-2xl border p-4 shadow-xs transition-colors ${
                                        isSelected
                                            ? 'border-sky-300 bg-sky-50/20 dark:border-sky-800 dark:bg-sky-950/20'
                                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                    }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                aria-label={`Chọn ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                disabled={r.status !== 'pending'}
                                                onChange={() => toggleSelect(r.id)}
                                                className="h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                                            />
                                            <div className="min-w-0 [overflow-wrap:anywhere]">
                                                <h3 className="font-display font-semibold text-slate-900 dark:text-white">
                                                    {ing?.name || `Nguyên liệu #${r.ingredient_id}`}
                                                </h3>
                                                <div className="text-xs font-mono text-slate-400">
                                                    {ing?.code || '-'}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedDetailItem(r);
                                                setIsDrawerOpen(true);
                                            }}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                            aria-label={`Xem giải trình ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Supplier & Details grid */}
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm border-y border-slate-100 py-2.5 dark:border-slate-800">
                                        <div>
                                            <span className="text-slate-400">Nhà cung cấp:</span>
                                            <div className="font-medium text-slate-800 dark:text-slate-200">
                                                {r.supplier?.name || 'Chưa gán NCC'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Phương pháp:</span>
                                            <div className="font-medium text-slate-800 dark:text-slate-200">
                                                {r.method === 'eoq' ? 'EOQ' : 'Bù thiếu hụt tồn kho'}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Nhu cầu / Tồn kho an toàn:</span>
                                            <div className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                                                {formatQuantity(r.demand_quantity, 1)} / {formatQuantity(r.safety_stock, 1)}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Đề xuất:</span>
                                            <div className="font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                                                {formatQuantity(r.suggested_quantity)} {purchaseUnit}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer: Quantity Edit */}
                                    <div className="mt-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                Số lượng đặt:
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    aria-label={`Số lượng đặt ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                    min="0"
                                                    step="1"
                                                    value={edit.finalQuantity}
                                                    onChange={(e) =>
                                                        handleQuantityChange(r.id, parseFloat(e.target.value) || 0)
                                                    }
                                                    className="w-24 rounded-lg border border-slate-200 px-2.5 py-1 text-right text-xs font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                                />
                                                <span className="text-xs text-slate-400">{purchaseUnit}</span>
                                            </div>
                                        </div>

                                        {isAdjusted && (
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="Lý do điều chỉnh (≥ 3 ký tự)..."
                                                    aria-label={`Lý do điều chỉnh ${ing?.name || `Nguyên liệu #${r.ingredient_id}`}`}
                                                    aria-invalid={isReasonMissing}
                                                    aria-describedby={isReasonMissing ? `procurement-mobile-reason-error-${r.id}` : undefined}
                                                    value={edit.reason}
                                                    onChange={(e) => handleReasonChange(r.id, e.target.value)}
                                                    className={`w-full rounded-md border px-2.5 py-1 text-xs focus:outline-hidden ${
                                                        isReasonMissing
                                                            ? 'border-rose-300 bg-rose-50/50 text-rose-900 placeholder-rose-400'
                                                            : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white'
                                                    }`}
                                                />
                                                {isReasonMissing && (
                                                    <span id={`procurement-mobile-reason-error-${r.id}`} className="text-[10px] text-rose-500">
                                                        Vui lòng nhập lý do điều chỉnh
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                                            <span className="text-slate-400">Thành tiền ước tính:</span>
                                            <span className="font-display font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(totalRowCost)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Fixed Bottom Selection & Review Bar */}
            <div ref={reviewBarRef} className="planning-ui fixed inset-x-0 bottom-0 z-40 max-h-[100dvh] overflow-y-auto border-t border-slate-200 bg-white/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="min-w-0 [overflow-wrap:anywhere]">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                Đã chọn: <strong className="text-slate-900 dark:text-white">{selectedMetrics.itemCount}</strong> mặt hàng
                                {selectedMetrics.supplierCount > 0 && (
                                    <> ({selectedMetrics.supplierCount} nhà cung cấp)</>
                                )}
                            </div>
                            <div className="font-display text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-xl">
                                {formatCurrency(selectedMetrics.totalCost)}
                            </div>
                        </div>

                        <div id="procurement-review-blockers" role="status" aria-atomic="true" className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                        {invalidAdjustedItems.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{invalidAdjustedItems.length} mặt hàng thay đổi cần bổ sung lý do</span>
                            </div>
                        )}
                        {invalidQuantityCount > 0 && (
                            <div className="flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{invalidQuantityCount} mặt hàng đã chọn cần số lượng lớn hơn 0</span>
                            </div>
                        )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsReviewModalOpen(true)}
                            disabled={!canSubmitReview}
                            aria-describedby="procurement-review-blockers"
                            className="min-h-11 w-full whitespace-nowrap sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Send className="h-4 w-4" />
                            Xem lại ({selectedMetrics.itemCount})
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail Drawer */}
            <RecommendationDetailDrawer
                isOpen={isDrawerOpen}
                recommendation={selectedDetailItem}
                onClose={() => {
                    setIsDrawerOpen(false);
                    setSelectedDetailItem(null);
                }}
            />

            {/* Review & Approval Modal */}
            <RecommendationReviewModal
                isOpen={isReviewModalOpen}
                items={reviewItems}
                onClose={() => setIsReviewModalOpen(false)}
                syntheticDatasetId={filters?.synthetic_dataset_id}
            />
        </DashboardLayout>
    );
}
