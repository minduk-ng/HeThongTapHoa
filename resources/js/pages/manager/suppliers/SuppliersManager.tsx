import { Head, router } from '@inertiajs/react';
import {
    Plus,
    Search,
    RotateCcw,
    Edit3,
    Trash2,
    HandCoins,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import DataTable from '../../../components/DataTable';
import type { DataTableColumn } from '../../../components/DataTable';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import SupplierFormDrawer from './components/SupplierFormDrawer';
import SupplierPaymentsModal from './components/SupplierPaymentsModal';

export interface SupplierData {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    note: string | null;
    is_active: boolean;
    debt: number;
    unpaid_vouchers: {
        id: number;
        voucher_code: string;
        total: number;
        transacted_at: string;
    }[];
}

interface SuppliersManagerProps {
    suppliers: SupplierData[];
    filters: {
        search?: string;
    };
}

const formatMoney = (value: number) =>
    new Intl.NumberFormat('vi-VN').format(value) + ' ₫';

export default function SuppliersManager({
    suppliers,
    filters,
}: SuppliersManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [supplierToEdit, setSupplierToEdit] = useState<SupplierData | null>(
        null,
    );

    const [payingSupplier, setPayingSupplier] = useState<SupplierData | null>(
        null,
    );

    const [deletingSupplier, setDeletingSupplier] =
        useState<SupplierData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const safeSuppliers = useMemo(
        () => (Array.isArray(suppliers) ? suppliers : Object.values(suppliers || {})) as SupplierData[],
        [suppliers],
    );

    const filteredSuppliers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return safeSuppliers;
        }

        return safeSuppliers.filter(
            (s) =>
                s.name.toLowerCase().includes(query) ||
                (s.phone || '').toLowerCase().includes(query),
        );
    }, [safeSuppliers, searchQuery]);

    const handleOpenAddDrawer = () => {
        setSupplierToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditSupplier = (supplier: SupplierData) => {
        setSupplierToEdit(supplier);
        setIsDrawerOpen(true);
    };

    const handleDeleteSupplier = (supplier: SupplierData) => {
        setDeletingSupplier(supplier);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (!deletingSupplier) {
            return;
        }

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');

            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/manager/suppliers/${deletingSupplier.id}`, {
            data: { password: passwordValue },
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingSupplier(null);
                setPasswordValue('');
            },
            onError: (errs: any) => {
                setIsDeleting(false);

                if (errs.password) {
                    setDeleteError(errs.password);
                } else {
                    setDeleteError(
                        'Không thể xóa nhà cung cấp. Vui lòng kiểm tra lại.',
                    );
                }
            },
        });
    };

    const columns: DataTableColumn<SupplierData>[] = [
        {
            key: 'name',
            header: 'Tên nhà cung cấp',
            sortable: true,
            align: 'left',
            render: (s) => (
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {s.name}
                </span>
            ),
        },
        {
            key: 'phone',
            header: 'Số điện thoại',
            align: 'left',
            render: (s) => (
                <span className="tabular-nums">{s.phone || '—'}</span>
            ),
        },
        {
            key: 'address',
            header: 'Địa chỉ',
            align: 'left',
            render: (s) => (
                <span className="text-zinc-500 dark:text-zinc-400">
                    {s.address || '—'}
                </span>
            ),
        },
        {
            key: 'debt',
            header: 'Công nợ',
            sortable: true,
            align: 'right',
            render: (s) => (
                <span
                    className={
                        s.debt > 0
                            ? 'font-semibold text-rose-600 tabular-nums dark:text-rose-400'
                            : 'text-emerald-600 tabular-nums dark:text-emerald-400'
                    }
                >
                    {formatMoney(s.debt)}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-28',
            render: (s) => (
                <div className="flex items-center justify-center space-x-1">
                    <button
                        type="button"
                        onClick={() => setPayingSupplier(s)}
                        disabled={s.debt <= 0}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
                        title="Thanh toán công nợ"
                        aria-label="Thanh toán công nợ"
                    >
                        <HandCoins className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleEditSupplier(s)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                        title="Sửa nhà cung cấp"
                        aria-label="Sửa nhà cung cấp"
                    >
                        <Edit3 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDeleteSupplier(s)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                        title="Xóa nhà cung cấp"
                        aria-label="Xóa nhà cung cấp"
                    >
                        <Trash2 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>
            ),
        },
    ];

    const hasActiveFilter = Boolean(searchQuery);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý nhà cung cấp" />

            <ManagerPageLayout
                icon={HandCoins}
                title="Nhà cung cấp"
                subtitle="Quản lý nhà cung cấp và công nợ phiếu nhập"
                badge={
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
                        {safeSuppliers.length} nhà cung cấp
                    </span>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={handleOpenAddDrawer}
                        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-2" />
                        <span>Thêm nhà cung cấp</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative max-w-xs min-w-[200px] flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm tên hoặc số điện thoại..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="flex items-center gap-1 rounded-xl bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                title="Đặt lại bộ lọc"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Đặt lại</span>
                            </button>
                        )}
                    </div>
                }
            >
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-xs dark:bg-zinc-900">
                    <DataTable
                        columns={columns}
                        rows={filteredSuppliers}
                        rowKey={(s) => s.id}
                        emptyMessage="Không tìm thấy nhà cung cấp"
                        emptyHint="Chưa có nhà cung cấp nào phù hợp với từ khóa tìm kiếm."
                        defaultSortKey="name"
                        defaultSortDirection="asc"
                        getSortValue={(s, key) => {
                            const val = (s as any)[key];

                            return typeof val === 'string'
                                ? val.toLowerCase()
                                : val;
                        }}
                    />
                </div>
            </ManagerPageLayout>

            <SupplierFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                supplierToEdit={supplierToEdit}
            />

            <SupplierPaymentsModal
                supplier={payingSupplier}
                onClose={() => setPayingSupplier(null)}
            />

            <DeleteConfirmModal
                isOpen={!!deletingSupplier}
                title="Xác nhận xóa nhà cung cấp"
                description={`Bạn có chắc chắn muốn xóa nhà cung cấp “${deletingSupplier?.name || ''}”? Thao tác này không thể hoàn tác.`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingSupplier(null)}
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
            {deleteError && (
                <div className="fixed right-4 bottom-4 z-50 rounded-xl bg-rose-600 px-4 py-2 text-xs text-white shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
