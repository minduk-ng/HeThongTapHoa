import { Head } from '@inertiajs/react';
import {
    Minus,
    Plus,
    CalendarClock,
    LogIn,
    LogOut,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../layouts/DashboardLayout';

type Shift = {
    id: number;
    opened_at: string;
    opening_cash: number;
    note: string | null;
    status: 'open' | 'closed';
};
type CashMovement = {
    id: number;
    type: 'expense' | 'income';
    category: string;
    amount: number;
    note: string | null;
    created_at: string;
};
const money = (value: number) => `${Number(value).toLocaleString('vi-VN')} đ`;
const movementCategories: Record<'expense' | 'income', string[]> = {
    expense: ['mua_nguyen_lieu', 'mua_vat_dung', 'dien_nuoc', 'khac'],
    income: ['thu_ngoai', 'thu_cong_no', 'khac'],
};
const MOVEMENT_LABELS: Record<string, string> = {
    mua_nguyen_lieu: 'Mua nguyên liệu',
    mua_vat_dung: 'Mua vật dụng',
    dien_nuoc: 'Điện nước / Chi phí quán',
    thu_ngoai: 'Thu ngoài',
    thu_cong_no: 'Thu công nợ',
    khac: 'Khác',
};
const csrf = () =>
    decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] || '',
    );

export default function ShiftsPage() {
    const [shift, setShift] = useState<Shift | null>(null);
    const [expectedCash, setExpectedCash] = useState(0);
    const [movements, setMovements] = useState<CashMovement[]>([]);
    const [openingCash, setOpeningCash] = useState('');
    const [actualCash, setActualCash] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [closeOpen, setCloseOpen] = useState(false);
    const [lastDifference, setLastDifference] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [movementOpen, setMovementOpen] = useState(false);
    const [movementType, setMovementType] = useState<'expense' | 'income'>(
        'expense',
    );
    const [movementCategory, setMovementCategory] = useState('');
    const [movementAmount, setMovementAmount] = useState('');
    const [movementNote, setMovementNote] = useState('');
    const difference = useMemo(
        () => (actualCash === '' ? 0 : Number(actualCash) - expectedCash),
        [actualCash, expectedCash],
    );
    const request = async (url: string, options?: RequestInit) => {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': csrf(),
                'X-Requested-With': 'XMLHttpRequest',
                ...(options?.headers || {}),
            },
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || data.message || 'Không thể xử lý yêu cầu.',
            );
        }

        return data;
    };
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await request('/staff/shifts/current');
            setShift(data.shift);
            setExpectedCash(Number(data.expected_cash) || 0);
            setMovements(data.movements || []);
        } catch (value) {
            setError(
                value instanceof Error
                    ? value.message
                    : 'Không thể tải dữ liệu ca.',
            );
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        queueMicrotask(() => void load());
    }, [load]);
    const openShift = async () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await request('/staff/shifts/open', {
                method: 'POST',
                body: JSON.stringify({
                    opening_cash: Number(openingCash),
                    note: note || null,
                }),
            });
            setOpeningCash('');
            setNote('');
            setLastDifference(null);
            await load();
        } catch (value) {
            setError(
                value instanceof Error ? value.message : 'Mở ca thất bại.',
            );
        } finally {
            setSubmitting(false);
        }
    };
    const closeShift = async () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const data = await request('/staff/shifts/close', {
                method: 'POST',
                body: JSON.stringify({
                    actual_cash: Number(actualCash),
                    note: note || null,
                }),
            });
            setLastDifference(Number(data.difference));
            setCloseOpen(false);
            setActualCash('');
            setNote('');
            await load();
        } catch (value) {
            setError(
                value instanceof Error ? value.message : 'Đóng ca thất bại.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const openMovement = (type: 'expense' | 'income') => {
        setMovementType(type);
        setMovementCategory('');
        setMovementAmount('');
        setMovementNote('');
        setMovementOpen(true);
    };
    const saveMovement = async () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await request('/staff/shifts/movements', {
                method: 'POST',
                body: JSON.stringify({
                    type: movementType,
                    category: movementCategory,
                    amount: Number(movementAmount),
                    note: movementNote || null,
                }),
            });
            setMovementOpen(false);
            await load();
        } catch (value) {
            setError(
                value instanceof Error
                    ? value.message
                    : 'Ghi chi/thu ngoài thất bại.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <DashboardLayout fullWidth>
            <Head title="Ca làm việc" />
            <div className="h-full overflow-y-auto bg-zinc-50 p-6 dark:bg-zinc-950">
                <div className="mx-auto max-w-5xl space-y-6">
                    <header>
                        <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                            <CalendarClock className="h-5 w-5 stroke-[1.5]" />
                            <span className="text-xs font-semibold tracking-wider uppercase">
                                Vận hành tiền mặt
                            </span>
                        </div>
                        <h1 className="mt-1 font-display text-3xl text-zinc-900 dark:text-zinc-100">
                            Ca làm việc
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            Mở ca, theo dõi tiền mặt kỳ vọng và đối soát khi
                            đóng ca.
                        </p>
                    </header>
                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-400">
                            {error}
                        </div>
                    )}
                    {lastDifference !== null && (
                        <div
                            className={`rounded-xl border p-3 text-sm font-semibold ${lastDifference >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50'}`}
                        >
                            Ca trước đã đóng — chênh lệch:{' '}
                            <span className="tabular-nums">
                                {money(lastDifference)}
                            </span>
                        </div>
                    )}
                    {loading ? (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                            Đang tải trạng thái ca…
                        </div>
                    ) : !shift ? (
                        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="rounded-xl bg-sky-100 p-3 text-sky-600 dark:bg-sky-950">
                                    <LogIn className="h-6 w-6 stroke-[1.5]" />
                                </div>
                                <div>
                                    <h2 className="font-display text-xl">
                                        Mở ca mới
                                    </h2>
                                    <p className="text-sm text-zinc-500">
                                        Nhập số tiền mặt đầu ca.
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="text-sm font-semibold">
                                    Tiền đầu ca
                                    <input
                                        type="number"
                                        min="0"
                                        value={openingCash}
                                        onChange={(e) =>
                                            setOpeningCash(e.target.value)
                                        }
                                        className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-lg font-bold tabular-nums outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800"
                                    />
                                </label>
                                <label className="text-sm font-semibold">
                                    Ghi chú
                                    <input
                                        value={note}
                                        onChange={(e) =>
                                            setNote(e.target.value)
                                        }
                                        className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800"
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                onClick={openShift}
                                disabled={
                                    submitting ||
                                    openingCash === '' ||
                                    Number(openingCash) < 0
                                }
                                className="mt-6 flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                <LogIn className="h-4 w-4 stroke-[1.5]" />
                                {submitting ? 'Đang mở ca…' : 'Mở ca'}
                            </button>
                        </section>
                    ) : (
                        <section className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="text-xs font-medium text-zinc-500">
                                    Thời điểm mở ca
                                </div>
                                <div className="mt-1 font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                                    {new Date(shift.opened_at).toLocaleString(
                                        'vi-VN',
                                    )}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="text-xs font-medium text-zinc-500">
                                    Tiền đầu ca
                                </div>
                                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                                    {money(shift.opening_cash)}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="text-xs font-medium text-zinc-500">
                                    Tiền mặt kỳ vọng
                                </div>
                                <div className="mt-1 font-display text-2xl font-bold text-sky-600 tabular-nums dark:text-sky-400">
                                    {money(expectedCash)}
                                </div>
                            </div>
                            <div className="grid gap-3 md:col-span-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => openMovement('expense')}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 transition-colors"
                                >
                                    <Minus className="h-4 w-4 stroke-[1.5]" />
                                    <span>Ghi chi trong ca</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openMovement('income')}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                                >
                                    <Plus className="h-4 w-4 stroke-[1.5]" />
                                    <span>Ghi thu trong ca</span>
                                </button>
                            </div>
                            {movements.length > 0 && (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-3 dark:border-zinc-800 dark:bg-zinc-900">
                                    <h3 className="text-sm font-semibold text-zinc-500">
                                        Chi tiết ghi nợ ngoài ca
                                    </h3>
                                    <ul className="mt-3 space-y-2">
                                        {movements.map((movement) => (
                                            <li
                                                key={movement.id}
                                                className="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                                                            movement.type ===
                                                            'expense'
                                                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                        }`}
                                                    >
                                                        {movement.type ===
                                                        'expense'
                                                            ? 'chi'
                                                            : 'thu'}
                                                    </span>
                                                    <span className="font-medium">
                                                        {MOVEMENT_LABELS[movement.category] || movement.category}
                                                    </span>
                                                    {movement.note && (
                                                        <span className="text-xs text-zinc-500">
                                                            ({movement.note})
                                                        </span>
                                                    )}
                                                </span>
                                                <span
                                                    className={`font-semibold tabular-nums ${
                                                        movement.type ===
                                                        'expense'
                                                            ? 'text-rose-600 dark:text-rose-400'
                                                            : 'text-emerald-600 dark:text-emerald-400'
                                                    }`}
                                                >
                                                    {movement.type === 'expense'
                                                        ? '−'
                                                        : '+'}
                                                    {money(movement.amount)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setCloseOpen(true)}
                                className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white md:col-span-3 dark:bg-zinc-100 dark:text-zinc-900"
                            >
                                <LogOut className="h-4 w-4 stroke-[1.5]" />
                                Đóng ca và đối soát
                            </button>
                        </section>
                    )}
                </div>
                {closeOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-900">
                            <div className="flex items-center justify-between">
                                <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                    Đóng ca
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setCloseOpen(false)}
                                    aria-label="Đóng"
                                    className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                >
                                    <X className="h-5 w-5 stroke-[1.5]" />
                                </button>
                            </div>
                            <div className="mt-5 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
                                <div className="flex justify-between">
                                    <span>Kỳ vọng</span>
                                    <strong className="tabular-nums">
                                        {money(expectedCash)}
                                    </strong>
                                </div>
                                <div
                                    className={`mt-2 flex justify-between ${difference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                                >
                                    <span>Chênh lệch</span>
                                    <strong className="tabular-nums">
                                        {money(difference)}
                                    </strong>
                                </div>
                            </div>
                            <label className="mt-4 block text-sm font-semibold">
                                Tiền mặt thực tế
                                <input
                                    autoFocus
                                    type="number"
                                    min="0"
                                    value={actualCash}
                                    onChange={(e) =>
                                        setActualCash(e.target.value)
                                    }
                                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-lg font-bold tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                                />
                            </label>
                            <label className="mt-4 block text-sm font-semibold">
                                Ghi chú
                                <input
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={closeShift}
                                disabled={
                                    submitting ||
                                    actualCash === '' ||
                                    Number(actualCash) < 0
                                }
                                className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {submitting
                                    ? 'Đang đóng ca…'
                                    : 'Xác nhận đóng ca'}
                            </button>
                        </div>
                    </div>
                )}
                {movementOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg dark:bg-zinc-900">
                            <div className="flex items-center justify-between">
                                <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                    {movementType === 'expense'
                                        ? 'Ghi chi trong ca'
                                        : 'Ghi thu trong ca'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setMovementOpen(false)}
                                    aria-label="Đóng"
                                    className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                >
                                    <X className="h-5 w-5 stroke-[1.5]" />
                                </button>
                            </div>
                            <label className="mt-5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Loại {movementType === 'expense' ? 'chi tiêu' : 'thu ngoài'}
                                <select
                                    value={movementCategory}
                                    onChange={(e) =>
                                        setMovementCategory(e.target.value)
                                    }
                                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-xs outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                >
                                    <option value="" disabled>
                                        Chọn loại…
                                    </option>
                                    {movementCategories[movementType].map(
                                        (category) => (
                                            <option
                                                key={category}
                                                value={category}
                                            >
                                                {MOVEMENT_LABELS[category] || category}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                            <label className="mt-4 block text-sm font-semibold">
                                Số tiền
                                <input
                                    autoFocus
                                    type="number"
                                    min="0"
                                    value={movementAmount}
                                    onChange={(e) =>
                                        setMovementAmount(e.target.value)
                                    }
                                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-lg font-bold tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                                />
                            </label>
                            <label className="mt-4 block text-sm font-semibold">
                                Ghi chú
                                <input
                                    value={movementNote}
                                    onChange={(e) =>
                                        setMovementNote(e.target.value)
                                    }
                                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={saveMovement}
                                disabled={
                                    submitting ||
                                    movementCategory === '' ||
                                    movementAmount === '' ||
                                    Number(movementAmount) <= 0
                                }
                                className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {submitting ? 'Đang ghi…' : 'Lưu'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
