import { Head, router } from '@inertiajs/react';
import { RotateCcw, TriangleAlert, Wallet } from 'lucide-react';
import React, { useState } from 'react';
import DataTable from '../../../components/DataTable';
import type { DataTableColumn } from '../../../components/DataTable';
import DatePicker from '../../../components/DatePicker';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';

export interface CashFlowEntry {
    id: number;
    direction: 'in' | 'out';
    type: string;
    amount: number;
    method: string;
    actor_id: number | null;
    actor_name: string | null;
    shift_id: number | null;
    invoice_id: number | null;
    invoice_code: string | null;
    order_id: number | null;
    supplier_id: number | null;
    warning_flags: string[];
    created_at: string;
}

interface CashFlowManagerProps {
    entries: CashFlowEntry[];
    totals: {
        total_in: number;
        total_out: number;
        net: number;
        warned_count: number;
    };
    filters: {
        start_date: string;
        end_date: string;
        direction: string;
        type: string;
        method: string;
        only_warnings: boolean;
        shift: string;
        employee: string;
    };
    types: string[];
}

const TYPE_LABELS: Record<string, string> = {
    sale: 'Bán hàng',
    deposit: 'Nhận cọc',
    deposit_refund: 'Hoàn cọc',
    order_refund: 'Hoàn trả HĐ',
    supplier_payment: 'Trả NCC',
    shift_income: 'Thu ngoài',
    shift_expense: 'Chi ngoài',
    cash_change: 'Tiền thối',
};

const METHOD_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
    e_wallet: 'Ví điện tử',
    mixed: 'Hỗn hợp',
};

const WARNING_LABELS: Record<string, string> = {
    large_cash_out: 'Chi tiền mặt lớn',
    bank_to_cash_refund: 'Cọc CK hoàn tiền mặt',
};

const formatMoney = (value: number) =>
    new Intl.NumberFormat('vi-VN').format(value) + ' ₫';

export default function CashFlowManager({
    entries,
    totals,
    filters,
    types,
}: CashFlowManagerProps) {
    const [startDate, setStartDate] = useState(filters.start_date);
    const [endDate, setEndDate] = useState(filters.end_date);
    const [direction, setDirection] = useState(filters.direction);
    const [type, setType] = useState(filters.type);
    const [method, setMethod] = useState(filters.method);
    const [onlyWarnings, setOnlyWarnings] = useState(filters.only_warnings);
    const [shift, setShift] = useState(filters.shift);
    const [employee, setEmployee] = useState(filters.employee);

    const applyFilters = (
        overrides: Record<string, string | boolean | undefined> = {},
    ) => {
        router.get(
            '/manager/cash-flow',
            {
                start_date: startDate,
                end_date: endDate,
                direction: direction === 'all' ? undefined : direction,
                type: type === 'all' ? undefined : type,
                method: method === 'all' ? undefined : method,
                only_warnings: onlyWarnings || undefined,
                shift: shift === 'all' ? undefined : shift,
                employee: employee === 'all' ? undefined : employee,
                ...overrides,
            },
            { preserveState: true, replace: true },
        );
    };

    const resetFilters = () => {
        setDirection('all');
        setType('all');
        setMethod('all');
        setOnlyWarnings(false);
        setShift('all');
        setEmployee('all');
        router.get(
            '/manager/cash-flow',
            { start_date: startDate, end_date: endDate },
            { preserveState: true, replace: true },
        );
    };

    const hasActiveFilter =
        direction !== 'all' ||
        type !== 'all' ||
        method !== 'all' ||
        onlyWarnings ||
        shift !== 'all' ||
        employee !== 'all';

    const safeEntries = React.useMemo(
        () => (Array.isArray(entries) ? entries : []),
        [entries],
    );

    const shiftOptions = React.useMemo(() => {
        const ids = new Map<number, true>();

        for (const e of safeEntries) {
            if (e.shift_id != null) {
                ids.set(e.shift_id, true);
            }
        }

        return [...ids.keys()].sort((a, b) => b - a);
    }, [safeEntries]);

    const employeeOptions = React.useMemo(() => {
        const map = new Map<number, string>();

        for (const e of safeEntries) {
            if (e.actor_id != null && !map.has(e.actor_id)) {
                map.set(e.actor_id, e.actor_name ?? `#${e.actor_id}`);
            }
        }

        return [...map.entries()];
    }, [safeEntries]);

    const columns: DataTableColumn<CashFlowEntry>[] = [
        {
            key: 'created_at',
            header: 'Thời gian',
            sortable: true,
            render: (row) =>
                new Date(row.created_at).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
        },
        {
            key: 'direction',
            header: 'Chiều',
            render: (row) =>
                row.direction === 'in' ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Thu
                    </span>
                ) : (
                    <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                        Chi
                    </span>
                ),
        },
        {
            key: 'type',
            header: 'Loại',
            render: (row) => TYPE_LABELS[row.type] ?? row.type,
        },
        {
            key: 'amount',
            header: 'Số tiền',
            sortable: true,
            align: 'right',
            render: (row) => (
                <span className="font-semibold tabular-nums">
                    {row.direction === 'out' ? '−' : '+'}
                    {formatMoney(row.amount)}
                </span>
            ),
        },
        {
            key: 'method',
            header: 'Hình thức',
            render: (row) => METHOD_LABELS[row.method] ?? row.method,
        },
        {
            key: 'actor_name',
            header: 'Người ghi',
            render: (row) => row.actor_name ?? 'Hệ thống',
        },
        {
            key: 'warning_flags',
            header: 'Cảnh báo',
            render: (row) =>
                row.warning_flags.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                ) : (
                    <span className="flex flex-wrap gap-1">
                        {row.warning_flags.map((flag) => (
                            <span
                                key={flag}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                                <TriangleAlert className="h-3 w-3" />
                                {WARNING_LABELS[flag] ?? flag}
                            </span>
                        ))}
                    </span>
                ),
        },
        {
            key: 'links',
            header: 'Liên kết',
            render: (row) => {
                const day = new Date(row.created_at).toISOString().slice(0, 10);
                const linkClass =
                    'text-xs font-medium text-sky-600 hover:underline dark:text-sky-400';

                return (
                    <span className="flex flex-wrap gap-2">
                        {row.order_id != null ? (
                            <button
                                type="button"
                                className={linkClass}
                                onClick={() =>
                                    router.get(
                                        `/manager/orders/${row.order_id}`,
                                    )
                                }
                            >
                                Đơn #{row.order_id}
                            </button>
                        ) : null}
                        {row.invoice_id != null ? (
                            <button
                                type="button"
                                className={linkClass}
                                onClick={() =>
                                    router.get('/reports/sales-invoices', {
                                        start_date: day,
                                        end_date: day,
                                    })
                                }
                            >
                                HĐ {row.invoice_code ?? `#${row.invoice_id}`}
                            </button>
                        ) : null}
                        {row.supplier_id != null ? (
                            <button
                                type="button"
                                className={linkClass}
                                onClick={() => router.get('/manager/suppliers')}
                            >
                                NCC #{row.supplier_id}
                            </button>
                        ) : null}
                        {row.order_id == null &&
                        row.invoice_id == null &&
                        row.supplier_id == null ? (
                            <span className="text-zinc-400">—</span>
                        ) : null}
                    </span>
                );
            },
        },
    ];

    const selectClass =
        'rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300';

    return (
        <DashboardLayout fullWidth>
            <Head title="Dòng tiền" />
            <ManagerPageLayout
                icon={Wallet}
                title="Dòng tiền"
                subtitle="Sổ hậu kiểm append-only — chỉ xem, không sửa/xóa"
                hasActiveFilter={hasActiveFilter}
                filters={
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-60">
                            <DatePicker
                                mode="range"
                                startDate={startDate}
                                endDate={endDate}
                                onChange={(start, end) => {
                                    if (start) {
                                        setStartDate(start);
                                    }

                                    if (end) {
                                        setEndDate(end);
                                    }

                                    applyFilters({
                                        start_date: start ?? startDate,
                                        end_date: end ?? endDate,
                                    });
                                }}
                                className="w-full justify-start rounded-xl text-xs"
                            />
                        </div>
                        <select
                            aria-label="Chiều thu chi"
                            className={selectClass}
                            value={direction}
                            onChange={(e) => {
                                setDirection(e.target.value);
                                applyFilters({
                                    direction:
                                        e.target.value === 'all'
                                            ? undefined
                                            : e.target.value,
                                });
                            }}
                        >
                            <option value="all">Tất cả chiều</option>
                            <option value="in">Thu</option>
                            <option value="out">Chi</option>
                        </select>
                        <select
                            aria-label="Loại giao dịch"
                            className={selectClass}
                            value={type}
                            onChange={(e) => {
                                setType(e.target.value);
                                applyFilters({
                                    type:
                                        e.target.value === 'all'
                                            ? undefined
                                            : e.target.value,
                                });
                            }}
                        >
                            <option value="all">Tất cả loại</option>
                            {types.map((t) => (
                                <option key={t} value={t}>
                                    {TYPE_LABELS[t] ?? t}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Hình thức"
                            className={selectClass}
                            value={method}
                            onChange={(e) => {
                                setMethod(e.target.value);
                                applyFilters({
                                    method:
                                        e.target.value === 'all'
                                            ? undefined
                                            : e.target.value,
                                });
                            }}
                        >
                            <option value="all">Mọi hình thức</option>
                            <option value="cash">Tiền mặt</option>
                            <option value="bank_transfer">Chuyển khoản</option>
                            <option value="e_wallet">Ví điện tử</option>
                        </select>
                        <label className="flex items-center gap-1.5 px-2 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            <input
                                type="checkbox"
                                checked={onlyWarnings}
                                onChange={(e) => {
                                    setOnlyWarnings(e.target.checked);
                                    applyFilters({
                                        only_warnings:
                                            e.target.checked || undefined,
                                    });
                                }}
                                className="h-3.5 w-3.5 rounded accent-amber-500"
                            />
                            Chỉ dòng cảnh báo
                        </label>
                        <select
                            aria-label="Ca làm việc"
                            className={selectClass}
                            value={shift}
                            onChange={(e) => {
                                setShift(e.target.value);
                                applyFilters({
                                    shift:
                                        e.target.value === 'all'
                                            ? undefined
                                            : e.target.value,
                                });
                            }}
                        >
                            <option value="all">Mọi ca</option>
                            {shiftOptions.map((id) => (
                                <option key={id} value={String(id)}>
                                    Ca #{id}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Nhân viên"
                            className={selectClass}
                            value={employee}
                            onChange={(e) => {
                                setEmployee(e.target.value);
                                applyFilters({
                                    employee:
                                        e.target.value === 'all'
                                            ? undefined
                                            : e.target.value,
                                });
                            }}
                        >
                            <option value="all">Mọi nhân viên</option>
                            {employeeOptions.map(([id, name]) => (
                                <option key={id} value={String(id)}>
                                    {name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="flex items-center gap-1 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Đặt lại
                        </button>
                    </div>
                }
            >
                <div className="mb-3 grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Tổng thu</div>
                        <div className="text-lg font-bold text-emerald-600 tabular-nums">
                            {formatMoney(totals.total_in)}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Tổng chi</div>
                        <div className="text-lg font-bold text-rose-600 tabular-nums">
                            {formatMoney(totals.total_out)}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">Chênh lệch</div>
                        <div className="text-lg font-bold tabular-nums">
                            {formatMoney(totals.net)}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="text-xs text-zinc-500">
                            Dòng cảnh báo
                        </div>
                        <div className="text-lg font-bold text-amber-600 tabular-nums">
                            {totals.warned_count}
                        </div>
                    </div>
                </div>
                <DataTable
                    columns={columns}
                    rows={safeEntries}
                    rowKey={(row) => row.id}
                    defaultSortKey="created_at"
                    defaultSortDirection="desc"
                    emptyMessage="Không có dòng tiền"
                    emptyHint="Chưa ghi nhận giao dịch tiền nào trong khoảng lọc"
                />
            </ManagerPageLayout>
        </DashboardLayout>
    );
}
