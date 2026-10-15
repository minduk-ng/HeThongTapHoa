import {
    Building2,
    Calculator,
    Clock,
    DollarSign,
    Hash,
    Package,
    Scale,
    Shield,
    X,
} from 'lucide-react';
import PlanningDialog from './PlanningDialog';
import {
    formatCurrency,
    formatDateTime,
    formatQuantity,
} from './planningFormatters';

export interface SupplierPolicyItem {
    id: number;
    ingredient_id: number;
    supplier_id: number;
    is_primary: boolean;
    lead_days: number;
    moq: number;
    order_multiple: number;
    pack_size: number;
    ordering_cost: number;
    annual_holding_cost: number;
    unit_cost?: number | null;
    service_factor: number;
    policy_hash?: string | null;
    supplier?: {
        id: number;
        name: string;
    } | null;
}

export interface InventoryRecommendationItem {
    id: number;
    forecast_run_id: number;
    ingredient_id: number;
    supplier_id?: number | null;
    demand_quantity: number;
    stock_quantity: number;
    reserved_quantity: number;
    safety_stock: number;
    reorder_point: number;
    raw_quantity: number;
    after_moq_quantity: number;
    final_quantity: number;
    suggested_quantity: number;
    method: 'eoq' | 'reorder_gap' | string;
    unit: string;
    purchase_unit?: string | null;
    bom_hash?: string | null;
    policy_hash?: string | null;
    stock_snapshot_at?: string | null;
    stock_snapshot_quantity?: number | null;
    status: string;
    notes?: string | null;
    ingredient?: {
        id: number;
        code: string;
        name: string;
        unit: string;
        purchase_unit?: string | null;
        unit_conversion?: number | null;
        cost_price?: number;
        stock_quantity?: number;
        min_stock_alert?: number;
        primary_supplier_policy?: SupplierPolicyItem | null;
        primarySupplierPolicy?: SupplierPolicyItem | null;
        supplier_policies?: SupplierPolicyItem[];
        supplierPolicies?: SupplierPolicyItem[];
    } | null;
    supplier?: {
        id: number;
        name: string;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
    } | null;
}

interface RecommendationDetailDrawerProps {
    isOpen: boolean;
    recommendation: InventoryRecommendationItem | null;
    onClose: () => void;
}

export default function RecommendationDetailDrawer({
    isOpen,
    recommendation,
    onClose,
}: RecommendationDetailDrawerProps) {
    if (!isOpen || !recommendation) {
        return null;
    }

    const {
        ingredient,
        supplier,
        method,
        demand_quantity,
        safety_stock,
        reorder_point,
        raw_quantity,
        after_moq_quantity,
        suggested_quantity,
        stock_snapshot_at,
        stock_snapshot_quantity,
        stock_quantity,
        reserved_quantity,
        bom_hash,
        policy_hash,
    } = recommendation;

    const onHand = Number(stock_snapshot_quantity ?? stock_quantity ?? 0);
    const reserved = Number(reserved_quantity ?? 0);
    const available = Math.max(0, onHand - reserved);

    const policy =
        ingredient?.primarySupplierPolicy ||
        ingredient?.primary_supplier_policy ||
        ingredient?.supplierPolicies?.[0] ||
        ingredient?.supplier_policies?.[0] ||
        null;

    const baseUnit = ingredient?.unit || recommendation.unit;
    const purchaseUnit = recommendation.purchase_unit || ingredient?.purchase_unit || baseUnit;
    const unitConversion = Number(ingredient?.unit_conversion ?? 1);
    const baseCostPrice = Number(ingredient?.cost_price ?? 0);

    const isPurchaseUnitConverted =
        Boolean(ingredient?.purchase_unit) &&
        purchaseUnit === ingredient?.purchase_unit &&
        unitConversion > 0;

    const purchaseUnitPrice = isPurchaseUnitConverted
        ? Math.round(baseCostPrice * unitConversion)
        : baseCostPrice;

    const totalEstimatedCost = Math.round(suggested_quantity * purchaseUnitPrice);

    const moq = Number(policy?.moq ?? 0);
    const orderMultiple = Number(policy?.order_multiple ?? 0);
    const packSize = Number(policy?.pack_size ?? 1);
    const leadDays = Number(policy?.lead_days ?? 1);

    const isEoq = method === 'eoq';

    return (
        <PlanningDialog open={isOpen} onClose={onClose} labelledBy="recommendation-drawer-title" variant="drawer">
                <div className="flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:max-w-xl dark:border-slate-800 dark:bg-slate-900">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                                <Package className="h-5 w-5" />
                            </div>
                            <div>
                                <h2
                                    id="recommendation-drawer-title"
                                    data-dialog-heading
                                    tabIndex={-1}
                                    className="font-display text-lg font-bold text-slate-900 dark:text-white"
                                >
                                    {ingredient?.name || `Nguyên liệu #${recommendation.ingredient_id}`}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Mã: <span className="font-mono">{ingredient?.code || '-'}</span> | Đơn vị: {purchaseUnit}
                                </p>
                            </div>
                        </div>

                        <button
                            data-dialog-close
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-sky-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label="Đóng bảng chi tiết"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                        {/* Section 1: Stock Status (Snapshot) */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <Scale className="h-3.5 w-3.5" />
                                    Tồn kho & Khả dụng (Snapshot)
                                </span>
                                {stock_snapshot_at && (
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                        <Clock className="h-3 w-3" />
                                        {formatDateTime(stock_snapshot_at)}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-lg border border-slate-200/80 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Thực tế (On-hand)</div>
                                    <div className="mt-1 font-display text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                                        {formatQuantity(onHand)}
                                    </div>
                                    <div className="text-[10px] text-slate-400">{baseUnit}</div>
                                </div>

                                <div className="rounded-lg border border-slate-200/80 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Tạm giữ (Reserved)</div>
                                    <div className="mt-1 font-display text-lg font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                        {formatQuantity(reserved)}
                                    </div>
                                    <div className="text-[10px] text-slate-400">{baseUnit}</div>
                                </div>

                                <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-center dark:border-sky-900/40 dark:bg-sky-950/30">
                                    <div className="text-xs font-medium text-sky-700 dark:text-sky-300">Khả dụng (Available)</div>
                                    <div className="mt-1 font-display text-lg font-bold tabular-nums text-sky-700 dark:text-sky-300">
                                        {formatQuantity(available)}
                                    </div>
                                    <div className="text-[10px] text-sky-600 dark:text-sky-400">{baseUnit}</div>
                                </div>
                            </div>

                            <div className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                                Khả dụng = Tồn kho thực tế ({formatQuantity(onHand)}) - Tạm giữ ({formatQuantity(reserved)})
                            </div>
                        </div>

                        {/* Section 2: Demand & Buffers */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <Shield className="h-3.5 w-3.5" />
                                Nhu cầu giao hàng & Vùng an toàn
                            </span>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                            Nhu cầu trong Lead Time
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            Dự báo tiêu thụ trong {leadDays} ngày chờ hàng
                                        </div>
                                    </div>
                                    <div className="font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                                        {formatQuantity(demand_quantity, 1)} {baseUnit}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                            Tồn kho an toàn
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            Đệm dự phòng biến động nhu cầu
                                        </div>
                                    </div>
                                    <div className="font-display font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                                        {formatQuantity(safety_stock, 1)} {baseUnit}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                            Điểm đặt hàng
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            Điểm đặt hàng = Nhu cầu ({formatQuantity(demand_quantity, 1)}) + Tồn kho an toàn ({formatQuantity(safety_stock, 1)})
                                        </div>
                                    </div>
                                    <div className="font-display font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                                        {formatQuantity(reorder_point, 1)} {baseUnit}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Calculation Method & Rounding Stages */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <Calculator className="h-3.5 w-3.5" />
                                Phương pháp & Các bước làm tròn
                            </span>

                            <div className="mb-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                                <div className="text-xs text-slate-500 dark:text-slate-400">Phương pháp tính:</div>
                                <div className="mt-1 font-display font-semibold text-slate-900 dark:text-white">
                                    {isEoq
                                        ? 'EOQ (Economic Order Quantity) — Tối ưu chi phí đặt hàng & lưu kho'
                                        : 'Bù thiếu hụt tồn kho — Bù đắp lượng thiếu hụt theo điểm đặt hàng'}
                                </div>
                            </div>

                            <div className="relative space-y-4 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
                                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Giai đoạn 1: Số lượng gốc (Raw Quantity)
                                    </div>
                                    <div className="mt-0.5 font-display font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                        {formatQuantity(raw_quantity, 2)} {purchaseUnit}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                        Tính trực tiếp từ mô hình {isEoq ? 'EOQ' : 'Bù thiếu hụt tồn kho'}
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
                                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Giai đoạn 2: Áp dụng MOQ (Số lượng đặt tối thiểu)
                                    </div>
                                    <div className="mt-0.5 font-display font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                        {formatQuantity(after_moq_quantity)} {purchaseUnit}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                        Chính sách MOQ nhà cung cấp: {moq > 0 ? `${formatQuantity(moq)} ${purchaseUnit}` : 'Không áp dụng'}
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        Giai đoạn 3: Bội số đặt hàng & Đóng gói (Final Suggested)
                                    </div>
                                    <div className="mt-0.5 font-display text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                        {formatQuantity(suggested_quantity)} {purchaseUnit}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                        Bội số ({orderMultiple > 0 ? orderMultiple : 1} {purchaseUnit}) | Quy cách thùng ({packSize > 0 ? packSize : 1})
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Supplier & Price Provenance */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <DollarSign className="h-3.5 w-3.5" />
                                Nguồn gốc đơn giá (Price Provenance)
                            </span>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                        <Building2 className="h-4 w-4 text-slate-400" />
                                        Nhà cung cấp đề xuất:
                                    </div>
                                    <div className="font-semibold text-slate-900 dark:text-white">
                                        {supplier?.name || 'NCC Mặc định'}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">
                                        Giá gốc định lượng:
                                    </span>
                                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                                        {formatCurrency(baseCostPrice)} / {baseUnit}
                                    </span>
                                </div>

                                {isPurchaseUnitConverted && (
                                    <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                        <span className="text-sm text-slate-600 dark:text-slate-300">
                                            Hệ số quy đổi đơn vị mua ({purchaseUnit}):
                                        </span>
                                        <span className="tabular-nums text-slate-700 dark:text-slate-300">
                                            1 {purchaseUnit} = {formatQuantity(unitConversion)} {baseUnit}
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        Đơn giá nhập hàng:
                                    </span>
                                    <span className="font-display font-semibold tabular-nums text-slate-900 dark:text-white">
                                        {formatCurrency(purchaseUnitPrice)} / {purchaseUnit}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between rounded-lg bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                                    <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                        Tổng thành tiền ước tính:
                                    </span>
                                    <span className="font-display text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                        {formatCurrency(totalEstimatedCost)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Audit / Hashes Section */}
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-950">
                            <div className="mb-1 flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400">
                                <Hash className="h-3 w-3" />
                                Tính toàn vẹn dữ liệu (Audit Hashes)
                            </div>
                            <div className="truncate font-mono">
                                BOM Hash: {bom_hash ? bom_hash.slice(0, 24) + '...' : 'N/A'}
                            </div>
                            <div className="truncate font-mono">
                                Policy Hash: {policy_hash ? policy_hash.slice(0, 24) + '...' : 'N/A'}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Đóng bảng chi tiết"
                            className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
        </PlanningDialog>
    );
}
