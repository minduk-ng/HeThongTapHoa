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
    AlertTriangle
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
    const [visibleColumns, setVisibleColumns] = useState<string[]>(['stt', 'user', 'email', 'roles', 'created_at']);
    const [isBulkRoleAssignOpen, setIsBulkRoleAssignOpen] = useState(false);
    const [bulkSelectedRoles, setBulkSelectedRoles] = useState<string[]>([]);
    const [isBulkConfirmModalOpen, setIsBulkConfirmModalOpen] = useState(false);
    const [bulkActionType, setBulkActionType] = useState<'clear_roles' | 'delete_users' | null>(null);

    // Single action modals
    const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
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
            const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === '' || user.roles.some((r: Role) => r.name === roleFilter);

            return matchesSearch && matchesRole;
        });
    }, [users.data, searchQuery, roleFilter]);

    const isAllOnPageSelected = paginatedUsers.length > 0 && 
        paginatedUsers.filter((u: AdminUser) => !u.roles.some((r: Role) => r.name === 'admin')).every((u: AdminUser) => selectedUserIds.includes(u.id));

    const handleSelectAllOnPage = (checked: boolean) => {
        const selectableUserIds = paginatedUsers
            .filter((u: AdminUser) => !u.roles.some((r: Role) => r.name === 'admin'))
            .map((u: AdminUser) => u.id);
        
        if (checked) {
            setSelectedUserIds(Array.from(new Set([...selectedUserIds, ...selectableUserIds])));
        } else {
            setSelectedUserIds(selectedUserIds.filter(id => !selectableUserIds.includes(id)));
        }
    };

    const handleSelectUser = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedUserIds([...selectedUserIds, id]);
        } else {
            setSelectedUserIds(selectedUserIds.filter(userId => userId !== id));
        }
    };

    const openEditModal = (user: AdminUser) => {
        setEditingUser(user);
        setData('roles', user.roles.map((r: Role) => r.name));
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        reset();
    };

    const handleRoleToggle = (roleName: string) => {
        if (data.roles.includes(roleName)) {
            setData('roles', data.roles.filter(r => r !== roleName));
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

        router.post('/admin/permissions/bulk', {
            user_ids: selectedUserIds,
            action: 'assign_roles',
            roles: roleNames,
        }, {
            onSuccess: () => {
                setSelectedUserIds([]);
                setBulkSelectedRoles([]);
                setIsBulkMode(false);
            },
        });
    };

    const handleBulkActionConfirm = () => {
        if (bulkActionType === 'clear_roles') {
            router.post('/admin/permissions/bulk', {
                user_ids: selectedUserIds,
                action: 'clear_roles',
            }, {
                onSuccess: () => {
                    setIsBulkConfirmModalOpen(false);
                    setSelectedUserIds([]);
                    setBulkActionType(null);
                },
            });
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

            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden space-y-3">
                {/* Top Control Bar Header */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs shrink-0 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                            <Users className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Phân quyền Tài khoản Người dùng
                                </h1>
                                <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums">
                                    {users.total} người dùng
                                </span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Gán vai trò và quyền hạn chi tiết cho từng tài khoản nhân sự trong hệ thống
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setIsBulkMode(!isBulkMode);
                            setSelectedUserIds([]);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors shadow-2xs ${
                            isBulkMode
                                ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/60 text-sky-700 dark:text-sky-300'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        }`}
                    >
                        <Shield className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>{isBulkMode ? 'Tắt Chỉnh Sửa Hàng Loạt' : 'Chỉnh Sửa Hàng Loạt'}</span>
                    </button>
                </div>

                {/* Filter & Actions Toolbar */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 shadow-xs shrink-0 flex items-center justify-between flex-wrap gap-2.5">
                    <div className="flex flex-1 min-w-[240px] items-center gap-2.5">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm kiếm theo tên hoặc email..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>
                        
                        <div className="w-48">
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="">Tất cả vai trò</option>
                                {roles.map(r => (
                                    <option key={r.id} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Hiển thị cột</span>
                        </button>
                        
                        {isColumnsDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-zinc-200/80 dark:border-zinc-700/80 py-2 z-30">
                                {[
                                    { key: 'stt', label: 'STT' },
                                    { key: 'user', label: 'Người dùng' },
                                    { key: 'email', label: 'Email' },
                                    { key: 'roles', label: 'Nhóm quyền' },
                                    { key: 'created_at', label: 'Ngày tạo' },
                                ].map(col => (
                                    <label key={col.key} className="flex items-center space-x-2.5 px-3.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 cursor-pointer select-none text-xs">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(col.key)}
                                            onChange={() => {
                                                if (visibleColumns.includes(col.key)) {
                                                    setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                                                } else {
                                                    setVisibleColumns([...visibleColumns, col.key]);
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
                    <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/60 p-3 rounded-2xl shrink-0 flex items-center justify-between flex-wrap gap-2.5">
                        <div className="text-xs text-sky-800 dark:text-sky-300 font-semibold flex items-center gap-1.5">
                            <span>Đã chọn</span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white tabular-nums text-[11px]">
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
                                        setIsBulkRoleAssignOpen(!isBulkRoleAssignOpen);
                                        setBulkSelectedRoles([]);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-white dark:bg-zinc-800 border border-sky-300 dark:border-sky-700/60 rounded-xl hover:bg-sky-50 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Shield className="w-3.5 h-3.5" />
                                    <span>Gán vai trò hàng loạt</span>
                                </button>
                                
                                {isBulkRoleAssignOpen && (
                                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200/80 dark:border-zinc-700/80 p-4 z-30 space-y-3">
                                        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                            Chọn các vai trò:
                                        </p>
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {roles.map(r => (
                                                <label key={r.id} className="flex items-center space-x-2.5 cursor-pointer select-none text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkSelectedRoles.includes(r.name)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkSelectedRoles([...bulkSelectedRoles, r.name]);
                                                            } else {
                                                                setBulkSelectedRoles(bulkSelectedRoles.filter(x => x !== r.name));
                                                            }
                                                        }}
                                                        className="checkbox-field"
                                                    />
                                                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                                                        {r.name}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-750 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsBulkRoleAssignOpen(false);
                                                    setBulkSelectedRoles([]);
                                                }}
                                                className="px-2.5 py-1 text-xs text-zinc-600 bg-zinc-100 dark:bg-zinc-800 rounded-lg"
                                            >
                                                Hủy
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleBulkRoleAssign(bulkSelectedRoles);
                                                    setIsBulkRoleAssignOpen(false);
                                                }}
                                                disabled={bulkSelectedRoles.length === 0}
                                                className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-40"
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
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700/60 rounded-xl hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Xóa Quyền (Về Guest)</span>
                            </button>
                            
                            <button
                                type="button"
                                disabled={selectedUserIds.length === 0}
                                onClick={() => triggerBulkAction('delete_users')}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-white dark:bg-zinc-800 border border-rose-300 dark:border-rose-700/60 rounded-xl hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa User khỏi DB</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Users Table Panel */}
                <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-0">
                    <div className="overflow-auto flex-1 min-h-0">
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 border-b border-zinc-200/80 dark:border-zinc-800">
                                <tr className="text-zinc-500 dark:text-zinc-400 font-semibold uppercase text-[11px] tracking-wider text-center">
                                    {isBulkMode && (
                                        <th className="w-12 px-3 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                checked={isAllOnPageSelected}
                                                onChange={(e) => handleSelectAllOnPage(e.target.checked)}
                                                className="checkbox-field cursor-pointer"
                                            />
                                        </th>
                                    )}
                                    {visibleColumns.includes('stt') && <th className="px-4 py-3 text-center">STT</th>}
                                    {visibleColumns.includes('user') && <th className="px-4 py-3 text-left">Người dùng</th>}
                                    {visibleColumns.includes('email') && <th className="px-4 py-3 text-left">Email</th>}
                                    {visibleColumns.includes('roles') && <th className="px-4 py-3 text-center">Nhóm quyền (Roles)</th>}
                                    {visibleColumns.includes('created_at') && <th className="px-4 py-3 text-center">Ngày tạo</th>}
                                    <th className="px-4 py-3 text-center">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {paginatedUsers.map((user: AdminUser, index: number) => {
                                    const isSuperAdmin = user.roles.some((r: Role) => r.name === 'admin');
                                    const createdDate = user.created_at ? user.created_at.split('T')[0] : '—';
                                    const absoluteIndex = (users.current_page - 1) * users.per_page + index + 1;
                                    
                                    return (
                                        <tr 
                                            key={user.id} 
                                            onClick={(e) => {
                                                const target = e.target as HTMLElement;

                                                if (isSuperAdmin) {
return;
}

                                                if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('select')) {
                                                    return;
                                                }

                                                if (isBulkMode) {
                                                    handleSelectUser(user.id, !selectedUserIds.includes(user.id));
                                                }
                                            }}
                                            className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                                                isBulkMode && !isSuperAdmin ? 'cursor-pointer select-none' : ''
                                            }`}
                                        >
                                            {isBulkMode && (
                                                <td className="px-3 py-3.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        disabled={isSuperAdmin}
                                                        checked={selectedUserIds.includes(user.id)}
                                                        onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                                                        className="checkbox-field"
                                                    />
                                                </td>
                                            )}
                                            {visibleColumns.includes('stt') && (
                                                <td className="px-4 py-3.5 text-center text-zinc-400 font-mono tabular-nums">{absoluteIndex}</td>
                                            )}
                                            {visibleColumns.includes('user') && (
                                                <td className="px-4 py-3.5 text-left font-medium text-zinc-900 dark:text-zinc-100">
                                                    <div className="flex items-center gap-2.5">
                                                        {user.avatar ? (
                                                            <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                                                        ) : (
                                                            <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold text-xs flex items-center justify-center">
                                                                {user.name.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className="font-semibold">{user.name}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.includes('email') && (
                                                <td className="px-4 py-3.5 text-left text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">{user.email}</td>
                                            )}
                                            {visibleColumns.includes('roles') && (
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="flex flex-wrap gap-1 justify-center max-w-xs mx-auto">
                                                        {user.roles.map((role: Role) => (
                                                            <span 
                                                                key={role.id} 
                                                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                                    role.name === 'admin'
                                                                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                                                        : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                                                }`}
                                                            >
                                                                {role.name}
                                                            </span>
                                                        ))}
                                                        {user.roles.length === 0 && (
                                                            <span className="text-[11px] text-zinc-400 italic">Chưa có vai trò</span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.includes('created_at') && (
                                                <td className="px-4 py-3.5 text-center text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">{createdDate}</td>
                                            )}
                                            <td className="px-4 py-3.5 text-center">
                                                {!isSuperAdmin ? (
                                                    <div className="flex gap-1 justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(user)}
                                                            className="p-1.5 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg transition-colors"
                                                            title="Sửa quyền"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedUserIds([user.id]);
                                                                setIsSingleDeleteModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors"
                                                            title="Xóa quyền / tài khoản"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-zinc-400 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 italic">
                                                        Admin gốc
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Server-side Pagination UI */}
                    {users.total > users.per_page && (
                        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-800/40 shrink-0">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                Hiển thị {users.data.length} trên tổng số <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{users.total}</span> người dùng
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                {users.links.map((link: { url: string | null; label: string; active: boolean }, i: number) => (
                                    <Link
                                        key={i}
                                        href={link.url || '#'}
                                        disabled={!link.url}
                                        preserveState
                                        preserveScroll
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                            link.active
                                                ? 'bg-sky-600 text-white'
                                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && editingUser && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                Phân quyền Người dùng
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                             aria-label="Đóng">
                                <X className="w-4 h-4 stroke-[1.5]" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 border border-zinc-200/80 dark:border-zinc-700/80">
                            {editingUser.avatar ? (
                                <img src={editingUser.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                            ) : (
                                <div className="h-9 w-9 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 font-bold text-xs flex items-center justify-center">
                                    {editingUser.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{editingUser.name}</p>
                                <p className="text-[11px] text-zinc-400 font-mono">{editingUser.email}</p>
                            </div>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                                    Chọn các vai trò (Roles)
                                </label>
                                <div className="space-y-1.5 max-h-56 overflow-y-auto p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/40">
                                    {roles.map((role) => (
                                        <label key={role.id} className="flex items-start space-x-2.5 cursor-pointer p-2 rounded-xl hover:bg-white dark:hover:bg-zinc-800 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={data.roles.includes(role.name)}
                                                onChange={() => handleRoleToggle(role.name)}
                                                className="checkbox-field mt-0.5"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {role.name}
                                                </span>
                                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                    {role.description || 'Không có mô tả'}
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                                    Hủy
                                </button>
                                <button type="submit" disabled={processing} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs disabled:opacity-50">
                                    Lưu quyền
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Action Confirm Modal */}
            {isBulkConfirmModalOpen && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="w-5 h-5 stroke-[1.5]" />
                            <span>Xác nhận hành động hàng loạt</span>
                        </h2>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {bulkActionType === 'clear_roles'
                                ? `Bạn có chắc chắn muốn xóa hết vai trò của ${selectedUserIds.length} người dùng đã chọn? (Họ sẽ được khôi phục về quyền khách 'guest')`
                                : `Bạn có chắc chắn muốn xóa hoàn toàn ${selectedUserIds.length} người dùng đã chọn khỏi hệ thống vĩnh viễn?`}
                        </p>
                        <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <button type="button" onClick={() => setIsBulkConfirmModalOpen(false)} className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkActionConfirm}
                                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs ${
                                    bulkActionType === 'clear_roles' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
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
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100 text-rose-600 dark:text-rose-400 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 stroke-[1.5]" />
                                <span>Tùy chọn xóa quyền / tài khoản</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setSelectedUserIds([]);
                                }}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <X className="w-4 h-4 stroke-[1.5]" />
                            </button>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Vui lòng chọn hành động muốn thực hiện cho người dùng này:
                        </p>
                        <div className="flex flex-col gap-2 pt-1 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    router.post('/admin/permissions/bulk', {
                                        user_ids: selectedUserIds,
                                        action: 'clear_roles',
                                    }, {
                                        onSuccess: () => {
                                            setIsSingleDeleteModalOpen(false);
                                            setSelectedUserIds([]);
                                        },
                                    });
                                }}
                                className="w-full text-left p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 transition-colors flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">Xóa sạch vai trò</p>
                                    <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">Khôi phục về nhóm khách mặc định (guest)</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-amber-600" />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setUsersToDelete(selectedUserIds);
                                    setDeletePassword('');
                                    setIsDeleteConfirmOpen(true);
                                }}
                                className="w-full text-left p-3 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-950/30 hover:bg-rose-100/60 transition-colors flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-semibold text-rose-800 dark:text-rose-300">Xóa vĩnh viễn User</p>
                                    <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">Xóa hoàn toàn tài khoản khỏi cơ sở dữ liệu</p>
                                </div>
                                <Trash2 className="w-4 h-4 text-rose-600" />
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
                    router.post('/admin/users/bulk-action', {
                        user_ids: usersToDelete,
                        action: 'delete_users',
                        password: deletePassword,
                    }, {
                        onSuccess: () => {
                            setIsDeleteConfirmOpen(false);
                            setUsersToDelete([]);
                            setDeletePassword('');
                            setDeleteErrorMsg(null);
                            setSelectedUserIds([]);
                        },
                        onError: (err) => {
                            setDeleteErrorMsg(err.password || 'Mật khẩu xác nhận không chính xác.');
                        },
                    });
                }}
            />
        </DashboardLayout>
    );
}
