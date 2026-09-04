import { Head, router } from '@inertiajs/react';
import { Users, Plus, Search, RotateCcw, Edit3, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import DataTable from '../../../components/DataTable';
import type { DataTableColumn } from '../../../components/DataTable';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CustomerFormDrawer from './components/CustomerFormDrawer';

export interface CustomerData {
    id: number;
    full_name: string;
    phone: string;
    note: string | null;
    orders_count: number;
    total_spent: number;
}

interface CustomersManagerProps {
    customers: CustomerData[];
    filters: {
        search?: string;
    };
}

export default function CustomersManager({
    customers,
    filters,
}: CustomersManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<CustomerData | null>(
        null,
    );

    const [deletingCustomer, setDeletingCustomer] =
        useState<CustomerData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredCustomers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return customers;
        }

        return customers.filter(
            (c) =>
                c.full_name.toLowerCase().includes(query) ||
                c.phone.toLowerCase().includes(query),
        );
    }, [customers, searchQuery]);

    const handleOpenAddDrawer = () => {
        setCustomerToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditCustomer = (customer: CustomerData) => {
        setCustomerToEdit(customer);
        setIsDrawerOpen(true);
    };

    const handleDeleteCustomer = (customer: CustomerData) => {
        setDeletingCustomer(customer);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (!deletingCustomer) {
            return;
        }

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');

            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/manager/customers/${deletingCustomer.id}`, {
            data: { password: passwordValue },
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingCustomer(null);
                setPasswordValue('');
            },
            onError: (errs: any) => {
                setIsDeleting(false);

                if (errs.password) {
                    setDeleteError(errs.password);
                } else {
                    setDeleteError(
                        'Không thể xóa khách hàng. Vui lòng kiểm tra lại.',
                    );
                }
            },
        });
    };

    const columns: DataTableColumn<CustomerData>[] = [
        {
            key: 'full_name',
            header: 'Tên khách hàng',
            sortable: true,
            align: 'left',
            render: (c) => (
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {c.full_name}
                </span>
            ),
        },
        {
            key: 'phone',
            header: 'Số điện thoại',
            sortable: true,
            align: 'left',
            render: (c) => <span className="tabular-nums">{c.phone}</span>,
        },
        {
            key: 'note',
            header: 'Ghi chú',
            align: 'left',
            render: (c) => (
                <span className="text-zinc-500 dark:text-zinc-400">
                    {c.note || '—'}
                </span>
            ),
        },
        {
            key: 'orders_count',
            header: 'Tổng số đơn',
            sortable: true,
            align: 'center',
            render: (c) => (
                <span className="tabular-nums">{c.orders_count}</span>
            ),
        },
        {
            key: 'total_spent',
            header: 'Tổng tiền mua',
            sortable: true,
            align: 'right',
            render: (c) => (
                <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.total_spent)}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-24',
            render: (c) => (
                <div className="flex items-center justify-center space-x-1">
                    <button
                        type="button"
                        onClick={() => handleEditCustomer(c)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                        title="Sửa khách hàng"
                        aria-label="Sửa khách hàng"
                    >
                        <Edit3 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDeleteCustomer(c)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                        title="Xóa khách hàng"
                        aria-label="Xóa khách hàng"
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
            <Head title="Quản lý khách hàng" />

            <ManagerPageLayout
                icon={Users}
                title="Khách hàng"
                subtitle="Quản lý thông tin khách quen của quán"
                badge={
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {customers.length} khách hàng
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
                        <span>Thêm khách hàng</span>
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
                        rows={filteredCustomers}
                        rowKey={(c) => c.id}
                        emptyMessage="Không tìm thấy khách hàng"
                        emptyHint="Chưa có khách hàng nào phù hợp với từ khóa tìm kiếm."
                        defaultSortKey="full_name"
                        defaultSortDirection="asc"
                        getSortValue={(c, key) => {
                            const val = (c as any)[key];

                            return typeof val === 'string'
                                ? val.toLowerCase()
                                : val;
                        }}
                    />
                </div>
            </ManagerPageLayout>

            <CustomerFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                customerToEdit={customerToEdit}
            />

            <DeleteConfirmModal
                isOpen={!!deletingCustomer}
                title="Xác nhận xóa khách hàng"
                description={`Bạn có chắc chắn muốn xóa khách hàng ${deletingCustomer?.full_name || ''}?`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingCustomer(null)}
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
