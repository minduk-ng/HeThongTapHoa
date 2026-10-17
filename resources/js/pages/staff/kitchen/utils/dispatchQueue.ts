export interface QueueGroupItem {
    id: number;
    name: string;
    quantity: number;
    status: string;
    note?: string | null;
}

export interface QueueGroup {
    id: number;
    batchId: number;
    orderId: number;
    stationId: number;
    stationName: string;
    sentAt: string;
    deadlineAt: string;
    targetMinutes: number;
    longWaitMinutes: number;
    version: number;
    origin: 'send' | 'legacy_item';
    items: QueueGroupItem[];
}

export type DispatchMode = 'fifo' | 'priority';

export interface KitchenStationOption {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
}

// ponytail: durable station-ID filter; never infer station from category/item names
export function filterGroupsByStation(
    groups: readonly QueueGroup[],
    stationId: number | 'all',
): QueueGroup[] {
    if (stationId === 'all') {
        return groups.slice();
    }

    return groups.filter((g) => g.stationId === stationId);
}

export type Comparator<T> = (a: T, b: T) => number;

export function isGroupLongWait(group: QueueGroup, nowMs: number): boolean {
    const sentAtMs = Date.parse(group.sentAt);

    return (
        sentAtMs <= nowMs && nowMs - sentAtMs >= group.longWaitMinutes * 60_000
    );
}

// ponytail: bottom-up Floyd heapify O(n), extractAll O(n log n)
export class MinHeap<T> {
    private readonly data: T[];
    private readonly compare: Comparator<T>;

    constructor(compare: Comparator<T>, items?: readonly T[]) {
        this.compare = compare;
        this.data = items ? items.slice() : [];

        if (this.data.length > 1) {
            this.heapify();
        }
    }

    get size(): number {
        return this.data.length;
    }

    peek(): T | undefined {
        return this.data[0];
    }

    push(item: T): void {
        this.data.push(item);
        this.siftUp(this.data.length - 1);
    }

    pop(): T | undefined {
        if (this.data.length === 0) {
            return undefined;
        }

        if (this.data.length === 1) {
            return this.data.pop();
        }

        const top = this.data[0];
        const last = this.data.pop()!;
        this.data[0] = last;
        this.siftDown(0);

        return top;
    }

    extractAll(): T[] {
        const total = this.data.length;
        const result: T[] = new Array(total);

        for (let i = 0; i < total; i++) {
            result[i] = this.pop()!;
        }

        return result;
    }

    private heapify(): void {
        for (let i = (this.data.length >> 1) - 1; i >= 0; i--) {
            this.siftDown(i);
        }
    }

    private siftUp(index: number): void {
        let i = index;

        while (i > 0) {
            const parent = (i - 1) >> 1;

            if (this.compare(this.data[i], this.data[parent]) < 0) {
                const tmp = this.data[i];
                this.data[i] = this.data[parent];
                this.data[parent] = tmp;
                i = parent;
            } else {
                break;
            }
        }
    }

    private siftDown(index: number): void {
        const n = this.data.length;
        const half = n >> 1;
        let i = index;

        while (i < half) {
            let best = i;
            const left = (i << 1) + 1;
            const right = left + 1;

            if (
                left < n &&
                this.compare(this.data[left], this.data[best]) < 0
            ) {
                best = left;
            }

            if (
                right < n &&
                this.compare(this.data[right], this.data[best]) < 0
            ) {
                best = right;
            }

            if (best !== i) {
                const tmp = this.data[i];
                this.data[i] = this.data[best];
                this.data[best] = tmp;
                i = best;
            } else {
                break;
            }
        }
    }
}

interface ParsedQueueGroup {
    group: QueueGroup;
    sentAtMs: number;
    deadlineAtMs: number;
    isLongWait: boolean;
}

export function orderGroups(
    groups: readonly QueueGroup[],
    mode: DispatchMode,
    nowMs: number,
): QueueGroup[] {
    if (groups.length === 0) {
        return [];
    }

    if (groups.length === 1) {
        return [groups[0]];
    }

    const parsed: ParsedQueueGroup[] = new Array(groups.length);

    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const sentAtMs = Date.parse(g.sentAt);
        const deadlineAtMs = Date.parse(g.deadlineAt);
        const waitMs = nowMs - sentAtMs;
        const isLongWait =
            sentAtMs <= nowMs && waitMs >= g.longWaitMinutes * 60_000;
        parsed[i] = {
            group: g,
            sentAtMs,
            deadlineAtMs,
            isLongWait,
        };
    }

    const compare = (a: ParsedQueueGroup, b: ParsedQueueGroup): number => {
        if (mode === 'fifo') {
            if (a.sentAtMs !== b.sentAtMs) {
                return a.sentAtMs - b.sentAtMs;
            }

            return a.group.id - b.group.id;
        }

        // Priority mode: long-wait partition first
        if (a.isLongWait !== b.isLongWait) {
            return a.isLongWait ? -1 : 1;
        }

        if (a.isLongWait) {
            if (a.sentAtMs !== b.sentAtMs) {
                return a.sentAtMs - b.sentAtMs;
            }

            return a.group.id - b.group.id;
        }

        if (a.deadlineAtMs !== b.deadlineAtMs) {
            return a.deadlineAtMs - b.deadlineAtMs;
        }

        if (a.sentAtMs !== b.sentAtMs) {
            return a.sentAtMs - b.sentAtMs;
        }

        return a.group.id - b.group.id;
    };

    const heap = new MinHeap<ParsedQueueGroup>(compare, parsed);
    const ordered = heap.extractAll();
    const result: QueueGroup[] = new Array(ordered.length);

    for (let i = 0; i < ordered.length; i++) {
        result[i] = ordered[i].group;
    }

    return result;
}
