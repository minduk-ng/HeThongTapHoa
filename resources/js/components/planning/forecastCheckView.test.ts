import { equal } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    formatCheckMetric,
    formatSignedError,
    initialModelKey,
    shiftCheckDate,
} from './forecastCheckView.ts';

describe('shiftCheckDate', () => {
    it('shifts forward and backward accurately across month boundaries', () => {
        equal(shiftCheckDate('2026-01-29', 7), '2026-02-05');
        equal(shiftCheckDate('2026-02-05', -7), '2026-01-29');
    });

    it('handles leap year date math correctly', () => {
        // 2028 is a leap year
        equal(shiftCheckDate('2028-02-28', 1), '2028-02-29');
        equal(shiftCheckDate('2028-02-29', 1), '2028-03-01');
    });

    it('returns raw string when format is invalid', () => {
        equal(shiftCheckDate('invalid-date', 7), 'invalid-date');
    });
});

describe('formatCheckMetric', () => {
    it('returns "Chưa tính được" for null, undefined, or NaN', () => {
        equal(formatCheckMetric(null), 'Chưa tính được');
        equal(formatCheckMetric(undefined), 'Chưa tính được');
        equal(formatCheckMetric(Number.NaN), 'Chưa tính được');
    });

    it('formats numeric values with two decimal digits', () => {
        equal(formatCheckMetric(0), '0.00');
        equal(formatCheckMetric(3.1415), '3.14');
        equal(formatCheckMetric(25.5), '25.50');
    });
});

describe('formatSignedError', () => {
    it('formats positive error as over-prediction', () => {
        equal(formatSignedError(4.2), '+4.20 — dự báo thừa');
    });

    it('formats negative error as under-prediction', () => {
        equal(formatSignedError(-2.5), '-2.50 — dự báo thiếu');
    });

    it('formats zero error as exact match', () => {
        equal(formatSignedError(0), '0.00 — khớp hoàn toàn');
    });

    it('returns "Thiếu dữ liệu" for null', () => {
        equal(formatSignedError(null), 'Thiếu dữ liệu');
    });
});

describe('initialModelKey', () => {
    it('prefers seasonal_naive_7 then naive then first candidate', () => {
        const candidates = [
            { model_key: 'sma_7', status: 'evaluated' } as any,
            { model_key: 'seasonal_naive_7', status: 'evaluated' } as any,
            { model_key: 'naive', status: 'evaluated' } as any,
        ];
        equal(initialModelKey(candidates), 'seasonal_naive_7');

        const withoutSeasonal = [
            { model_key: 'sma_7', status: 'evaluated' } as any,
            { model_key: 'naive', status: 'evaluated' } as any,
        ];
        equal(initialModelKey(withoutSeasonal), 'naive');

        const onlySma = [{ model_key: 'sma_7', status: 'evaluated' } as any];
        equal(initialModelKey(onlySma), 'sma_7');
    });
});
