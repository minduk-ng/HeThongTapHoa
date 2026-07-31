import { router } from '@inertiajs/react';
import { useState } from 'react';

import { toYMD } from '../../utils/date';

export interface ReportPreset {
    key: string;
    label: string;
    range: () => [string, string];
}

// Preset dùng new Date() local (không phải 'Y-m-d' string) nên không lệch múi giờ.
export const REPORT_PRESETS: ReportPreset[] = [
    {
        key: 'today',
        label: 'Hôm nay',
        range: () => {
            const t = new Date();

            return [toYMD(t), toYMD(t)];
        },
    },
    {
        key: 'yesterday',
        label: 'Hôm qua',
        range: () => {
            const d = new Date();

            d.setDate(d.getDate() - 1);

            return [toYMD(d), toYMD(d)];
        },
    },
    {
        key: 'last7',
        label: '7 ngày gần nhất',
        range: () => {
            const e = new Date();
            const s = new Date();

            s.setDate(s.getDate() - 6);

            return [toYMD(s), toYMD(e)];
        },
    },
    {
        key: 'thisMonth',
        label: 'Tháng này',
        range: () => {
            const n = new Date();

            return [
                toYMD(new Date(n.getFullYear(), n.getMonth(), 1)),
                toYMD(n),
            ];
        },
    },
    {
        key: 'lastMonth',
        label: 'Tháng trước',
        range: () => {
            const n = new Date();

            return [
                toYMD(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
                toYMD(new Date(n.getFullYear(), n.getMonth(), 0)),
            ];
        },
    },
];

export function useReportFilters(
    url: string,
    startDate: string,
    endDate: string,
) {
    const [rangeStart, setRangeStart] = useState(startDate);
    const [rangeEnd, setRangeEnd] = useState(endDate);

    const applyRange = (start: string, end: string) => {
        setRangeStart(start);
        setRangeEnd(end);
        router.get(
            url,
            { start_date: start, end_date: end },
            { preserveState: false },
        );
    };

    const reset = () => {
        router.get(url, {}, { preserveState: false });
    };

    return { rangeStart, rangeEnd, applyRange, reset };
}
