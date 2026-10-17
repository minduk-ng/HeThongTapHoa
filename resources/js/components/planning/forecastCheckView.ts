import type { ForecastCheckCandidate } from '../../types/forecast-check';

/**
 * Pure date shifting using UTC calendar arithmetic on YYYY-MM-DD strings.
 */
export function shiftCheckDate(isoDate: string, days: number): string {
    const parts = isoDate.split('-').map((n) => parseInt(n, 10));

    if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
        return isoDate;
    }

    const year = parts[0];
    const month = parts[1] - 1;
    const day = parts[2];

    const d = new Date(Date.UTC(year, month, day));
    d.setUTCDate(d.getUTCDate() + days);

    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dt = String(d.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${dt}`;
}

export function formatCheckMetric(val: number | null | undefined): string {
    if (val === null || val === undefined || Number.isNaN(val)) {
        return 'Chưa tính được';
    }

    return Number(val).toFixed(2);
}

export function formatSignedError(val: number | null | undefined): string {
    if (val === null || val === undefined || Number.isNaN(val)) {
        return 'Thiếu dữ liệu';
    }

    const n = Number(val);

    if (Math.abs(n) < 0.0001) {
        return '0.00 — khớp hoàn toàn';
    }

    if (n > 0) {
        return `+${n.toFixed(2)} — dự báo thừa`;
    }

    return `${n.toFixed(2)} — dự báo thiếu`;
}

export function initialModelKey(
    candidates: ForecastCheckCandidate[],
): string | null {
    if (!candidates || candidates.length === 0) {
        return null;
    }

    const evaluated = candidates.filter((c) => c.status === 'evaluated');

    if (evaluated.length === 0) {
        return candidates[0].model_key;
    }

    const seasonal = evaluated.find((c) => c.model_key === 'seasonal_naive_7');

    if (seasonal) {
        return seasonal.model_key;
    }

    const naive = evaluated.find((c) => c.model_key === 'naive');

    if (naive) {
        return naive.model_key;
    }

    return evaluated[0].model_key;
}
