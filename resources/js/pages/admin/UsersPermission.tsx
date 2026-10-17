import { Head, router, Link, useForm } from '@inertiajs/react';
import {
    Users,
    Search,
    SlidersHorizontal,
    Shield,
    Pencil,
    Trash2,
    RotateCcw,
    X,
    ChevronRight,
    AlertTriangle,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import DashboardLayout from '../../layouts/DashboardLayout';
import type { Role, AdminUser, PaginatedUsers } from '../../types/admin';

interface Props {
    users: PaginatedUsers;
    roles: Role[];
}

export default function UsersPermission({ users, roles }: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<string[]>([
        'stt',
        'user',
        'email',
        'roles',
        'created_at',
    ]);
    const [isBulkRoleAssignOpen, setIsBulkRoleAssignOpen] = useState(false);
    const [bulkSelectedRoles, setBulkSelectedRoles] = useState<string[]>([]);
    const [isBulkConfirmModalOpen, setIsBulkConfirmModalOpen] = useState(false);
    const [bulkActionType, setBulkActionType] = useState<
        'clear_roles' | 'delete_users' | null
    >(null);

    // Single action modals
    const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] =
        useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
    const [usersToDelete, setUsersToDelete] = useState<number[]>([]);

    // Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const { data, setData, post, processing, reset } = useForm({
        roles: [] as string[],
    });

    const paginatedUsers = useMemo(() => {
        return users.data.filter((user: AdminUser) => {
            const matchesSearch =
                user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole =
                roleFilter === '' ||
                user.roles.some((r: Role) => r.name === roleFilter);

            return matchesSearch && matchesRole;
        });
    }, [users.data, searchQuery, roleFilter]);

    const isAllOnPageSelected =
        paginatedUsers.length > 0 &&
        paginatedUsers
            .filter(
                (u: AdminUser) =>
                    !u.roles.some((r: Role) => r.name === 'admin'),
            )
            .every((u: AdminUser) => selectedUserIds.includes(u.id));

    const handleSelectAllOnPage = (checked: boolean) => {
        const selectableUserIds = paginatedUsers
            .filter(
                (u: AdminUser) =>
                    !u.roles.some((r: Role) => r.name === 'admin'),
            )
            .map((u: AdminUser) => u.id);

        if (checked) {
            setSelectedUserIds(
                Array.from(new Set([...selectedUserIds, ...selectableUserIds])),
            );
        } else {
            setSelectedUserIds(
                selectedUserIds.filter((id) => !selectableUserIds.includes(id)),
            );
        }
    };

    const handleSelectUser = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedUserIds([...selectedUserIds, id]);
        } else {
            setSelectedUserIds(
                selectedUserIds.filter((userId) => userId !== id),
            );
        }
    };

    const openEditModal = (user: AdminUser) => {
        setEditingUser(user);
        setData(
            'roles',
            user.roles.map((r: Role) => r.name),
        );
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        reset();
    };

    const handleRoleToggle = (roleName: string) => {
        if (data.roles.includes(roleName)) {
            setData(
                'roles',
                data.roles.filter((r) => r !== roleName),
            );
        } else {
            setData('roles', [...data.roles, roleName]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingUser) {
            post(`/admin/permissions/${editingUser.id}`, {
                onSuccess: () => closeModal(),
            });
        }
    };

    const handleBulkRoleAssign = (roleNames: string[]) => {
        if (selectedUserIds.length === 0 || roleNames.length === 0) {
            return;
        }

        router.post(
            '/admin/permissions/bulk',
            {
                user_ids: selectedUserIds,
                action: 'assign_roles',
                roles: roleNames,
            },
            {
                onSuccess: () => {
                    setSelectedUserIds([]);
                    setBulkSelectedRoles([]);
                    setIsBulkMode(false);
                },
            },
        );
    };

    const handleBulkActionConfirm = () => {
        if (bulkActionType === 'clear_roles') {
            router.post(
                '/admin/permissions/bulk',
                {
                    user_ids: selectedUserIds,
                    action: 'clear_roles',
                },
                {
                    onSuccess: () => {
                        setIsBulkConfirmModalOpen(false);
                        setSelectedUserIds([]);
                        setBulkActionType(null);
                    },
                },
            );
        } else if (bulkActionType === 'delete_users') {
            setIsBulkConfirmModalOpen(false);
            setUsersToDelete(selectedUserIds);
            setDeletePassword('');
            setIsDeleteConfirmOpen(true);
        }
    };

    const triggerBulkAction = (action: 'clear_roles' | 'delete_users') => {
        if (selectedUserIds.length === 0) {
            return;
        }

        setBulkActionType(action);
        setIsBulkConfirmModalOpen(true);
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Phân quyền Người dùng" />

            <div className="flex h-full min-h-0 w-full flex-1 flex-col space-y-3 overflow-hidden">
                {/* Top Control Bar Header */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Users className="h-5 w-5 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                                <h1 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Phân quyền Tài khoản Người dùng
                                </h1>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
                                    {users.total} người dùng
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Gán vai trò và quyền hạn chi tiết cho từng tài
                                khoản nhân sự trong hệ thống
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setIsBulkMode(!isBulkMode);
                            setSelectedUserIds([]);
                        }}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-2xs transition-colors ${
                            isBulkMode
                                ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-300'
                                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                    >
                        <Shield className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>
                            {isBulkMode
                                ? 'Tắt Chỉnh Sửa Hàng Loạt'
                                : 'Chỉnh Sửa Hàng Loạt'}
                        </span>
                    </button>
                </div>

                {/* Filter & Actions Toolbar */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex min-w-[240px] flex-1 items-center gap-2.5">
                        <div className="relative max-w-sm flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm kiếm theo tên hoặc email..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        <div className="w-48">
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            >
                                <option value="">Tất cả vai trò</option>
                                {roles.map((r) => (
                                    <option key={r.id} value={r.name}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                                setIsColumnsDropdownOpen(!isColumnsDropdownOpen)
                            }
                            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                            <span>Hiển thị cột</span>
                        </button>

                        {isColumnsDropdownOpen && (
                            <div className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-zinc-200/80 bg-white py-2 shadow-xl dark:border-zinc-700/80 dark:bg-zinc-800">
                                {[
                                    { key: 'stt', label: 'STT' },
                                    { key: 'user', label: 'Người dùng' },
                                    { key: 'email', label: 'Email' },
                                    { key: 'roles', label: 'Nhóm quyền' },
                                    { key: 'created_at', label: 'Ngày tạo' },
                                ].map((col) => (
                                    <label
                                        key={col.key}
                                        className="flex cursor-pointer items-center space-x-2.5 px-3.5 py-1.5 text-xs select-none hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(
                                                col.key,
                                            )}
                                            onChange={() => {
                                                if (
                                                    visibleColumns.includes(
                                                        col.key,
                                                    )
                                                ) {
                                                    setVisibleColumns(
                                                        visibleColumns.filter(
                                                            (k) =>
                                                                k !== col.key,
                                                        ),
                                                    );
                                                } else {
                                                    setVisibleColumns([
                                                        ...visibleColumns,
                                                        col.key,
                                                    ]);
                                                }
                                            }}
                                            className="checkbox-field"
                                        />
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                            {col.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bulk Action Bar Banner */}
                {isBulkMode && (
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-sky-200/80 bg-sky-50/70 p-3 dark:border-sky-800/60 dark:bg-sky-950/40">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
                            <span>Đã chọn</span>
                            <span className="rounded-md bg-sky-600 px-2 py-0.5 text-[11px] text-white tabular-nums">
                                {selectedUserIds.length}
                            </span>
                            <span>người dùng</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Gán quyền nhanh popover trigger */}
                            <div className="relative">
                                <button
                                    type="button"
                                    disabled={selectedUserIds.length === 0}
                                    onClick={() => {
                                        setIsBulkRoleAssignOpen(
                                            !isBulkRoleAssignOpen,
                                        );
                                        setBulkSelectedRoles([]);
                                    }}
                                    className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-2xs hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-700/60 dark:bg-zinc-800"
                                >
                                    <Shield className="h-3.5 w-3.5" />
                                    <span>Gán vai trò hàng loạt</span>
                                </button>

                                {isBulkRoleAssignOpen && (
                                    <div className="absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xl dark:border-zinc-700/80 dark:bg-zinc-900">
                                        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                            Chọn các vai trò:
                                        </p>
                                        <div className="max-h-40 space-y-1.5 overflow-y-auto">
                                            {roles.map((r) => (
                                                <label
                                                    key={r.id}
                                                    className="flex cursor-pointer items-center space-x-2.5 text-xs select-none"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkSelectedRoles.includes(
                                                            r.name,
                                                        )}
                                                        onChange={(e) => {
                                                            if (
                                                                e.target.checked
                                                            ) {
                                                                setBulkSelectedRoles(
                                                                    [
                                                                        ...bulkSelectedRoles,
                                                                        r.name,
                                                                    ],
                                                                );
                                                            } else {
                                                                setBulkSelectedRoles(
                                                                    bulkSelectedRoles.filter(
                                                                        (x) =>
                                                                            x !==
                                                                            r.name,
                                                                    ),
                                                                );
                                                            }
                                                        }}
                                                        className="checkbox-field"
                                                    />
                                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                                        {r.name}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="dark:border-zinc-750 flex justify-end gap-2 border-t border-zinc-100 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsBulkRoleAssignOpen(
                                                        false,
                                                    );
                                                    setBulkSelectedRoles([]);
                                                }}
                                                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800"
                                            >
                                                Hủy
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleBulkRoleAssign(
                                                        bulkSelectedRoles,
                                                    );
                                                    setIsBulkRoleAssignOpen(
                                                        false,
                                                    );
                                                }}
                                                disabled={
                                                    bulkSelectedRoles.length ===
                                                    0
                                                }
                                                className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
                                            >
                                                Lưu
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                disabled={selectedUserIds.length === 0}
                                onClick={() => triggerBulkAction('clear_roles')}
                                className="flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700/60 dark:bg-zinc-800"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Xóa Quyền (Về Guest)</span>
                            </button>

                            <button
                                type="button"
                                disabled={selectedUserIds.length === 0}
                                onClick={() =>
                                    triggerBulkAction('delete_users')
                                }
                                className="flex items-center gap-1 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-700/60 dark:bg-zinc-800"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Xóa User khỏi DB</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Users Table Panel */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/90">
                                <tr className="text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    {isBulkMode && (
                                        <th className="w-12 px-3 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={isAllOnPageSelected}
                                                onChange={(e) =>
                                                    handleSelectAllOnPage(
                                                        e.target.checked,
                                                    )
                                                }
                                                className="checkbox-field cursor-pointer"
                                            />
                                        </th>
                                    )}
                                    {visibleColumns.includes('stt') && (
                                        <th className="px-4 py-3 text-center">
                                            STT
                                        </th>
                                    )}
                                    {visibleColumns.includes('user') && (
                                        <th className="px-4 py-3 text-left">
                                            Người dùng
                                        </th>
                                    )}
                                    {visibleColumns.includes('email') && (
                                        <th className="px-4 py-3 text-left">
                                            Email
                                        </th>
                                    )}
                                    {visibleColumns.includes('roles') && (
                                        <th className="px-4 py-3 text-center">
                                            Nhóm quyền (Roles)
                                        </th>
                                    )}
                                    {visibleColumns.includes('created_at') && (
                                        <th className="px-4 py-3 text-center">
                                            Ngày tạo
                                        </th>
                                    )}
                                    <th className="px-4 py-3 text-center">
                                        Hành động
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {paginatedUsers.map(
                                    (user: AdminUser, index: number) => {
                                        const isSuperAdmin = user.roles.some(
                                            (r: Role) => r.name === 'admin',
                                        );
                                        const createdDate = user.created_at
                                            ? user.created_at.split('T')[0]
                                            : '—';
                                        const absoluteIndex =
                                            (users.current_page - 1) *
                                                users.per_page +
                                            index +
                                            1;

                                        return (
                                            <tr
                                                key={user.id}
                                                onClick={(e) => {
                                                    const target =
                                                        e.target as HTMLElement;

                                                    if (isSuperAdmin) {
                                                        return;
                                                    }

                                                    if (
                                                        target.closest(
                                                            'button',
                                                        ) ||
                                                        target.closest(
                                                            'input',
                                                        ) ||
                                                        target.closest('a') ||
                                                        target.closest('select')
                                                    ) {
                                                        return;
                                                    }

                                                    if (isBulkMode) {
                                                        handleSelectUser(
                                                            user.id,
                                                            !selectedUserIds.includes(
                                                                user.id,
                                                            ),
                                                        );
                                                    }
                                                }}
                                                className={`transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 ${
                                                    isBulkMode && !isSuperAdmin
                                                        ? 'cursor-pointer select-none'
                                                        : ''
                                                }`}
                                            >
                                                {isBulkMode && (
                                                    <td className="px-3 py-3.5 text-center">
                                                        <input
                                                            type="checkbox"
                                                            disabled={
                                                                isSuperAdmin
                                                            }
                                                            checked={selectedUserIds.includes(
                                                                user.id,
                                                            )}
                                                            onChange={(e) =>
                                                                handleSelectUser(
                                                                    user.id,
                                                                    e.target
                                                                        .checked,
                                                                )
                                                            }
                                                            className="checkbox-field"
                                                        />
                                                    </td>
                                                )}
                                                {visibleColumns.includes(
                                                    'stt',
                                                ) && (
                                                    <td className="px-4 py-3.5 text-center font-mono text-zinc-400 tabular-nums">
                                                        {absoluteIndex}
                                                    </td>
                                                )}
                                                {visibleColumns.includes(
                                                    'user',
                                                ) && (
                                                    <td className="px-4 py-3.5 text-left font-medium text-zinc-900 dark:text-zinc-100">
                                                        <div className="flex items-center gap-2.5">
                                                            {user.avatar ? (
                                                                <img
                                                                    src={
                                                                        user.avatar
                                                                    }
                                                                    alt=""
                                                                    className="h-7 w-7 rounded-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                                                    {user.name
                                                                        .charAt(
                                                                            0,
                                                                        )
                                                                        .toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span className="font-semibold">
                                                                {user.name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                )}
                                                {visibleColumns.includes(
                                                    'email',
                                                ) && (
                                                    <td className="px-4 py-3.5 text-left font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                                                        {user.email}
                                                    </td>
                                                )}
                                                {visibleColumns.includes(
                                                    'roles',
                                                ) && (
                                                    <td className="px-4 py-3.5 text-center">
                                                        <div className="mx-auto flex max-w-xs flex-wrap justify-center gap-1">
                                                            {user.roles.map(
                                                                (
                                                                    role: Role,
                                                                ) => (
                                                                    <span
                                                                        key={
                                                                            role.id
                                                                        }
                                                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                                            role.name ===
                                                                            'admin'
                                                                                ? 'border border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                                                                : 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                                                        }`}
                                                                    >
                                                                        {
                                                                            role.name
                                                                        }
                                                                    </span>
                                                                ),
                                                            )}
                                                            {user.roles
                                                                .length ===
                                                                0 && (
                                                                <span className="text-[11px] text-zinc-400 italic">
                                                                    Chưa có vai
                                                                    trò
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                                {visibleColumns.includes(
                                                    'created_at',
                                                ) && (
                                                    <td className="px-4 py-3.5 text-center font-mono text-zinc-500 tabular-nums dark:text-zinc-400">
                                                        {createdDate}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3.5 text-center">
                                                    {!isSuperAdmin ? (
                                                        <div className="flex justify-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openEditModal(
                                                                        user,
                                                                    )
                                                                }
                                                                className="rounded-lg p-1.5 text-sky-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/60"
                                                                title="Sửa quyền"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedUserIds(
                                                                        [
                                                                            user.id,
                                                                        ],
                                                                    );
                                                                    setIsSingleDeleteModalOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                                className="rounded-lg p-1.5 text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60"
                                                                title="Xóa quyền / tài khoản"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-400 italic dark:bg-zinc-800">
                                                            Admin gốc
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    },
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Server-side Pagination UI */}
                    {users.total > users.per_page && (
                        <div className="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                Hiển thị {users.data.length} trên tổng số{' '}
                                <span className="font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                                    {users.total}
                                </span>{' '}
                                người dùng
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {users.links.map(
                                    (
                                        link: {
                                            url: string | null;
                                            label: string;
                                            active: boolean;
                                        },
                                        i: number,
                                    ) => (
                                        <Link
                                            key={i}
                                            href={link.url || '#'}
                                            disabled={!link.url}
                                            preserveState
                                            preserveScroll
                                            dangerouslySetInnerHTML={{
                                                __html: link.label,
                                            }}
                                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                                link.active
                                                    ? 'bg-sky-600 text-white'
                                                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
                                            }`}
                                        />
                                    ),
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                Phân quyền Người dùng
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                aria-label="Đóng"
                            >
                                <X className="h-4 w-4 stroke-[1.5]" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/60">
                            {editingUser.avatar ? (
                                <img
                                    src={editingUser.avatar}
                                    alt=""
                                    className="h-9 w-9 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                    {editingUser.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                    {editingUser.name}
                                </p>
                                <p className="font-mono text-[11px] text-zinc-400">
                                    {editingUser.email}
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={handleSubmit}
                            className="space-y-4 text-xs"
                        >
                            <div>
                                <label className="mb-2 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                    Chọn các vai trò (Roles)
                                </label>
                                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
                                    {roles.map((role) => (
                                        <label
                                            key={role.id}
                                            className="flex cursor-pointer items-start space-x-2.5 rounded-xl p-2 transition-colors hover:bg-white dark:hover:bg-zinc-800"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={data.roles.includes(
                                                    role.name,
                                                )}
                                                onChange={() =>
                                                    handleRoleToggle(role.name)
                                                }
                                                className="checkbox-field mt-0.5"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {role.name}
                                                </span>
                                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                    {role.description ||
                                                        'Không có mô tả'}
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                                >
                                    Lưu quyền
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Action Confirm Modal */}
            {isBulkConfirmModalOpen && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-rose-600 text-zinc-900 dark:text-rose-400 dark:text-zinc-100">
                            <AlertTriangle className="h-5 w-5 stroke-[1.5]" />
                            <span>Xác nhận hành động hàng loạt</span>
                        </h2>
                        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {bulkActionType === 'clear_roles'
                                ? `Bạn có chắc chắn muốn xóa hết vai trò của ${selectedUserIds.length} người dùng đã chọn? (Họ sẽ được khôi phục về quyền khách 'guest')`
                                : `Bạn có chắc chắn muốn xóa hoàn toàn ${selectedUserIds.length} người dùng đã chọn khỏi hệ thống vĩnh viễn?`}
                        </p>
                        <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setIsBulkConfirmModalOpen(false)}
                                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkActionConfirm}
                                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs ${
                                    bulkActionType === 'clear_roles'
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-rose-600 hover:bg-rose-700'
                                }`}
                            >
                                Xác nhận thực hiện
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Delete Confirm Modal */}
            {isSingleDeleteModalOpen && selectedUserIds.length === 1 && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-rose-600 text-zinc-900 dark:text-rose-400 dark:text-zinc-100">
                                <AlertTriangle className="h-5 w-5 stroke-[1.5]" />
                                <span>Tùy chọn xóa quyền / tài khoản</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setSelectedUserIds([]);
                                }}
                                className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                                <X className="h-4 w-4 stroke-[1.5]" />
                            </button>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Vui lòng chọn hành động muốn thực hiện cho người
                            dùng này:
                        </p>
                        <div className="flex flex-col gap-2 pt-1 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    router.post(
                                        '/admin/permissions/bulk',
                                        {
                                            user_ids: selectedUserIds,
                                            action: 'clear_roles',
                                        },
                                        {
                                            onSuccess: () => {
                                                setIsSingleDeleteModalOpen(
                                                    false,
                                                );
                                                setSelectedUserIds([]);
                                            },
                                        },
                                    );
                                }}
                                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-left transition-colors hover:bg-amber-100/60 dark:border-amber-800/60 dark:bg-amber-950/30"
                            >
                                <div>
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                                        Xóa sạch vai trò
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/80">
                                        Khôi phục về nhóm khách mặc định (guest)
                                    </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-amber-600" />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setUsersToDelete(selectedUserIds);
                                    setDeletePassword('');
                                    setIsDeleteConfirmOpen(true);
                                }}
                                className="flex w-full items-center justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-left transition-colors hover:bg-rose-100/60 dark:border-rose-800/60 dark:bg-rose-950/30"
                            >
                                <div>
                                    <p className="font-semibold text-rose-800 dark:text-rose-300">
                                        Xóa vĩnh viễn User
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-rose-600/80 dark:text-rose-400/80">
                                        Xóa hoàn toàn tài khoản khỏi cơ sở dữ
                                        liệu
                                    </p>
                                </div>
                                <Trash2 className="h-4 w-4 text-rose-600" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={isDeleteConfirmOpen}
                title="Xác nhận xóa tài khoản vĩnh viễn"
                description={`Bạn có chắc chắn muốn xóa ${usersToDelete.length} tài khoản đã chọn? Hành động này không thể hoàn tác.`}
                passwordValue={deletePassword}
                onPasswordChange={(val) => {
                    setDeletePassword(val);
                    setDeleteErrorMsg(null);
                }}
                errorMsg={deleteErrorMsg}
                onClose={() => {
                    setIsDeleteConfirmOpen(false);
                    setDeletePassword('');
                    setDeleteErrorMsg(null);
                    setUsersToDelete([]);
                }}
                onConfirm={(e) => {
                    e.preventDefault();
                    router.post(
                        '/admin/users/bulk-action',
                        {
                            user_ids: usersToDelete,
                            action: 'delete_users',
                            password: deletePassword,
                        },
                        {
                            onSuccess: () => {
                                setIsDeleteConfirmOpen(false);
                                setUsersToDelete([]);
                                setDeletePassword('');
                                setDeleteErrorMsg(null);
                                setSelectedUserIds([]);
                            },
                            onError: (err) => {
                                setDeleteErrorMsg(
                                    err.password ||
                                        'Mật khẩu xác nhận không chính xác.',
                                );
                            },
                        },
                    );
                }}
            />
        </DashboardLayout>
    );
}
