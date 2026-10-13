import { deepEqual, equal } from 'node:assert/strict';
import { it } from 'node:test';
import { checkDateBounds, createCheckSubmission, pollForecastCheck } from './forecastCheckRequests.ts';

it('bounds require history and a full seven-day target', () => {
    deepEqual(checkDateBounds('2026-01-01', '2026-01-30'), { min: '2026-01-02', max: '2026-01-24' });
    equal(checkDateBounds('2026-01-01', '2026-01-07'), null);
    equal(checkDateBounds(null, null), null);
    deepEqual(checkDateBounds('2028-02-28', '2028-03-07'), { min: '2028-02-29', max: '2028-03-01' });
});

it('retains token on network failure, blocks double submit and renews after confirmation', () => {
    let next = 0;
    const submission = createCheckSubmission(() => `token-${++next}`);
    equal(submission.begin('dataset1:item1:date1'), 'token-1');
    equal(submission.begin('dataset1:item1:date1'), null);
    submission.finish(false);
    equal(submission.begin('dataset1:item1:date1'), 'token-1');
    submission.finish(true);
    equal(submission.begin('dataset1:item1:date1'), 'token-2');
    submission.finish(false);
    equal(submission.begin('dataset1:item1:date2'), 'token-3');
});

it('ignores a late response after disposal even when transport ignores abort', async () => {
    let resolve!: (value: { id: number; status: string }) => void;
    let entered!: () => void;
    const started = new Promise<void>((done) => {
 entered = done; 
});
    let signal!: AbortSignal;
    const received: unknown[] = [];
    const stop = pollForecastCheck(1, (requestSignal) => {
        signal = requestSignal;
        entered();

        return new Promise<{ id: number; status: string }>((done) => {
 resolve = done; 
});
    }, (value) => received.push(value), 0);
    await started;
    stop();
    resolve({ id: 1, status: 'completed' });
    await new Promise((done) => setImmediate(done));
    equal(signal.aborted, true);
    deepEqual(received, []);
});
