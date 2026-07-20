import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import TableFilterBar from './components/TableFilterBar';
import TableListTable, { TableData } from './components/TableListTable';
import TableFormDrawer from './components/TableFormDrawer';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';

interface TableManagerProps {
    tables: TableData[];
    areas: string[];
    filters: {
        search?: string;
        area?: string;
        status?: string;
    };
}

export default function TableManager({ tables, areas, filters }: TableManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedArea, setSelectedArea] = useState(filters.area || 'all');
    const [selectedStatus, setSelectedStatus] = useState(filters.status || 'all');

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [tableToEdit, setTableToEdit] = useState<TableData | null>(null);

    const [deletingTable, setDeletingTable] = useState<TableData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        setSearchQuery(filters.search || '');
        setSelectedArea(filters.area || 'all');
        setSelectedStatus(filters.status || 'all');
    }, [filters]);

    const applyFilters = (newFilters: Record<string, any>) => {
        router.get(
            '/manager/tables',
            {
                search: searchQuery,
                area: selectedArea,
                status: selectedStatus,
                ...newFilters,
            },
            { preserveState: true, replace: true }
        );
    };

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        applyFilters({ search: query });
    };

    const handleAreaChange = (area: string) => {
        setSelectedArea(area);
        applyFilters({ area });
    };

    const handleStatusChange = (status: string) => {
        setSelectedStatus(status);
        applyFilters({ status });
    };

    const handleOpenAddDrawer = () => {
        setTableToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditTable = (table: TableData) => {
        setTableToEdit(table);
        setIsDrawerOpen(true);
    };

    const handleDeleteTable = (table: TableData) => {
        setDeletingTable(table);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();
        if (!deletingTable) return;

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');
            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/manager/tables/${deletingTable.id}`, {
            data: { password: passwordValue },
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingTable(null);
                setPasswordValue('');
            },
            onError: (errs: any) => {
                setIsDeleting(false);
                if (errs.password) {
                    setDeleteError(errs.password);
                } else {
                    setDeleteError('Không thể xóa bàn. Vui lòng kiểm tra lại.');
                }
            },
        });
    };

    return (
        <DashboardLayout>
            <Head title="Quản lý Bàn & Sơ đồ khu vực" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Quản lý Bàn & Sơ đồ khu vực
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Quản lý sơ đồ bàn, tầng & trạng thái bàn dịch vụ
                    </p>
                </div>

                <TableFilterBar
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    selectedArea={selectedArea}
                    onAreaChange={handleAreaChange}
                    selectedStatus={selectedStatus}
                    onStatusChange={handleStatusChange}
                    areas={areas}
                    onOpenAddDrawer={handleOpenAddDrawer}
                />

                <TableListTable
                    tables={tables}
                    onEdit={handleEditTable}
                    onDelete={handleDeleteTable}
                />
            </div>

            <TableFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                tableToEdit={tableToEdit}
                areas={areas}
            />

            <DeleteConfirmModal
                isOpen={!!deletingTable}
                title="Xác nhận xóa bàn"
                description={`Bạn có chắc chắn muốn xóa ${deletingTable?.table_number || ''} (${deletingTable?.area || ''})?`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingTable(null)}
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
            {deleteError && (
                <div className="fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
