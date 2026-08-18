import React, { useState, useEffect, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, Armchair, SlidersHorizontal, CheckCircle, Users, RotateCcw } from 'lucide-react';
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

    // Realtime WebSocket Listener via Reverb for instant table updates
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.private('pos-channel');
            channel
                .listen('.OrderSentToKitchen', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })
                .listen('.OrderCompleted', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                })
                .listen('.TableStatusUpdated', () => {
                    router.reload({
                        only: ['tables'],
                        onError: () => {},
                    });
                });

            return () => {
                window.Echo.leave('pos-channel');
            };
        }
    }, []);

    // 100% Instant Frontend Filtering via useMemo without backend HTTP roundtrips
    const filteredTables = useMemo(() => {
        return tables.filter((table) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                table.table_number.toLowerCase().includes(query) ||
                (table.area && table.area.toLowerCase().includes(query));

            const matchesArea = selectedArea === 'all' || table.area === selectedArea;
            const matchesStatus = selectedStatus === 'all' || table.status === selectedStatus;

            return matchesSearch && matchesArea && matchesStatus;
        });
    }, [tables, searchQuery, selectedArea, selectedStatus]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
    };

    const handleAreaChange = (area: string) => {
        setSelectedArea(area);
    };

    const handleStatusChange = (status: string) => {
        setSelectedStatus(status);
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
    const hasActiveFilter = Boolean(searchQuery || selectedArea !== 'all' || selectedStatus !== 'all');

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Bàn & Sơ đồ khu vực" />

            <ManagerPageLayout
                icon={Armchair}
                title="Bàn & Khu vực"
                subtitle="Quản lý danh sách bàn, tầng & khu vực phục vụ"
                badge={
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {totalTables} bàn
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {availableCount} trống
                        </span>
                        {occupiedCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                {occupiedCount} đang dùng
                            </span>
                        )}
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={handleOpenAddDrawer}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-2" />
                        <span>Thêm bàn</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Tìm tên / số bàn..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Area Filter */}
                        <div className="w-48">
                            <select
                                value={selectedArea}
                                onChange={(e) => handleAreaChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
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
                        <div className="w-44">
                            <select
                                value={selectedStatus}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả trạng thái</option>
                                <option value="available">Bàn trống</option>
                                <option value="occupied">Đang dùng</option>
                                <option value="reserved">Đã đặt trước</option>
                                <option value="maintenance">Bảo trì</option>
                            </select>
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => {
                                    handleSearchChange('');
                                    handleAreaChange('all');
                                    handleStatusChange('all');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                title="Đặt lại bộ lọc"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Đặt lại</span>
                            </button>
                        )}
                    </div>
                }
            >
                {/* Table List Table with Instant Frontend Filtering */}
                <TableListTable
                    tables={filteredTables}
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
