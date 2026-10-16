import type { CartItem, POSProductData, POSTableData } from '../types/pos.types';

export type { CartItem, POSProductData, POSTableData };

export interface DraftLine {
    draftLineId: string;
    menu_item_id: number;
    quantity: number;
    note?: string;
    unit_price: number;
    vat_rate: number;
    orderItemId?: number;
    [k: string]: unknown;
}

export interface DraftSnapshot {
    rows: DraftLine[];
}

export type UndoEntry = DraftSnapshot;

export function generateDraftLineId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `draft_line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function freeze<T>(v: T): T {
    if (Array.isArray(v)) {
        v.forEach(freeze);

        return Object.freeze(v) as T;
    }

    if (v && typeof v === 'object') {
        Object.values(v).forEach(freeze);

        return Object.freeze(v) as T;
    }

    return v;
}

function cloneRows(rows: readonly DraftLine[]): DraftLine[] {
    return structuredClone([...rows]);
}

export function pushDraftSnapshot(
    history: readonly DraftSnapshot[],
    snap: DraftSnapshot,
    cap = 50,
): DraftSnapshot[] {
    const frozen: DraftSnapshot = freeze({ rows: cloneRows(snap.rows) });
    const next = [...history, frozen];

    if (next.length > cap) {
        return next.slice(next.length - cap);
    }

    return next;
}

export function popDraftSnapshot(history: readonly DraftSnapshot[]): {
    snapshot?: DraftSnapshot;
    nextHistory: DraftSnapshot[];
} {
    if (history.length === 0) {
        return { snapshot: undefined, nextHistory: [] };
    }

    const snapshot = history[history.length - 1];
    const nextHistory = history.slice(0, -1);

    return { snapshot, nextHistory };
}

export function validateRestore(
    snap: DraftSnapshot,
    latestProducts: ReadonlyMap<
        number,
        Pick<POSProductData, 'is_available'> &
            Partial<Pick<POSProductData, 'max_servings'>>
    >,
): { ok: true } | { ok: false; message: string } {
    const demand = new Map<number, number>();

    for (const r of snap.rows) {
        demand.set(
            r.menu_item_id,
            (demand.get(r.menu_item_id) ?? 0) + r.quantity,
        );
    }

    for (const [id, qty] of demand) {
        const p = latestProducts.get(id);

        if (!p) {
            return { ok: false, message: 'Món đã không còn trong thực đơn.' };
        }

        if (!p.is_available) {
            return { ok: false, message: 'Món hiện đã hết hàng.' };
        }

        const cap = p.max_servings;

        if (cap == null || !Number.isFinite(cap) || cap < 0) {
            return { ok: false, message: 'Chưa có dữ liệu suất phục vụ hiện tại.' };
        }

        if (qty > cap) {
            return {
                ok: false,
                message: 'Số lượng vượt quá suất phục vụ hiện tại.',
            };
        }
    }

    return { ok: true };
}

export interface ServerItemView {
    id: number;
    quantity: number;
    unit_price: number;
    note?: string | null;
    status?: string;
    isConfirmed?: boolean;
    isKitchenCompleted?: boolean;
    isServed?: boolean;
}

export interface ServerOrderView {
    id: number;
    invoiceKey: string;
    status: string;
    tableId: number;
    groupId?: number;
    items: ServerItemView[];
}

export function fingerprintBaseline(orders: readonly ServerOrderView[]): string {
    if (!orders || !Array.isArray(orders)) {
        return '[]';
    }

    const canon = [...orders]
        .map((o) => ({
            id: o.id,
            t: o.tableId,
            g: o.groupId ?? o.tableId,
            k: o.invoiceKey,
            s: o.status,
            items: [...(o.items || [])]
                .map((i) => [
                    i.id,
                    i.quantity,
                    i.unit_price,
                    i.note ?? '',
                    i.status ?? '',
                    !!i.isConfirmed,
                    !!i.isKitchenCompleted,
                    !!i.isServed,
                ] as const)
                .sort((a, b) => (a[0] as number) - (b[0] as number)),
        }))
        .sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

    return JSON.stringify(canon);
}

export function extractServerOrderViews(
    tables: readonly POSTableData[],
): ServerOrderView[] {
    const views: ServerOrderView[] = [];
    const safeTables = (
        Array.isArray(tables) ? tables : Object.values(tables || {})
    ) as readonly POSTableData[];

    for (const table of safeTables) {
        const allOrders =
            table.active_orders ||
            (table.active_order ? [table.active_order] : []);

        for (const order of allOrders) {
            const isOrderCompleted = order.status === 'completed';
            const isDraft =
                order.status === 'draft' || order.status === 'reserved';
            const invoiceKey = order.order_code || `draft_${order.id}`;

            const items: ServerItemView[] = (order.items || [])
                .filter((item) => item.status !== 'cancelled')
                .map((item) => ({
                    id: item.id,
                    quantity: item.quantity,
                    unit_price: Number(item.unit_price),
                    note: item.note ?? null,
                    status: item.status,
                    isConfirmed: !isDraft,
                    isKitchenCompleted:
                        item.status === 'completed' || isOrderCompleted,
                    isServed: !!item.served_at,
                }));

            views.push({
                id: order.id,
                invoiceKey,
                status: order.status,
                tableId: table.id,
                groupId: table.merged_into_table_id ?? table.id,
                items,
            });
        }
    }

    return views;
}
