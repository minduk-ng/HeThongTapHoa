// Request lifecycle shared by the inspection page and executable race-condition tests.
export function checkDateBounds(start?: string | null, end?: string | null) {
    const parse = (value?: string | null): Date | null => {
        if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
return null;
}

        const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);

        return Number.isNaN(date.getTime()) ? null : date;
    };
    const first = parse(start);
    const last = parse(end);

    if (!first || !last) {
return null;
}

    first.setUTCDate(first.getUTCDate() + 1);
    last.setUTCDate(last.getUTCDate() - 6);
    const min = first.toISOString().slice(0, 10);
    const max = last.toISOString().slice(0, 10);

    return min <= max ? { min, max } : null;
}

export function createCheckSubmission(makeToken: () => string = () => crypto.randomUUID()) {
    let pending: { key: string; token: string } | null = null;
    let busy = false;

    return {
        begin(key: string): string | null {
            if (busy) {
return null;
}

            if (!pending || pending.key !== key) {
pending = { key, token: makeToken() };
}

            busy = true;

            return pending.token;
        },
        finish(confirmed: boolean): void {
            busy = false;

            if (confirmed) {
pending = null;
}
        },
    };
}

export function pollForecastCheck<T extends { id: number; status: string }>(
    checkId: number,
    load: (signal: AbortSignal) => Promise<T>,
    onResult: (check: T) => void,
    delay = 1200,
): () => void {
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
        try {
            const check = await load(controller.signal);

            if (stopped || check.id !== checkId) {
return;
}

            onResult(check);

            if (check.status === 'completed' || check.status === 'failed') {
return;
}
        } catch {
            if (stopped) {
return;
}
        }

        if (!stopped) {
timer = setTimeout(tick, delay);
}
    };
    timer = setTimeout(tick, delay);

    return () => {
        stopped = true;
        clearTimeout(timer);
        controller.abort();
    };
}
