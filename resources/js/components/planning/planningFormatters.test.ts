// Test suite for pure planning formatters and state evaluators.
// Run: node --test resources/js/components/planning/planningFormatters.test.ts
import { equal } from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    formatCurrency,
    formatDataQuality,
    formatForecastMetric,
    formatQuantity,
    formatRunStatusLabel,
    formatSourceLabel,
    formatStaleTimestamp,
    formatWape,
    isRunStale,
    MODEL_NAMES,
} from './planningFormatters.ts';

describe('formatRunStatusLabel', () => {
    it('returns expected Vietnamese label for all known lifecycle states', () => {
        equal(formatRunStatusLabel('completed'), 'Hoàn thành');
        equal(formatRunStatusLabel('running'), 'Đang tính toán');
        equal(formatRunStatusLabel('queued'), 'Đang chờ xử lý');
        equal(formatRunStatusLabel('failed'), 'Thất bại');
        equal(formatRunStatusLabel('stale'), 'Dữ liệu cũ');
        equal(formatRunStatusLabel('empty'), 'Chưa có dự báo');
    });

    it('handles null, undefined, or empty values with empty fallback', () => {
        equal(formatRunStatusLabel(null), 'Chưa có dự báo');
        equal(formatRunStatusLabel(undefined), 'Chưa có dự báo');
        equal(formatRunStatusLabel(''), 'Chưa có dự báo');
    });

    it('falls back to raw string for unexpected status', () => {
        equal(formatRunStatusLabel('custom_status'), 'custom_status');
    });
});

describe('formatSourceLabel', () => {
    it('returns "Dữ liệu thật" when dataset is null, undefined, or empty', () => {
        equal(formatSourceLabel(null), 'Dữ liệu thật');
        equal(formatSourceLabel(undefined), 'Dữ liệu thật');
        equal(formatSourceLabel(''), 'Dữ liệu thật');
    });

    it('returns dataset name when passed as string or object with name', () => {
        equal(formatSourceLabel('Kịch bản Tết 2026'), 'Kịch bản Tết 2026');
        equal(
            formatSourceLabel({ name: 'Bộ dữ liệu Black Friday' }),
            'Bộ dữ liệu Black Friday',
        );
    });

    it('returns generated name when object only contains id', () => {
        equal(formatSourceLabel({ id: 12 }), 'Tập dữ liệu #12');
    });
});

describe('formatForecastMetric', () => {
    it('returns "Chưa đánh giá" when value is null, undefined, or NaN', () => {
        equal(formatForecastMetric(null), 'Chưa đánh giá');
        equal(formatForecastMetric(undefined), 'Chưa đánh giá');
        equal(formatForecastMetric(Number.NaN), 'Chưa đánh giá');
    });

    it('formats numeric metric with two decimals', () => {
        equal(formatForecastMetric(0), '0.00');
        equal(formatForecastMetric(3.1415), '3.14');
        equal(formatForecastMetric(15.5), '15.50');
    });
});

describe('formatWape', () => {
    it('returns "-" when wape is null, undefined, or NaN', () => {
        equal(formatWape(null), '-');
        equal(formatWape(undefined), '-');
        equal(formatWape(Number.NaN), '-');
    });

    it('formats numeric wape value into percentage string', () => {
        equal(formatWape(12.5), '12.5%');
        equal(formatWape(0), '0.0%');
        equal(formatWape(5.43), '5.4%');
        equal(formatWape(100.0), '100.0%');
        equal(formatWape(15.4), '15.4%');
    });
});

describe('isRunStale and formatStaleTimestamp', () => {
    const fixedNow = new Date('2026-10-10T12:00:00Z');

    it('returns false for timestamps within threshold', () => {
        const recent = new Date('2026-10-10T08:00:00Z'); // 4 hours ago
        equal(isRunStale(recent, 24, fixedNow), false);
        equal(isRunStale(recent.toISOString(), 24, fixedNow), false);
    });

    it('returns true for timestamps exceeding threshold', () => {
        const old = new Date('2026-10-08T12:00:00Z'); // 48 hours ago
        equal(isRunStale(old, 24, fixedNow), true);
        equal(isRunStale(old.toISOString(), 24, fixedNow), true);
    });

    it('returns false if timestamp is missing or invalid', () => {
        equal(isRunStale(null, 24, fixedNow), false);
        equal(isRunStale(undefined, 24, fixedNow), false);
        equal(isRunStale('invalid-date', 24, fixedNow), false);
    });

    it('formats human readable stale warning', () => {
        const old = new Date('2026-10-08T12:00:00Z');
        const formatted = formatStaleTimestamp(old, 24, fixedNow);
        equal(formatted.isStale, true);
        equal(formatted.label.includes('48'), true);

        const recent = new Date('2026-10-10T08:00:00Z');
        const formattedRecent = formatStaleTimestamp(recent, 24, fixedNow);
        equal(formattedRecent.isStale, false);
    });
});

describe('formatDataQuality', () => {
    it('maps known quality identifiers to label and tone', () => {
        equal(formatDataQuality('sufficient').label, 'Đầy đủ');
        equal(formatDataQuality('sufficient').tone, 'emerald');

        equal(formatDataQuality('limited').label, 'Hạn chế');
        equal(formatDataQuality('limited').tone, 'amber');

        equal(formatDataQuality('insufficient').label, 'Thiếu dữ liệu');
        equal(formatDataQuality('insufficient').tone, 'rose');

        equal(formatDataQuality('stale').label, 'Dữ liệu cũ');
        equal(formatDataQuality('stale').tone, 'zinc');

        equal(formatDataQuality('invalid').label, 'Không hợp lệ');
        equal(formatDataQuality('invalid').tone, 'rose');
    });

    it('handles null, undefined, or unknown quality codes gracefully', () => {
        const fallback = formatDataQuality(null);
        equal(fallback.label, 'Chưa rõ');
        equal(fallback.tone, 'zinc');
    });
});

describe('formatQuantity and formatCurrency', () => {
    it('formats quantities with default and specified decimals', () => {
        equal(formatQuantity(1200), '1.200');
        equal(formatQuantity(12.5, 1), '12,5');
        equal(formatQuantity(null), '0');
    });

    it('formats currency with VND format', () => {
        const formatted = formatCurrency(50000);
        equal(formatted.includes('50.000'), true);
        equal(
            formatted.includes('₫') ||
                formatted.includes('đ') ||
                formatted.includes('VND'),
            true,
        );
    });
});

describe('MODEL_NAMES', () => {
    it('contains readable Vietnamese labels for candidate models', () => {
        equal(MODEL_NAMES.sma_7, 'SMA (7 ngày)');
        equal(MODEL_NAMES.sma_14, 'SMA (14 ngày)');
        equal(MODEL_NAMES.sma_28, 'SMA (28 ngày)');
        equal(MODEL_NAMES.holt_winters_additive, 'Holt-Winters (Cộng)');
        equal(MODEL_NAMES.holt_winters_multiplicative, 'Holt-Winters (Nhân)');
    });
});
