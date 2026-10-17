import { Head, router } from '@inertiajs/react';
import { Plus, Search, Armchair, RotateCcw } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import TableFormModal from './components/TableFormModal';
import type { TableData } from './components/TableListTable';
import TableListTable from './components/TableListTable';

interface TableManagerProps {
    tables: TableData[];
    areas: string[];
    filters: {
        search?: string;
        area?: string;
        status?: string;
    };
}

export default function TableManager({
    tables,
    areas,
    filters,
}: TableManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedArea, setSelectedArea] = useState(filters.area || 'all');
    const [selectedStatus, setSelectedStatus] = useState(
        filters.status || 'all',
    );

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tableToEdit, setTableToEdit] = useState<TableData | null>(null);

    const [deletingTable, setDeletingTable] = useState<TableData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [prevFilters, setPrevFilters] = useState(filters);

    if (filters !== prevFilters) {
        setPrevFilters(filters);
        setSearchQuery(filters.search || '');
        setSelectedArea(filters.area || 'all');
        setSelectedStatus(filters.status || 'all');
    }

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

            const matchesArea =
                selectedArea === 'all' || table.area === selectedArea;
            const matchesStatus =
                selectedStatus === 'all' || table.status === selectedStatus;

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

    const handleOpenAddModal = () => {
        setTableToEdit(null);
        setIsModalOpen(true);
    };

    const handleEditTable = (table: TableData) => {
        setTableToEdit(table);
        setIsModalOpen(true);
    };

    const handleDeleteTable = (table: TableData) => {
        setDeletingTable(table);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (!deletingTable) {
            return;
        }

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
    const availableCount = tables.filter(
        (t) => t.status === 'available',
    ).length;
    const hasActiveFilter = Boolean(
        searchQuery || selectedArea !== 'all' || selectedStatus !== 'all',
    );

    // Status strip counts
    const statusCounts = (
        ['available', 'occupied', 'reserved', 'maintenance'] as const
    ).map((s) => ({
        status: s,
        count: tables.filter((t) => t.status === s).length,
    }));

    const statusConfig: Record<
        string,
        { label: string; bg: string; text: string; border: string }
    > = {
        available: {
            label: 'Trống',
            bg: 'bg-emerald-50 dark:bg-emerald-950/30',
            text: 'text-emerald-700 dark:text-emerald-400',
            border: 'border-emerald-200/80 dark:border-emerald-900/60',
        },
        occupied: {
            label: 'Đang phục vụ',
            bg: 'bg-rose-50 dark:bg-rose-950/30',
            text: 'text-rose-700 dark:text-rose-400',
            border: 'border-rose-200/80 dark:border-rose-900/60',
        },
        reserved: {
            label: 'Đặt bàn',
            bg: 'bg-purple-50 dark:bg-purple-950/30',
            text: 'text-purple-700 dark:text-purple-400',
            border: 'border-purple-200/80 dark:border-purple-900/60',
        },
        maintenance: {
            label: 'Bảo trì',
            bg: 'bg-zinc-50 dark:bg-zinc-800/40',
            text: 'text-zinc-600 dark:text-zinc-400',
            border: 'border-zinc-200/80 dark:border-zinc-700',
        },
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Bàn & Sơ đồ khu vực" />

            <ManagerPageLayout
                icon={Armchair}
                title="Bàn & Khu vực"
                subtitle="Quản lý danh sách bàn, tầng & khu vực phục vụ"
                badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {totalTables} bàn
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {availableCount} trống
                        </span>
                        {occupiedCount > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                                {occupiedCount} đang dùng
                            </span>
                        )}
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={handleOpenAddModal}
                        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-2" />
                        <span>Thêm bàn</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative max-w-xs min-w-[200px] flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) =>
                                    handleSearchChange(e.target.value)
                                }
                                placeholder="Tìm tên / số bàn..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        {/* Area Filter */}
                        <div className="w-48">
                            <select
                                value={selectedArea}
                                onChange={(e) =>
                                    handleAreaChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            >
                                <option value="all">
                                    Tất cả khu vực ({areas.length})
                                </option>
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
                                onChange={(e) =>
                                    handleStatusChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
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
                {/* Table List Table with status strip and Instant Frontend Filtering */}
                <div className="flex h-full min-h-0 flex-col">
                    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
                        {statusCounts.map(({ status, count }) => {
                            const conf = statusConfig[status];

                            return (
                                <div
                                    key={status}
                                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${conf.bg} ${conf.border} ${conf.text}`}
                                >
                                    <span>{conf.label}:</span>
                                    <span className="font-semibold tabular-nums">
                                        {count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <TableListTable
                            tables={filteredTables}
                            onEdit={handleEditTable}
                            onDelete={handleDeleteTable}
                        />
                    </div>
                </div>
            </ManagerPageLayout>

            {/* Table Form Modal */}
            <TableFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
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
                <div className="fixed right-4 bottom-4 z-50 rounded-xl bg-rose-600 px-4 py-2 text-xs text-white shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
