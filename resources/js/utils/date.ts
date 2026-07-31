/**
 * Date helpers dùng chung cho toàn dự án.
 * Wire format với backend: 'Y-m-d' (vd '2027-01-08').
 * Hiển thị UI: 'dd/mm/yyyy' (vd '08/01/2027').
 * TUYỆT ĐỐI không dùng new Date('Y-m-d') vì parse theo UTC gây lệch ngày.
 */

const YMD_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const WEEKDAY_LABELS = [
    'T2',
    'T3',
    'T4',
    'T5',
    'T6',
    'T7',
    'CN',
] as const;

export function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function isRealDate(year: number, month: number, day: number): boolean {
    if (year < 1 || month < 1 || month > 12 || day < 1) {
        return false;
    }

    const d = new Date(year, month - 1, day);

    return (
        d.getFullYear() === year &&
        d.getMonth() === month - 1 &&
        d.getDate() === day
    );
}

/** Date -> 'Y-m-d' (theo local time, không dùng toISOString). */
export function toYMD(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse 'Y-m-d' -> Date local; null nếu chuỗi sai hoặc ngày không tồn tại. */
export function parseYMD(s: string | null | undefined): Date | null {
    if (!s) {
        return null;
    }

    const m = YMD_REGEX.exec(s.trim());

    if (!m) {
        return null;
    }

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    return isRealDate(year, month, day) ? new Date(year, month - 1, day) : null;
}

/** Date -> 'dd/mm/yyyy'. */
export function dateToDisplay(d: Date): string {
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 'Y-m-d' -> 'dd/mm/yyyy'; '' nếu invalid. */
export function ymdToDisplay(s: string | null | undefined): string {
    const d = parseYMD(s);

    return d ? dateToDisplay(d) : '';
}

/** Parse chặt 'dd/mm/yyyy' -> 'Y-m-d'; null nếu sai định dạng/ngày không tồn tại. */
export function displayToYMD(s: string): string | null {
    const m = DISPLAY_REGEX.exec(s.trim());

    if (!m) {
        return null;
    }

    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);

    if (!isRealDate(year, month, day)) {
        return null;
    }

    return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 42 ô (6 tuần), Thứ 2 đầu tuần, gồm ngày đệm tháng trước/sau. month 0-based. */
export function buildMonthGrid(year: number, month: number): Date[] {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const anchor = new Date(year, month, 1 - firstWeekday);

    return Array.from(
        { length: 42 },
        (_, i) =>
            new Date(
                anchor.getFullYear(),
                anchor.getMonth(),
                anchor.getDate() + i,
            ),
    );
}

/** Trả về mùng 1 của tháng cách `d` n tháng (tránh bug tràn ngày 31). */
export function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** So sánh theo ngày (bỏ giờ): -1 | 0 | 1. */
export function compareDays(a: Date, b: Date): number {
    const ka = toYMD(a);
    const kb = toYMD(b);

    return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function isSameDay(a: Date, b: Date): boolean {
    return compareDays(a, b) === 0;
}

/** d nằm trong [start, end] khép kín; tự xử lý khi start > end. */
export function isWithinRange(
    d: Date,
    start: Date | null,
    end: Date | null,
): boolean {
    if (!start || !end) {
        return false;
    }

    const [lo, hi] = compareDays(start, end) <= 0 ? [start, end] : [end, start];

    return compareDays(d, lo) >= 0 && compareDays(d, hi) <= 0;
}

/** 'Tháng 1, 2027'. */
export function formatMonthLabel(d: Date): string {
    return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}
