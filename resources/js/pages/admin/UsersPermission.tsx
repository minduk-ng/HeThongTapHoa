import { Head, useForm, router, Link } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Role, AdminUser as User, PaginatedUsers } from '../../types/admin';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';

interface Props {
    users: PaginatedUsers;
    roles: Role[];
    filters: {
        search: string | null;
        role: string | null;
    };
}

export default function UsersPermission({ users, roles, filters }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Search and Filter states
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [roleFilter, setRoleFilter] = useState(filters.role || '');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(['stt', 'user', 'email', 'roles', 'created_at']);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);

    // Bulk action states
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [isBulkConfirmModalOpen, setIsBulkConfirmModalOpen] = useState(false);
    const [bulkActionType, setBulkActionType] = useState<'clear_roles' | 'delete_users' | null>(null);
    const [isBulkRoleAssignOpen, setIsBulkRoleAssignOpen] = useState(false);
    const [bulkSelectedRoles, setBulkSelectedRoles] = useState<string[]>([]);

    const [deletePassword, setDeletePassword] = useState('');
    const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [usersToDelete, setUsersToDelete] = useState<number[]>([]);

    const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            router.get('/admin/permissions', {
                search: searchQuery,
                role: roleFilter
            }, {
                preserveState: true,
                replace: true
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, roleFilter]);

    const { data, setData, put, processing, reset } = useForm({
        roles: [] as string[],
    });

    const openEditModal = (user: User) => {
        if (user.roles.some(r => r.name === 'admin')) return; // Cannot edit super admin
        
        setData({
            roles: user.roles.map(r => r.name),
        });
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        reset();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingUser) {
            put(`/admin/permissions/${editingUser.id}`, {
                onSuccess: () => closeModal(),
            });
        }
    };

    const handleRoleToggle = (roleName: string) => {
        const currentRoles = [...data.roles];
        if (currentRoles.includes(roleName)) {
            setData('roles', currentRoles.filter(r => r !== roleName));
        } else {
            setData('roles', [...currentRoles, roleName]);
        }
    };

    const paginatedUsers = users.data;

    // Page-scoped select users
    const pageSelectableUsers = paginatedUsers.filter(u => !u.roles.some(r => r.name === 'admin'));
    const isAllOnPageSelected = pageSelectableUsers.length > 0 && pageSelectableUsers.every(u => selectedUserIds.includes(u.id));

    // Bulk helper functions
    const handleSelectAllOnPage = (checked: boolean) => {
        const pageUserIds = pageSelectableUsers.map(u => u.id);
        if (checked) {
            setSelectedUserIds(prev => [...new Set([...prev, ...pageUserIds])]);
        } else {
            setSelectedUserIds(prev => prev.filter(id => !pageUserIds.includes(id)));
        }
    };

    const handleSelectUser = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedUserIds([...selectedUserIds, id]);
        } else {
            setSelectedUserIds(selectedUserIds.filter(x => x !== id));
        }
    };

    const handleBulkRoleAssign = (roleNames: string[]) => {
        if (selectedUserIds.length === 0 || roleNames.length === 0) return;
        
        router.post('/admin/permissions/bulk', {
            user_ids: selectedUserIds,
            action: 'assign_role',
            role_names: roleNames
        }, {
            onSuccess: () => {
                setSelectedUserIds([]);
                setBulkSelectedRoles([]);
            }
        });
    };

    const handleBulkActionConfirm = () => {
        if (selectedUserIds.length === 0 || !bulkActionType) return;

        if (bulkActionType === 'delete_users') {
            setIsBulkConfirmModalOpen(false);
            setUsersToDelete(selectedUserIds);
            setDeletePassword('');
            setIsDeleteConfirmOpen(true);
        } else {
            router.post('/admin/permissions/bulk', {
                user_ids: selectedUserIds,
                action: bulkActionType
            }, {
                onSuccess: () => {
                    setIsBulkConfirmModalOpen(false);
                    setSelectedUserIds([]);
                    setBulkActionType(null);
                }
            });
        }
    };

    const triggerBulkAction = (action: 'clear_roles' | 'delete_users') => {
        if (selectedUserIds.length === 0) return;
        setBulkActionType(action);
        setIsBulkConfirmModalOpen(true);
    };

    return (
        <DashboardLayout>
            <Head title="Phân quyền Người dùng" />

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="page-heading">Phân quyền User</h1>
                    <p className="page-subtitle">
                        Gán nhóm quyền cho từng người dùng trong hệ thống
                    </p>
                </div>
                <button
                    onClick={() => {
                        setIsBulkMode(!isBulkMode);
                        setSelectedUserIds([]);
                    }}
                    className={`btn-secondary inline-flex items-center gap-2 font-medium transition-colors ${
                        isBulkMode ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 border-indigo-200' : ''
                    }`}
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    {isBulkMode ? 'Tắt Chỉnh Sửa Nhóm' : 'Chỉnh Sửa Nhóm'}
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 mb-6 shadow-sm">
                <div className="flex flex-1 min-w-[240px] items-center gap-3">
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm theo tên hoặc email..."
                            className="input-field pl-9"
                        />
                    </div>
                    
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="input-field max-w-[200px]"
                    >
                        <option value="">Tất cả vai trò</option>
                        {roles.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                    </select>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                        Hiển thị cột
                    </button>
                    
                    {isColumnsDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 py-2 z-30">
                            {[
                                { key: 'stt', label: 'STT' },
                                { key: 'user', label: 'Người dùng' },
                                { key: 'email', label: 'Email' },
                                { key: 'roles', label: 'Nhóm quyền' },
                                { key: 'created_at', label: 'Ngày tạo' }
                            ].map(col => (
                                <label key={col.key} className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer select-none">
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
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {col.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bulk Action Bar */}
            {isBulkMode && (
                <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30 mb-6 shadow-sm">
                    <div className="text-sm text-indigo-800 dark:text-indigo-300 font-semibold">
                        Đã chọn <span className="font-mono">{selectedUserIds.length}</span> người dùng
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Gán quyền nhanh popover trigger */}
                        <div className="relative">
                            <button
                                disabled={selectedUserIds.length === 0}
                                onClick={() => {
                                    setIsBulkRoleAssignOpen(!isBulkRoleAssignOpen);
                                    setBulkSelectedRoles([]);
                                }}
                                className="btn-secondary py-2 text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                                Gán nhóm quyền nhanh
                            </button>
                            
                            {isBulkRoleAssignOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 p-4 z-30 space-y-3">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Chọn các vai trò:
                                    </p>
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center space-x-3 cursor-pointer select-none">
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
                                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                                    {r.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-700 justify-end">
                                        <button
                                            onClick={() => {
                                                setIsBulkRoleAssignOpen(false);
                                                setBulkSelectedRoles([]);
                                            }}
                                            className="btn-secondary py-1 text-xs"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleBulkRoleAssign(bulkSelectedRoles);
                                                setIsBulkRoleAssignOpen(false);
                                            }}
                                            disabled={bulkSelectedRoles.length === 0}
                                            className="btn-primary py-1 text-xs w-auto px-3 font-semibold"
                                        >
                                            Lưu
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            disabled={selectedUserIds.length === 0}
                            onClick={() => triggerBulkAction('clear_roles')}
                            className="btn-secondary py-2 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900/50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Xóa Quyền (Về Guest)
                        </button>
                        
                        <button
                            disabled={selectedUserIds.length === 0}
                            onClick={() => triggerBulkAction('delete_users')}
                            className="btn-secondary py-2 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Xóa User khỏi DB
                        </button>
                    </div>
                </div>
            )}

            <div className="card-panel">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr className="text-center">
                                {isBulkMode && (
                                    <th className="w-12 text-center">
                                        <input
                                            type="checkbox"
                                            checked={isAllOnPageSelected}
                                            onChange={(e) => handleSelectAllOnPage(e.target.checked)}
                                            className="checkbox-field h-5 w-5 cursor-pointer"
                                        />
                                    </th>
                                )}
                                {visibleColumns.includes('stt') && <th className="text-center">STT</th>}
                                {visibleColumns.includes('user') && <th className="text-center">Người dùng</th>}
                                {visibleColumns.includes('email') && <th className="text-center">Email</th>}
                                {visibleColumns.includes('roles') && <th className="text-center">Nhóm quyền (Roles)</th>}
                                {visibleColumns.includes('created_at') && <th className="text-center">Ngày tạo</th>}
                                <th className="text-center">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="table-body">
                            {paginatedUsers.map((user, index) => {
                                const isSuperAdmin = user.roles.some(r => r.name === 'admin');
                                const createdDate = user.created_at ? user.created_at.split('T')[0] : 'N/A';
                                const absoluteIndex = (users.current_page - 1) * users.per_page + index + 1;
                                
                                return (
                                    <tr 
                                        key={user.id} 
                                        onClick={(e) => {
                                            const target = e.target as HTMLElement;
                                            if (isSuperAdmin) return;
                                            if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('select')) {
                                                return;
                                            }
                                            if (isBulkMode) {
                                                handleSelectUser(user.id, !selectedUserIds.includes(user.id));
                                            }
                                        }}
                                        className={`data-table-row ${isBulkMode && !isSuperAdmin ? 'cursor-pointer select-none' : ''}`}
                                    >
                                        {isBulkMode && (
                                            <td className="text-center">
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
                                            <td className="text-center text-gray-500 dark:text-gray-400 font-mono text-sm">{absoluteIndex}</td>
                                        )}
                                        {visibleColumns.includes('user') && (
                                            <td className="text-left font-medium text-gray-900 dark:text-gray-100">
                                                <div className="flex items-center gap-3">
                                                    {user.avatar ? (
                                                        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="avatar-placeholder h-8 w-8 font-bold text-xs">
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    {user.name}
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.includes('email') && (
                                            <td className="text-left text-gray-500 dark:text-gray-400">{user.email}</td>
                                        )}
                                        {visibleColumns.includes('roles') && (
                                            <td className="text-center">
                                                <div className="flex flex-wrap gap-1 justify-center max-w-xs mx-auto">
                                                    {user.roles.map((role) => (
                                                        <span 
                                                            key={role.id} 
                                                            className={`badge ${role.name === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'}`}
                                                        >
                                                            {role.name}
                                                        </span>
                                                    ))}
                                                    {user.roles.length === 0 && (
                                                        <span className="text-sm text-gray-400 italic">Chưa có quyền</span>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.includes('created_at') && (
                                            <td className="text-center text-gray-500 dark:text-gray-400 font-mono text-sm">{createdDate}</td>
                                        )}
                                        <td className="text-center">
                                            {!isSuperAdmin ? (
                                                <div className="flex gap-2 justify-center">
                                                    <button onClick={() => openEditModal(user)} className="btn-sm btn-edit">
                                                        Sửa quyền
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUserIds([user.id]);
                                                            setIsSingleDeleteModalOpen(true);
                                                        }}
                                                        className="btn-sm btn-delete"
                                                    >
                                                        Xóa
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400 px-2 py-1 italic">Admin gốc</span>
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
                    <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-700/50 px-6 py-4 bg-gray-50/50 dark:bg-slate-800/30">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Hiển thị {users.data.length} trên tổng số <span className="font-semibold text-gray-700 dark:text-gray-200">{users.total}</span> người dùng
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {users.links.map((link, i) => (
                                <Link
                                    key={i}
                                    href={link.url || '#'}
                                    disabled={!link.url}
                                    preserveState
                                    preserveScroll
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                        link.active
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'btn-secondary disabled:opacity-40'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Form */}
            {isModalOpen && editingUser && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-lg">
                        <h2 className="modal-heading mb-2">
                            Phân quyền cho User
                        </h2>
                        <div className="mb-6 flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-800/50">
                            {editingUser.avatar ? (
                                <img src={editingUser.avatar} alt="" className="h-10 w-10 rounded-full" />
                            ) : (
                                <div className="avatar-placeholder h-10 w-10">
                                    {editingUser.name.charAt(0)}
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-gray-200">{editingUser.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{editingUser.email}</p>
                            </div>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="form-label mb-3">Chọn Nhóm quyền</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto p-4 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50">
                                    {roles.map((role) => (
                                        <label key={role.id} className="flex items-start space-x-3 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                                            <div className="flex items-center h-5">
                                                <input
                                                    type="checkbox"
                                                    checked={data.roles.includes(role.name)}
                                                    onChange={() => handleRoleToggle(role.name)}
                                                    className="checkbox-field dark:bg-slate-900"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {role.name}
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {role.description || 'Không có mô tả'}
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn-secondary">
                                    Hủy
                                </button>
                                <button type="submit" disabled={processing} className="btn-primary w-auto font-semibold">
                                    Lưu quyền
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Action Confirm Modal */}
            {isBulkConfirmModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-md">
                        <h2 className="modal-heading text-red-600 dark:text-red-400">
                            Xác nhận hành động hàng loạt
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {bulkActionType === 'clear_roles'
                                ? `Bạn có chắc chắn muốn xóa hết vai trò của ${selectedUserIds.length} người dùng đã chọn? (Họ sẽ được khôi phục về quyền khách 'guest')`
                                : `Bạn có chắc chắn muốn xóa hoàn toàn ${selectedUserIds.length} người dùng đã chọn khỏi hệ thống vĩnh viễn?`}
                        </p>
                        <div className="modal-footer">
                            <button type="button" onClick={() => setIsBulkConfirmModalOpen(false)} className="btn-secondary">
                                Hủy
                            </button>
                            <button
                                onClick={handleBulkActionConfirm}
                                className={`btn-primary w-auto font-semibold ${bulkActionType === 'clear_roles' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Delete Confirm Modal */}
            {isSingleDeleteModalOpen && selectedUserIds.length === 1 && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-md">
                        <h2 className="modal-heading text-red-600 dark:text-red-400">
                            Xác nhận xóa quyền / tài khoản
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Vui lòng chọn hành động muốn thực hiện cho người dùng này:
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => {
                                    router.post('/admin/permissions/bulk', {
                                        user_ids: selectedUserIds,
                                        action: 'clear_roles'
                                    }, {
                                        onSuccess: () => {
                                            setIsSingleDeleteModalOpen(false);
                                            setSelectedUserIds([]);
                                        }
                                    });
                                }}
                                className="btn-secondary w-full text-left py-3 px-4 hover:bg-amber-50 dark:hover:bg-slate-700/50 flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">Xóa sạch vai trò</p>
                                    <p className="text-xs text-gray-400">Khôi phục về nhóm khách mặc định (guest)</p>
                                </div>
                                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            <button
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setUsersToDelete(selectedUserIds);
                                    setDeletePassword('');
                                    setIsDeleteConfirmOpen(true);
                                }}
                                className="btn-secondary w-full text-left py-3 px-4 hover:bg-red-50 dark:hover:bg-slate-700/50 flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-semibold text-sm text-red-700 dark:text-red-400">Xóa hoàn toàn User</p>
                                    <p className="text-xs text-gray-400">Xóa vĩnh viễn tài khoản khỏi cơ sở dữ liệu</p>
                                </div>
                                <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsSingleDeleteModalOpen(false);
                                    setSelectedUserIds([]);
                                }}
                                className="btn-secondary w-full py-2.5 mt-2 bg-gray-50 border-gray-200"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={isDeleteConfirmOpen}
                title="Xác nhận xóa tài khoản"
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
                        password: deletePassword
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
                        }
                    });
                }}
            />
        </DashboardLayout>
    );
}
