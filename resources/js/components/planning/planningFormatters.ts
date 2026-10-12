// Pure planning formatters and state evaluators.
// Used across planning components and tested with Node built-in test runner.

export type RunStatusKey = 'empty' | 'queued' | 'running' | 'completed' | 'failed' | 'stale';

export type QualityTone = 'emerald' | 'amber' | 'rose' | 'zinc';

export const MODEL_NAMES: Record<string, string> = {
    naive: 'Naive (Lặp điểm cuối)',
    seasonal_naive_7: 'Seasonal Naive (Tuần trước)',
    sma_7: 'SMA (7 ngày)',
    sma_14: 'SMA (14 ngày)',
    sma_28: 'SMA (28 ngày)',
    holt_winters_additive: 'Holt-Winters (Cộng)',
    holt_winters_multiplicative: 'Holt-Winters (Nhân)',
};

export function formatRunStatusLabel(status?: string | null): string {
    if (!status || status === 'empty') {
        return 'Chưa có dự báo';
    }

    switch (status) {
        case 'queued':
            return 'Đang chờ xử lý';
        case 'running':
            return 'Đang tính toán';
        case 'completed':
            return 'Hoàn thành';
        case 'failed':
            return 'Thất bại';
        case 'stale':
            return 'Dữ liệu cũ';
        default:
            return status;
    }
}

export function formatSourceLabel(
    dataset?: { id?: number; name?: string } | string | null
): string {
    if (!dataset) {
        return 'Dữ liệu thật';
    }

    if (typeof dataset === 'string') {
        const trimmed = dataset.trim();

        return trimmed.length > 0 ? trimmed : 'Dữ liệu thật';
    }

    if (dataset.name && dataset.name.trim().length > 0) {
        return dataset.name.trim();
    }

    if (dataset.id !== undefined && dataset.id !== null) {
        return `Tập dữ liệu #${dataset.id}`;
    }

    return 'Dữ liệu thật';
}

export function formatWape(wape: number | null | undefined): string {
    if (wape === null || wape === undefined || Number.isNaN(wape)) {
        return '-';
    }

    return `${Number(wape).toFixed(1)}%`;
}

export function formatForecastMetric(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'Chưa đánh giá';
    }

    return Number(value).toFixed(2);
}

export function isRunStale(
    timestamp: string | Date | null | undefined,
    maxAgeHours = 24,
    referenceTime: Date = new Date()
): boolean {
    if (!timestamp) {
        return false;
    }

    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const diffMs = referenceTime.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours > maxAgeHours;
}

export function formatStaleTimestamp(
    timestamp: string | Date | null | undefined,
    maxAgeHours = 24,
    referenceTime: Date = new Date()
): { isStale: boolean; label: string; hoursAgo: number | null } {
    if (!timestamp) {
        return { isStale: false, label: '', hoursAgo: null };
    }

    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

    if (Number.isNaN(date.getTime())) {
        return { isStale: false, label: '', hoursAgo: null };
    }

    const diffMs = referenceTime.getTime() - date.getTime();
    const hoursAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const isStale = hoursAgo > maxAgeHours;

    const label = isStale
        ? `Cần tính lại (dữ liệu cách đây ${hoursAgo} giờ)`
        : `Dữ liệu mới (${hoursAgo} giờ trước)`;

    return { isStale, label, hoursAgo };
}

export function formatDataQuality(quality: string | null | undefined): {
    label: string;
    tone: QualityTone;
} {
    switch (quality) {
        case 'sufficient':
            return { label: 'Đầy đủ', tone: 'emerald' };
        case 'limited':
            return { label: 'Hạn chế', tone: 'amber' };
        case 'insufficient':
            return { label: 'Thiếu dữ liệu', tone: 'rose' };
        case 'stale':
            return { label: 'Dữ liệu cũ', tone: 'zinc' };
        case 'invalid':
            return { label: 'Không hợp lệ', tone: 'rose' };
        default:
            return { label: 'Chưa rõ', tone: 'zinc' };
    }
}

export function formatQuantity(value: number | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '0';
    }

    return new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

export function formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) {
        return '0 ₫';
    }

    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(amount);
}

export function formatDateTime(iso: string | Date | null | undefined): string {
    if (!iso) {
        return '-';
    }

    const date = typeof iso === 'string' ? new Date(iso) : iso;

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function formatDate(iso: string | Date | null | undefined): string {
    if (!iso) {
        return '-';
    }

    const date = typeof iso === 'string' ? new Date(iso) : iso;

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}
