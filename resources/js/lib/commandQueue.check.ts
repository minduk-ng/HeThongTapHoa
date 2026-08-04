import assert from 'node:assert/strict';
import { enqueue, flush, readQueue } from './commandQueue.ts';

const mem = new Map<string, string>();
const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
} as Storage;

enqueue(storage, { type: 'serving.mark-served', url: '/staff/serving/mark-served', payload: { item_ids: [1] } });
enqueue(storage, { type: 'kitchen.complete-items', url: '/staff/kitchen/complete-items', payload: { order_id: 5, item_ids: [9] } });
assert.equal(readQueue(storage).length, 2);

let sent: string[] = [];
await flush(storage, async () => {
    throw new Error('network');
}, () => {});
assert.equal(sent.length, 0);
sent = [];
await flush(storage, async (c) => {
    sent.push(c.type);

    throw new Error('network');
}, () => {});
assert.deepEqual(sent, ['serving.mark-served']);
assert.equal(readQueue(storage).length, 2);
assert.equal(readQueue(storage)[0].retryCount, 2); // hai lần flush lỗi mạng, mỗi lần +1

await flush(storage, async () => ({ ok: true, status: 200, body: { success: true } }), () => {});
assert.equal(readQueue(storage).length, 0);

enqueue(storage, { type: 'serving.mark-served', url: '/staff/serving/mark-served', payload: { item_ids: [2] } });
await flush(storage, async () => ({ ok: false, status: 422, body: { error: 'Món đã hủy' } }), () => {});
const q = readQueue(storage);
assert.equal(q[0].status, 'failed');
assert.match(q[0].error!, /Món đã hủy/);

console.log('commandQueue self-check: OK');
