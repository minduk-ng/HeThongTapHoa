import { strict as assert } from 'node:assert';
import os from 'node:os';
import process from 'node:process';
import { describe, it } from 'node:test';
import type { DraftLine, DraftSnapshot } from './draftUndo.ts';
import {
    popDraftSnapshot,
    pushDraftSnapshot,
    validateRestore,
} from './draftUndo.ts';

/**
 * Benchmark note:
 * Per-action Undo is not O(1) end-to-end: stack push/pop is O(1) but snapshot clone/restore is O(rows).
 */

function createDummyProducts(
    count: number,
): Map<number, { is_available: boolean; max_servings?: number }> {
    const map = new Map<
        number,
        { is_available: boolean; max_servings?: number }
    >();

    for (let i = 1; i <= count; i++) {
        map.set(i, { is_available: true, max_servings: 100 });
    }

    return map;
}

function createDummyRows(count: number): DraftLine[] {
    const rows: DraftLine[] = [];

    for (let i = 1; i <= count; i++) {
        rows.push({
            draftLineId: `bench-line-${i}`,
            menu_item_id: i,
            quantity: 2,
            unit_price: 25000,
            vat_rate: 10,
            note: `Ghi chú món ${i}`,
            name: `Món số ${i}`,
        });
    }

    return rows;
}

function calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 !== 0) {
        return sorted[mid];
    }

    return (sorted[mid - 1] + sorted[mid]) / 2;
}

describe('Draft Undo Benchmark', () => {
    const sizes = [10, 30, 60];
    const warmups = 5;
    const runs = 30;

    for (const size of sizes) {
        it(`measures push/pop + snapshot clone/restore for ${size} draft rows (5 warmups, median of 30 runs)`, () => {
            const products = createDummyProducts(size);
            const rows = createDummyRows(size);
            const snapshot: DraftSnapshot = { rows };

            // 1. Warmup push
            for (let i = 0; i < warmups; i++) {
                pushDraftSnapshot([], snapshot);
            }

            // 2. Measure push (O(rows) due to snapshot deep-clone and freeze)
            const pushTimes: number[] = [];

            for (let i = 0; i < runs; i++) {
                const start = performance.now();

                pushDraftSnapshot([], snapshot);
                const end = performance.now();

                pushTimes.push(end - start);
            }

            // Prepare history for pop & restore
            const history = pushDraftSnapshot([], snapshot);

            // 3. Warmup pop + restore
            for (let i = 0; i < warmups; i++) {
                const { snapshot: popped } = popDraftSnapshot(history);

                if (popped) {
                    validateRestore(popped, products);
                    void popped.rows.map((r) => ({ ...r }));
                }
            }

            // 4. Measure pop + snapshot restore (O(rows) due to validateRestore and row reconstruction)
            const popRestoreTimes: number[] = [];

            for (let i = 0; i < runs; i++) {
                const start = performance.now();
                const { snapshot: popped } = popDraftSnapshot(history);

                if (popped) {
                    validateRestore(popped, products);
                    void popped.rows.map((r) => ({ ...r }));
                }

                const end = performance.now();

                popRestoreTimes.push(end - start);
            }

            const medianPush = calculateMedian(pushTimes);
            const medianPopRestore = calculateMedian(popRestoreTimes);

            console.log(
                `[Benchmark Result] ${size} rows | Push median: ${medianPush.toFixed(4)} ms | Pop+Restore median: ${medianPopRestore.toFixed(4)} ms | Runtime: Node ${process.version}, ${os.platform()} (${os.arch()}), CPU: ${os.cpus()[0]?.model || 'unknown'}`,
            );

            // Note check: Per-action Undo is not O(1) end-to-end (stack push/pop is O(1) but snapshot clone/restore is O(rows)).
            assert.ok(medianPush >= 0, 'Push time must be non-negative');
            assert.ok(
                medianPopRestore >= 0,
                'Pop+Restore time must be non-negative',
            );
        });
    }
});
