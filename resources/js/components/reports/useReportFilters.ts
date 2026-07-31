import { router } from '@inertiajs/react';
import { useState } from 'react';

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
