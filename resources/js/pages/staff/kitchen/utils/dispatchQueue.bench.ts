import { strict as assert } from 'node:assert';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';
import {
    isGroupLongWait,
    MinHeap,
    orderGroups
    
    
} from './dispatchQueue.ts';
import type {DispatchMode, QueueGroup} from './dispatchQueue.ts';

// Deterministic PRNG using Mulberry32 (seed 20261016)
function mulberry32(seed: number): () => number {
    let s = seed >>> 0;

    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface SimulatedGroup extends QueueGroup {
    serviceDurationMs: number;
}

const STATIONS = [
    { id: 1, name: 'Pha chế (Bar)', workers: 2 },
    { id: 2, name: 'Bếp nóng (Kitchen)', workers: 3 },
    { id: 3, name: 'Bếp tổng (General)', workers: 1 },
];

function generateDataset(n: number, seed = 20261016): SimulatedGroup[] {
    const random = mulberry32(seed);
    const baseTimeMs = Date.parse('2026-10-16T10:00:00.000Z');
    const groups: SimulatedGroup[] = new Array(n);

    let currentSentMs = baseTimeMs;

    for (let i = 0; i < n; i++) {
        // Bursty vs uniform arrivals: 25% burst (0s offset), 75% uniform (5s - 45s)
        const isBurst = random() < 0.25;
        const arrivalDeltaSec = isBurst ? Math.floor(random() * 3) : 5 + Math.floor(random() * 40);
        currentSentMs += arrivalDeltaSec * 1000;

        const stationIdx = Math.floor(random() * STATIONS.length);
        const station = STATIONS[stationIdx];

        const targetMinutes = 15;
        const longWaitMinutes = 20;

        // Service duration: 2 to 14 minutes (longer jobs included for starvation test)
        const isLongJob = random() < 0.15;
        const serviceDurationMin = isLongJob ? 10 + Math.floor(random() * 15) : 2 + Math.floor(random() * 6);
        const serviceDurationMs = serviceDurationMin * 60 * 1000;

        // Manual deadline edits: 10% modified deadline (some urgent, some relaxed)
        const isManualDeadline = random() < 0.1;
        let deadlineOffsetMin = targetMinutes;

        if (isManualDeadline) {
            deadlineOffsetMin = random() < 0.5 ? 5 + Math.floor(random() * 5) : 25 + Math.floor(random() * 10);
        }

        const sentAt = new Date(currentSentMs).toISOString();
        const deadlineAt = new Date(currentSentMs + deadlineOffsetMin * 60 * 1000).toISOString();

        groups[i] = {
            id: i + 1,
            batchId: 10000 + i,
            orderId: 5000 + (i % 200),
            stationId: station.id,
            stationName: station.name,
            sentAt,
            deadlineAt,
            targetMinutes,
            longWaitMinutes,
            version: 1,
            origin: random() < 0.05 ? 'legacy_item' : 'send',
            items: [
                {
                    id: 20000 + i * 2,
                    name: `Món ${i + 1}`,
                    quantity: 1 + Math.floor(random() * 3),
                    status: 'pending',
                },
            ],
            serviceDurationMs,
        };
    }

    return groups;
}

// Comparator oracle using Array.prototype.sort
function oracleSort(groups: readonly QueueGroup[], mode: DispatchMode, nowMs: number): QueueGroup[] {
    const copy = groups.slice();

    copy.sort((a, b) => {
        const aSentMs = Date.parse(a.sentAt);
        const bSentMs = Date.parse(b.sentAt);

        if (mode === 'fifo') {
            if (aSentMs !== bSentMs) {
                return aSentMs - bSentMs;
            }

            return a.id - b.id;
        }

        const aLong = isGroupLongWait(a, nowMs);
        const bLong = isGroupLongWait(b, nowMs);

        if (aLong !== bLong) {
            return aLong ? -1 : 1;
        }

        if (aLong) {
            if (aSentMs !== bSentMs) {
                return aSentMs - bSentMs;
            }

            return a.id - b.id;
        }

        const aDeadMs = Date.parse(a.deadlineAt);
        const bDeadMs = Date.parse(b.deadlineAt);

        if (aDeadMs !== bDeadMs) {
            return aDeadMs - bDeadMs;
        }

        if (aSentMs !== bSentMs) {
            return aSentMs - bSentMs;
        }

        return a.id - b.id;
    });

    return copy;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) {
return 0;
}

    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));

    return sorted[idx];
}

describe('Kitchen Dispatch Queue - Benchmarks & Simulation', () => {
    it('Oracle comparison: MinHeap output strictly matches comparator sort', () => {
        const sizes = [100, 1_000, 10_000];
        const nowMs = Date.parse('2026-10-16T11:00:00.000Z');

        for (const n of sizes) {
            const data = generateDataset(n);

            // Test FIFO oracle
            const fifoHeap = orderGroups(data, 'fifo', nowMs);
            const fifoOracle = oracleSort(data, 'fifo', nowMs);
            assert.deepEqual(
                fifoHeap.map((g) => g.id),
                fifoOracle.map((g) => g.id),
                `FIFO mismatch at n=${n}`
            );

            // Test Priority oracle
            const prioHeap = orderGroups(data, 'priority', nowMs);
            const prioOracle = oracleSort(data, 'priority', nowMs);
            assert.deepEqual(
                prioHeap.map((g) => g.id),
                prioOracle.map((g) => g.id),
                `Priority mismatch at n=${n}`
            );
        }
    });

    it('Benchmark: measures projection, heap-build, first-extract, full-extract, render', () => {
        const sizes = [100, 1_000, 10_000];
        const warmups = 5;
        const runs = 30;
        const nowMs = Date.parse('2026-10-16T11:00:00.000Z');

        console.log('\n--- HARDWARE & RUNTIME METADATA ---');
        console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
        console.log(`CPU: ${os.cpus()[0]?.model ?? 'Unknown'} (Cores: ${os.cpus().length})`);
        console.log(`Node.js: ${process.version}`);
        console.log(`Memory: Total ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB, Free ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB\n`);

        console.log('--- BENCHMARK RESULTS (Median / P95 in ms across 30 measured runs) ---');

        for (const n of sizes) {
            const data = generateDataset(n);
            const rawJson = JSON.stringify(data);

            const projTimes: number[] = [];
            const heapTimes: number[] = [];
            const firstExtTimes: number[] = [];
            const fullExtTimes: number[] = [];
            const renderTimes: number[] = [];

            for (let r = 0; r < warmups + runs; r++) {
                // 1. Projection / Network deserialization & transformation
                const t0 = performance.now();
                const parsedGroups: QueueGroup[] = JSON.parse(rawJson);
                const t1 = performance.now();

                // 2. Heap Build (bottom-up Floyd heapify O(n))
                const compare = (a: QueueGroup, b: QueueGroup) => {
                    const aLong = isGroupLongWait(a, nowMs);
                    const bLong = isGroupLongWait(b, nowMs);

                    if (aLong !== bLong) {
return aLong ? -1 : 1;
}

                    if (aLong) {
                        const aS = Date.parse(a.sentAt);
                        const bS = Date.parse(b.sentAt);

                        return aS !== bS ? aS - bS : a.id - b.id;
                    }

                    const aD = Date.parse(a.deadlineAt);
                    const bD = Date.parse(b.deadlineAt);

                    if (aD !== bD) {
return aD - bD;
}

                    const aS = Date.parse(a.sentAt);
                    const bS = Date.parse(b.sentAt);

                    return aS !== bS ? aS - bS : a.id - b.id;
                };

                const t2 = performance.now();
                const heap = new MinHeap<QueueGroup>(compare, parsedGroups);
                const t3 = performance.now();

                // 3. First extract (peak recommendation O(1) or pop O(log n))
                const t4 = performance.now();
                const top = heap.pop();
                const t5 = performance.now();
                assert.ok(top !== undefined);

                // 4. Full extract (all remaining elements O(n log n))
                const t6 = performance.now();
                const allExtracted = heap.extractAll();
                const t7 = performance.now();
                assert.equal(allExtracted.length, n - 1);

                // 5. Render simulation (mapping ordered groups to presentation cards)
                const t8 = performance.now();
                const cards = [top, ...allExtracted].map((g) => ({
                    id: g.id,
                    station: g.stationName,
                    isLongWait: isGroupLongWait(g, nowMs),
                    isOverdue: nowMs > Date.parse(g.deadlineAt),
                    waitMin: Math.max(0, Math.floor((nowMs - Date.parse(g.sentAt)) / 60000)),
                    itemCount: g.items.length,
                }));
                const t9 = performance.now();
                assert.equal(cards.length, n);

                if (r >= warmups) {
                    projTimes.push(t1 - t0);
                    heapTimes.push(t3 - t2);
                    firstExtTimes.push(t5 - t4);
                    fullExtTimes.push(t7 - t6);
                    renderTimes.push(t9 - t8);
                }
            }

            console.log(`[n = ${n.toString().padStart(5)}]`);
            console.log(`  Projection/Network : Median = ${percentile(projTimes, 50).toFixed(3)}ms | P95 = ${percentile(projTimes, 95).toFixed(3)}ms (Ops: O(n))`);
            console.log(`  Heap Build (Floyd) : Median = ${percentile(heapTimes, 50).toFixed(3)}ms | P95 = ${percentile(heapTimes, 95).toFixed(3)}ms (Ops: O(n))`);
            console.log(`  First Extract      : Median = ${percentile(firstExtTimes, 50).toFixed(4)}ms | P95 = ${percentile(firstExtTimes, 95).toFixed(4)}ms (Ops: O(log n))`);
            console.log(`  Full Extract       : Median = ${percentile(fullExtTimes, 50).toFixed(3)}ms | P95 = ${percentile(fullExtTimes, 95).toFixed(3)}ms (Ops: O(n log n))`);
            console.log(`  Render Projection  : Median = ${percentile(renderTimes, 50).toFixed(3)}ms | P95 = ${percentile(renderTimes, 95).toFixed(3)}ms (Ops: O(n))`);
        }
    });

    it('Simulation: Identical equal-capacity comparison for FIFO vs Priority', () => {
        const dataset = generateDataset(1_000, 20261016);
        const horizonMs = Date.parse('2026-10-16T14:00:00.000Z'); // 4-hour evaluation horizon

        interface SimulationResult {
            avgWaitMin: number;
            maxWaitMin: number;
            completedCount: number;
            missedDeadlineCount: number;
            missedDeadlineShare: number;
            unfinishedAtHorizonCount: number;
            unfinishedAtHorizonShare: number;
        }

        function runSim(mode: DispatchMode): SimulationResult {
            // Worker state: per station, array of worker busy-until timestamps
            const workers: Record<number, number[]> = {};

            for (const st of STATIONS) {
                workers[st.id] = new Array(st.workers).fill(0);
            }

            // Remaining groups by station
            const pendingByStation: Record<number, SimulatedGroup[]> = {};

            for (const st of STATIONS) {
                pendingByStation[st.id] = dataset.filter((g) => g.stationId === st.id);
            }

            const waitTimesMin: number[] = [];
            let missedDeadlines = 0;
            let completedCount = 0;
            let unfinishedAtHorizon = 0;

            // Track each group's completion time
            for (const st of STATIONS) {
                const stationWorkers = workers[st.id];
                const pool = pendingByStation[st.id].slice(); // copy

                while (pool.length > 0) {
                    // Find worker that frees earliest
                    let earliestWorkerIdx = 0;

                    for (let w = 1; w < stationWorkers.length; w++) {
                        if (stationWorkers[w] < stationWorkers[earliestWorkerIdx]) {
                            earliestWorkerIdx = w;
                        }
                    }

                    const workerFreeTime = stationWorkers[earliestWorkerIdx];

                    // Find eligible groups: sentAt <= workerFreeTime (or next earliest arrival if all future)
                    const eligible = pool.filter((g) => Date.parse(g.sentAt) <= workerFreeTime);

                    let nextGroup: SimulatedGroup;
                    let startTime: number;

                    if (eligible.length > 0) {
                        startTime = workerFreeTime;

                        // Select next group according to dispatch policy at startTime
                        if (mode === 'fifo') {
                            eligible.sort((a, b) => {
                                const aS = Date.parse(a.sentAt);
                                const bS = Date.parse(b.sentAt);

                                return aS !== bS ? aS - bS : a.id - b.id;
                            });
                            nextGroup = eligible[0];
                        } else {
                            // Priority mode: long-wait partition first, then deadline
                            eligible.sort((a, b) => {
                                const aLong = isGroupLongWait(a, startTime);
                                const bLong = isGroupLongWait(b, startTime);

                                if (aLong !== bLong) {
return aLong ? -1 : 1;
}

                                if (aLong) {
                                    const aS = Date.parse(a.sentAt);
                                    const bS = Date.parse(b.sentAt);

                                    return aS !== bS ? aS - bS : a.id - b.id;
                                }

                                const aD = Date.parse(a.deadlineAt);
                                const bD = Date.parse(b.deadlineAt);

                                if (aD !== bD) {
return aD - bD;
}

                                const aS = Date.parse(a.sentAt);
                                const bS = Date.parse(b.sentAt);

                                return aS !== bS ? aS - bS : a.id - b.id;
                            });
                            nextGroup = eligible[0];
                        }
                    } else {
                        // All remaining groups arrive after workerFreeTime; advance clock to earliest arrival
                        pool.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
                        nextGroup = pool[0];
                        startTime = Date.parse(nextGroup.sentAt);
                    }

                    // Remove selected group from pool
                    const poolIdx = pool.findIndex((g) => g.id === nextGroup.id);
                    pool.splice(poolIdx, 1);

                    // Execute group
                    const sentAtMs = Date.parse(nextGroup.sentAt);
                    const waitMin = Math.max(0, (startTime - sentAtMs) / 60000);
                    waitTimesMin.push(waitMin);

                    const finishTime = startTime + nextGroup.serviceDurationMs;
                    stationWorkers[earliestWorkerIdx] = finishTime;

                    const deadlineMs = Date.parse(nextGroup.deadlineAt);

                    if (finishTime > deadlineMs) {
                        missedDeadlines++;
                    }

                    if (startTime > horizonMs) {
                        unfinishedAtHorizon++;
                    }

                    completedCount++;
                }
            }

            const totalWait = waitTimesMin.reduce((sum, w) => sum + w, 0);
            const avgWaitMin = waitTimesMin.length > 0 ? totalWait / waitTimesMin.length : 0;
            const maxWaitMin = waitTimesMin.length > 0 ? Math.max(...waitTimesMin) : 0;

            return {
                avgWaitMin,
                maxWaitMin,
                completedCount,
                missedDeadlineCount: missedDeadlines,
                missedDeadlineShare: (missedDeadlines / completedCount) * 100,
                unfinishedAtHorizonCount: unfinishedAtHorizon,
                unfinishedAtHorizonShare: (unfinishedAtHorizon / completedCount) * 100,
            };
        }

        const fifoRes = runSim('fifo');
        const prioRes = runSim('priority');

        console.log('\n--- SIMULATION RESULTS: EQUAL CAPACITY DRAINED RUN (n = 1,000 groups) ---');
        console.log('Policy    | Avg Wait (m) | Max Wait (m) | Missed Deadlines | Missed Share (%) | Horizon Unfinished');
        console.log('----------|--------------|--------------|------------------|------------------|-------------------');
        console.log(
            `FIFO      | ${fifoRes.avgWaitMin.toFixed(2).padStart(12)} | ${fifoRes.maxWaitMin.toFixed(2).padStart(12)} | ${fifoRes.missedDeadlineCount.toString().padStart(16)} | ${(fifoRes.missedDeadlineShare.toFixed(2) + '%').padStart(16)} | ${fifoRes.unfinishedAtHorizonCount.toString().padStart(18)}`
        );
        console.log(
            `Priority  | ${prioRes.avgWaitMin.toFixed(2).padStart(12)} | ${prioRes.maxWaitMin.toFixed(2).padStart(12)} | ${prioRes.missedDeadlineCount.toString().padStart(16)} | ${(prioRes.missedDeadlineShare.toFixed(2) + '%').padStart(16)} | ${prioRes.unfinishedAtHorizonCount.toString().padStart(18)}`
        );
        console.log('-------------------------------------------------------------------------------------------------');

        assert.equal(fifoRes.completedCount, 1_000);
        assert.equal(prioRes.completedCount, 1_000);
    });
});
