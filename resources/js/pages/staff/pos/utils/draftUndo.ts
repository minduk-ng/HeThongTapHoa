import type { CartItem, POSProductData } from '../types/pos.types';

export type { CartItem, POSProductData };

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
    return rows.map((r) => ({ ...r }));
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

        const cap = p.max_servings ?? 999;

        if (qty > cap) {
            return {
                ok: false,
                message: 'Số lượng vượt quá suất phục vụ hiện tại.',
            };
        }
    }

    return { ok: true };
}

export interface BaselinePayload {
    tables: unknown;
}

export function fingerprintBaseline(payload: BaselinePayload): string {
    return JSON.stringify(payload.tables ?? null);
}
