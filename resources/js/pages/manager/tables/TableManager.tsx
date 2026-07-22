import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, Armchair, SlidersHorizontal, CheckCircle, Users } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
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

    // Mini Stats calculations
    const totalTables = tables.length;
    const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
    const availableCount = tables.filter((t) => t.status === 'available').length;

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Bàn & Sơ đồ khu vực" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <Armchair className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Sơ đồ Bàn</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Bàn & Khu vực
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Quản lý danh sách bàn, tầng & khu vực phục vụ
                            </p>
                        </div>

                        {/* Primary Fixed Action Button */}
                        <div>
                            <button
                                type="button"
                                onClick={handleOpenAddDrawer}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                <Plus className="w-4 h-4 stroke-[2]" />
                                <span>Thêm bàn mới</span>
                            </button>
                        </div>

                        {/* Filter Controls */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Bộ lọc tìm kiếm</span>
                            </label>

                            {/* Search Input */}
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Tìm tên / số bàn..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                                />
                            </div>

                            {/* Area Filter */}
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Khu vực / Tầng</label>
                                <select
                                    value={selectedArea}
                                    onChange={(e) => handleAreaChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                                >
                                    <option value="all">Tất cả khu vực ({areas.length})</option>
                                    {areas.map((area) => (
                                        <option key={area} value={area}>
                                            {area}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Trạng thái bàn</label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                                >
                                    <option value="all">Tất cả trạng thái</option>
                                    <option value="available">Bàn trống</option>
                                    <option value="occupied">Đang dùng</option>
                                    <option value="reserved">Đã đặt trước</option>
                                    <option value="maintenance">Bảo trì</option>
                                </select>
                            </div>
                        </div>

                        {/* Mini Overview Stats */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 mt-auto">
                            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                                Trạng thái bàn hiện tại
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60 rounded-xl">
                                    <div className="flex items-center text-emerald-700 dark:text-emerald-300 text-[11px] mb-1">
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                        <span>Bàn trống</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-emerald-900 dark:text-emerald-100">
                                        {availableCount} / {totalTables}
                                    </span>
                                </div>

                                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 rounded-xl">
                                    <div className="flex items-center text-amber-700 dark:text-amber-300 text-[11px] mb-1">
                                        <Users className="w-3.5 h-3.5 mr-1" />
                                        <span>Đang dùng</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-amber-900 dark:text-amber-100">
                                        {occupiedCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                }
            >
                {/* Table List Table */}
                <TableListTable
                    tables={tables}
                    onEdit={handleEditTable}
                    onDelete={handleDeleteTable}
                />
            </ManagerPageLayout>

            {/* Table Form Drawer */}
            <TableFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                tableToEdit={tableToEdit}
                areas={areas}
            />

            {/* Delete Password Confirmation Modal */}
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
                <div className="fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-xl shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
