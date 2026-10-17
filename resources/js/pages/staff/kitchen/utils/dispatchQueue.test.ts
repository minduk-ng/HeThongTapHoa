import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { QueueGroup } from './dispatchQueue.ts';
import {
    MinHeap,
    filterGroupsByStation,
    isGroupLongWait,
    orderGroups,
} from './dispatchQueue.ts';

const createGroup = (
    id: number,
    sentAt: string,
    deadlineAt: string,
    options?: {
        longWaitMinutes?: number;
        targetMinutes?: number;
        stationId?: number;
    },
): QueueGroup => ({
    id,
    batchId: id,
    orderId: id,
    stationId: options?.stationId ?? 1,
    stationName: 'general',
    sentAt,
    deadlineAt,
    targetMinutes: options?.targetMinutes ?? 15,
    longWaitMinutes: options?.longWaitMinutes ?? 20,
    version: 1,
    origin: 'send',
    items: [],
});

describe('orderGroups - FIFO mode', () => {
    it('orders by sentAt ascending', () => {
        const out = orderGroups(
            [
                createGroup(2, '2026-10-16T10:01:00Z', '2026-10-16T10:16:00Z'),
                createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z'),
            ],
            'fifo',
            Date.parse('2026-10-16T10:30:00Z'),
        );
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2],
        );
    });

    it('breaks ties using numeric id ascending when sentAt is identical', () => {
        const sentAt = '2026-10-16T10:00:00Z';
        const out = orderGroups(
            [
                createGroup(5, sentAt, '2026-10-16T10:15:00Z'),
                createGroup(2, sentAt, '2026-10-16T10:15:00Z'),
                createGroup(9, sentAt, '2026-10-16T10:15:00Z'),
                createGroup(1, sentAt, '2026-10-16T10:15:00Z'),
            ],
            'fifo',
            Date.parse('2026-10-16T10:30:00Z'),
        );
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2, 5, 9],
        );
    });
});

describe('orderGroups - Priority mode', () => {
    it('orders regular groups by deadlineAt then sentAt then id ascending', () => {
        const now = Date.parse('2026-10-16T10:05:00Z');
        const groups = [
            createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T10:20:00Z'),
            createGroup(2, '2026-10-16T10:00:00Z', '2026-10-16T10:10:00Z'),
            createGroup(3, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z'),
        ];
        const out = orderGroups(groups, 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [2, 3, 1],
        );
    });

    it('breaks deadline ties using sentAt then id ascending', () => {
        const now = Date.parse('2026-10-16T10:05:00Z');
        const groups = [
            createGroup(1, '2026-10-16T10:02:00Z', '2026-10-16T10:20:00Z'),
            createGroup(2, '2026-10-16T10:00:00Z', '2026-10-16T10:20:00Z'),
            createGroup(3, '2026-10-16T10:00:00Z', '2026-10-16T10:20:00Z'),
        ];
        const out = orderGroups(groups, 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [2, 3, 1],
        );
    });

    it('partitions long-wait groups before regular groups even with later deadline', () => {
        const now = Date.parse('2026-10-16T11:00:00Z');
        const groups = [
            createGroup(1, '2026-10-16T10:50:00Z', '2026-10-16T10:55:00Z'),
            createGroup(2, '2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z'),
        ];
        const out = orderGroups(groups, 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [2, 1],
        );
    });

    it('orders inside long-wait partition by sentAt then id ascending', () => {
        const now = Date.parse('2026-10-16T11:00:00Z');
        const groups = [
            createGroup(1, '2026-10-16T10:10:00Z', '2026-10-16T10:15:00Z'),
            createGroup(2, '2026-10-16T10:00:00Z', '2026-10-16T10:30:00Z'),
            createGroup(3, '2026-10-16T10:10:00Z', '2026-10-16T10:10:00Z'),
        ];
        const out = orderGroups(groups, 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [2, 1, 3],
        );
    });

    it('respects exact longWaitMinutes boundary (wait >= threshold)', () => {
        const now = Date.parse('2026-10-16T10:20:00.000Z');
        const groupExact = createGroup(
            1,
            '2026-10-16T10:00:00.000Z',
            '2026-10-16T11:00:00.000Z',
        );
        const groupUnder = createGroup(
            2,
            '2026-10-16T10:00:00.001Z',
            '2026-10-16T10:05:00.000Z',
        );

        const out = orderGroups([groupUnder, groupExact], 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2],
        );
    });

    it('treats future sent time as non-negative wait but NOT long-wait', () => {
        const now = Date.parse('2026-10-16T10:00:00Z');
        const futureGroup = createGroup(
            1,
            '2026-10-16T10:10:00Z',
            '2026-10-16T10:30:00Z',
            {
                longWaitMinutes: 0,
            },
        );
        const normalGroup = createGroup(
            2,
            '2026-10-16T09:59:00Z',
            '2026-10-16T10:15:00Z',
        );

        const out = orderGroups([futureGroup, normalGroup], 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [2, 1],
        );
    });

    it('uses each group snapshot longWaitMinutes rather than a global constant', () => {
        const now = Date.parse('2026-10-16T10:15:00Z');
        const g1 = createGroup(
            1,
            '2026-10-16T10:00:00Z',
            '2026-10-16T11:00:00Z',
            { longWaitMinutes: 10 },
        );
        const g2 = createGroup(
            2,
            '2026-10-16T10:00:00Z',
            '2026-10-16T10:05:00Z',
            { longWaitMinutes: 30 },
        );

        const out = orderGroups([g2, g1], 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2],
        );
    });
});

describe('orderGroups - immutability and edge cases', () => {
    it('does not mutate input array or objects when deeply frozen', () => {
        const now = Date.parse('2026-10-16T10:30:00Z');
        const g1 = Object.freeze(
            createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z'),
        );
        const g2 = Object.freeze(
            createGroup(2, '2026-10-16T10:05:00Z', '2026-10-16T10:10:00Z'),
        );
        const list = Object.freeze([g2, g1]);

        const out = orderGroups(list, 'priority', now);
        assert.notEqual(out, list);
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2],
        );
    });

    it('handles empty input array', () => {
        const out = orderGroups([], 'priority', Date.now());
        assert.deepEqual(out, []);
    });

    it('handles single element array', () => {
        const g = createGroup(
            1,
            '2026-10-16T10:00:00Z',
            '2026-10-16T10:15:00Z',
        );
        const out = orderGroups([g], 'priority', Date.now());
        assert.deepEqual(out, [g]);
    });

    it('correctly sorts larger permutation using Min-Heap', () => {
        const now = Date.parse('2026-10-16T12:00:00Z');
        const raw = [
            createGroup(10, '2026-10-16T11:50:00Z', '2026-10-16T12:05:00Z'),
            createGroup(2, '2026-10-16T11:00:00Z', '2026-10-16T12:30:00Z'),
            createGroup(5, '2026-10-16T11:50:00Z', '2026-10-16T12:01:00Z'),
            createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T13:00:00Z'),
            createGroup(3, '2026-10-16T11:00:00Z', '2026-10-16T12:00:00Z'),
            createGroup(8, '2026-10-16T11:55:00Z', '2026-10-16T12:01:00Z'),
        ];
        const out = orderGroups(raw, 'priority', now);
        assert.deepEqual(
            out.map((x) => x.id),
            [1, 2, 3, 5, 8, 10],
        );
    });
});

describe('MinHeap data structure', () => {
    it('handles empty heap correctly', () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        assert.equal(heap.size, 0);
        assert.equal(heap.peek(), undefined);
        assert.equal(heap.pop(), undefined);
        assert.deepEqual(heap.extractAll(), []);
    });

    it('builds heap via bottom-up heapify in O(n) and extracts sorted order', () => {
        const numbers = [45, 12, 85, 32, 89, 39, 69, 44, 42, 1, 10];
        const heap = new MinHeap<number>((a, b) => a - b, numbers);
        assert.equal(heap.size, numbers.length);
        assert.equal(heap.peek(), 1);

        const extracted = heap.extractAll();
        assert.deepEqual(
            extracted,
            [1, 10, 12, 32, 39, 42, 44, 45, 69, 85, 89],
        );
        assert.equal(heap.size, 0);
    });

    it('supports incremental push and pop', () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        heap.push(50);
        heap.push(20);
        heap.push(30);
        heap.push(10);
        assert.equal(heap.size, 4);
        assert.equal(heap.peek(), 10);
        assert.equal(heap.pop(), 10);
        assert.equal(heap.pop(), 20);
        assert.equal(heap.size, 2);
    });
});

describe('filterGroupsByStation - durable station-ID filtering', () => {
    it('returns an equal copy for "all"', () => {
        const groups = [
            createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z', {
                stationId: 2,
            }),
            createGroup(3, '2026-10-16T10:01:00Z', '2026-10-16T10:16:00Z', {
                stationId: 5,
            }),
        ];
        const out = filterGroupsByStation(groups, 'all');
        assert.deepEqual(out, groups);
        assert.notEqual(out, groups);
    });

    it('filters strictly by numeric stationId, never by station/category/item names', () => {
        const barNamedKitchen: QueueGroup = {
            ...createGroup(1, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z', {
                stationId: 7,
            }),
            stationName: 'Bếp nóng',
            items: [
                {
                    id: 11,
                    name: 'Cà phê sữa',
                    quantity: 1,
                    status: 'pending',
                    note: null,
                },
            ],
        };
        const general: QueueGroup = {
            ...createGroup(2, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z', {
                stationId: 9,
            }),
            stationName: 'Bar Pha Chế',
            items: [],
        };

        assert.deepEqual(
            filterGroupsByStation([barNamedKitchen, general], 7).map(
                (x) => x.id,
            ),
            [1],
        );
        assert.deepEqual(
            filterGroupsByStation([barNamedKitchen, general], 9).map(
                (x) => x.id,
            ),
            [2],
        );
        assert.deepEqual(
            filterGroupsByStation([barNamedKitchen, general], 42),
            [],
        );
    });
});

describe('isGroupLongWait helper', () => {
    it('accurately evaluates long-wait threshold and future timestamps', () => {
        const now = Date.parse('2026-10-16T12:00:00Z');
        const pastLong = createGroup(
            1,
            '2026-10-16T11:39:00Z',
            '2026-10-16T12:10:00Z',
        ); // 21m wait >= 20m
        const pastNormal = createGroup(
            2,
            '2026-10-16T11:41:00Z',
            '2026-10-16T12:10:00Z',
        ); // 19m wait < 20m
        const future = createGroup(
            3,
            '2026-10-16T12:05:00Z',
            '2026-10-16T12:10:00Z',
        ); // future

        assert.equal(isGroupLongWait(pastLong, now), true);
        assert.equal(isGroupLongWait(pastNormal, now), false);
        assert.equal(isGroupLongWait(future, now), false);
    });
});
