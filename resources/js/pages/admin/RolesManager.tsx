import { Head, useForm, router } from '@inertiajs/react';
import { 
    Shield, 
    Plus, 
    Pencil, 
    Trash2, 
    Check, 
    Minus, 
    X, 
    ChevronDown, 
    ChevronUp, 
    Lightbulb, 
    Lock
} from 'lucide-react';
import React, { useState } from 'react';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import DashboardLayout from '../../layouts/DashboardLayout';
import type { Page, Permission, Role } from '../../types/admin';

interface Props {
    roles: Role[];
    permissions: Permission[];
    pages: Page[];
}

const PERMISSION_LABEL_DICTIONARY: Record<string, string> = {
    view: 'Xem',
    create: 'Thêm',
    edit: 'Sửa',
    update: 'Cập nhật',
    delete: 'Xóa',
    import: 'Nhập Excel',
    export: 'Xuất Excel',
    cancel_item: 'Hủy món đã gửi bếp kèm lý do',
    cancel: 'Hủy bỏ',
    approve: 'Phê duyệt',
    stocktake: 'Kiểm kê',
};

function formatPermissionLabel(permName: string): string {
    const parts = permName.split('.');
    const actionKey = parts[parts.length - 1] || permName;

    if (PERMISSION_LABEL_DICTIONARY[actionKey]) {
        return PERMISSION_LABEL_DICTIONARY[actionKey];
    }

    return actionKey
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export default function RolesManager({ roles, permissions, pages }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [expandedPages, setExpandedPages] = useState<Record<number, boolean>>({});

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        name: '',
        description: '',
        permissions: [] as string[],
        pages: [] as number[],
    });

    // Fully dynamic permission lookup without hardcoded routes
    const getPagePermissions = (pagePath: string): Permission[] => {
        const segments = pagePath.replace(/^\/+|\/+$/g, '').split('/');
        
        // Match path segments from right to left against available permissions
        for (let i = segments.length - 1; i >= 0; i--) {
            const candidate = segments[i];
            const matching = permissions.filter(p => {
                const parts = p.name.split('.');

                return parts[0] === candidate;
            });

            if (matching.length > 0) {
return matching;
}
        }

        // Exact match fallback
        const exactMatch = pagePath.replace(/^\/+|\/+$/g, '').replace(/\//g, '.');
        const fallback = permissions.filter(p => p.name.startsWith(exactMatch));

        if (fallback.length > 0) {
return fallback;
}

        return [];
    };

    const openCreateModal = () => {
        clearErrors();
        reset();
        setEditingRole(null);
        setExpandedPages({});
        setIsModalOpen(true);
    };

    const openEditModal = (role: Role) => {
        clearErrors();
        const rolePermissions = role.permissions ? role.permissions.map(p => p.name) : [];
        const rolePages = role.pages ? role.pages.map(p => p.id) : [];

        setData({
            name: role.name,
            description: role.description || '',
            permissions: rolePermissions,
            pages: rolePages,
        });
        setEditingRole(role);

        // Auto expand pages that have checked permissions
        const nextExpanded: Record<number, boolean> = {};
        rolePages.forEach(pId => {
            nextExpanded[pId] = true;
        });
        setExpandedPages(nextExpanded);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        reset();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingRole) {
            put(`/admin/roles/${editingRole.id}`, {
                onSuccess: () => closeModal(),
            });
        } else {
            post('/admin/roles', {
                onSuccess: () => closeModal(),
            });
        }
    };

    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const openDeleteModal = (id: number) => {
        setDeleteId(id);
        setDeletePassword('');
        setDeleteErrorMsg(null);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (deleteId) {
            router.delete(`/admin/roles/${deleteId}`, {
                data: { password: deletePassword },
                onSuccess: () => {
                    setIsDeleteModalOpen(false);
                    setDeleteId(null);
                    setDeletePassword('');
                    setDeleteErrorMsg(null);
                },
                onError: (err) => {
                    setDeleteErrorMsg(err.password || 'Mật khẩu xác nhận không chính xác.');
                },
            });
        }
    };

    // Selection state: 0 = Unselected, 1 = View only (-), 2 = All permissions (✓)
    const getPageSelectionState = (page: Page): number => {
        if (editingRole?.name === 'admin') {
return 2;
}

        const pagePerms = getPagePermissions(page.route_path).map(p => p.name);
        const selectedPerms = data.permissions.filter(pName => pagePerms.includes(pName));

        if (pagePerms.length === 0) {
            return data.pages.includes(page.id) ? 2 : 0;
        }

        if (selectedPerms.length === 0) {
            return data.pages.includes(page.id) ? 1 : 0;
        }

        const viewPerm = pagePerms.find(p => p.endsWith('.view'));

        if (viewPerm && selectedPerms.length === 1 && selectedPerms[0] === viewPerm) {
            return 1;
        }

        if (selectedPerms.length === pagePerms.length) {
            return 2;
        }

        return 1;
    };

    const handlePageToggle = (page: Page) => {
        if (editingRole?.name === 'admin') {
return;
}

        const currentState = getPageSelectionState(page);
        const pagePerms = getPagePermissions(page.route_path).map(p => p.name);
        const viewPerm = pagePerms.find(p => p.endsWith('.view'));

        let nextPages = [...data.pages];
        let nextPermissions = data.permissions.filter(pName => !pagePerms.includes(pName));

        if (currentState === 0) {
            // Unselected -> State 1 (View only)
            if (!nextPages.includes(page.id)) {
nextPages.push(page.id);
}

            if (viewPerm) {
nextPermissions.push(viewPerm);
}

            setExpandedPages(prev => ({ ...prev, [page.id]: false }));
        } else if (currentState === 1) {
            // State 1 -> State 2 (All permissions)
            if (!nextPages.includes(page.id)) {
nextPages.push(page.id);
}

            nextPermissions = [...new Set([...nextPermissions, ...pagePerms])];
            setExpandedPages(prev => ({ ...prev, [page.id]: true }));
        } else {
            // State 2 -> State 0 (Unselected)
            nextPages = nextPages.filter(id => id !== page.id);
            setExpandedPages(prev => ({ ...prev, [page.id]: false }));
        }

        setData('pages', nextPages);
        setData('permissions', nextPermissions);
    };

    const handleNestedPermissionToggle = (permissionName: string, page: Page) => {
        if (editingRole?.name === 'admin') {
return;
}

        const currentPermissions = [...data.permissions];
        let nextPermissions = [];

        if (currentPermissions.includes(permissionName)) {
            nextPermissions = currentPermissions.filter(p => p !== permissionName);
        } else {
            nextPermissions = [...currentPermissions, permissionName];
        }

        setData('permissions', nextPermissions);

        // Auto-uncheck page if no permissions for this page remain
        const pagePermissions = getPagePermissions(page.route_path).map(p => p.name);
        const hasAnyPermissionLeft = nextPermissions.some(pName => pagePermissions.includes(pName));

        if (!hasAnyPermissionLeft && data.pages.includes(page.id)) {
            setData('pages', data.pages.filter(id => id !== page.id));
            setExpandedPages(prev => ({ ...prev, [page.id]: false }));
        }
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Nhóm quyền" />

            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden space-y-3">
                {/* Top Control Bar Header */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 shadow-xs shrink-0 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                            <Shield className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Nhóm quyền & Phân vai trò
                                </h1>
                                <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums">
                                    {roles.length} vai trò
                                </span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Cấu hình phân quyền chi tiết cho từng vai trò trên từng chức năng và trang hệ thống
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-[2]" />
                        <span>Tạo Role mới</span>
                    </button>
                </div>

                {/* Roles Table Panel */}
                <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-0">
                    <div className="overflow-auto flex-1 min-h-0">
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 border-b border-zinc-200/80 dark:border-zinc-800">
                                <tr className="text-zinc-600 dark:text-zinc-400 font-semibold text-xs text-center">
                                    <th className="px-4 py-3 text-left">Tên vai trò (Role)</th>
                                    <th className="px-4 py-3 text-left">Mô tả chức trách</th>
                                    <th className="px-4 py-3 text-center">Loại vai trò</th>
                                    <th className="px-4 py-3 text-center">Số quyền được cấp</th>
                                    <th className="px-4 py-3 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {roles.map((role) => (
                                    <tr key={role.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                                        <td className="px-4 py-3.5 text-left font-bold text-sky-700 dark:text-sky-400">
                                            {role.name}
                                        </td>
                                        <td className="px-4 py-3.5 text-left text-zinc-600 dark:text-zinc-300">
                                            {role.description || '—'}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {role.is_system ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                                    <Lock className="w-3 h-3" />
                                                    <span>Hệ thống</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                    Tùy chỉnh
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 tabular-nums">
                                                {role.permissions ? role.permissions.length : 0} quyền
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditModal(role)}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg transition-colors"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                    <span>Phân quyền</span>
                                                </button>
                                                {!role.is_system && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openDeleteModal(role.id)}
                                                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        <span>Xóa</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                {editingRole ? `Phân quyền Vai trò: ${editingRole.name}` : 'Tạo Vai trò mới'}
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                             aria-label="Đóng">
                                <X className="w-4 h-4 stroke-[1.5]" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Tên Role mã hóa
                                    </label>
                                    <input
                                        type="text"
                                        value={data.name}
                                        onChange={(e) => setData('name', e.target.value)}
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-mono disabled:opacity-60"
                                        disabled={editingRole?.is_system}
                                        placeholder="VD: cashier, warehouse"
                                        required
                                    />
                                    {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Mô tả vai trò
                                    </label>
                                    <input
                                        type="text"
                                        value={data.description}
                                        onChange={(e) => setData('description', e.target.value)}
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500"
                                        placeholder="VD: Nhân viên thu ngân và bán hàng"
                                    />
                                    {errors.description && <p className="text-xs text-rose-500 mt-1">{errors.description}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                                    Quyền truy cập trang & Chức năng chi tiết
                                </label>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2.5 flex items-center gap-1.5 flex-wrap">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 stroke-[1.5] shrink-0" />
                                    <span><b>Quy trình chọn 3 trạng thái</b>: Bấm 1 lần ➜ Chỉ Xem (hiện dấu <b>-</b>) &bull; Bấm lần 2 ➜ Tất cả quyền (hiện dấu <b>✓</b>) &bull; Bấm lần 3 ➜ Hủy chọn.</span>
                                </p>

                                <div className="space-y-3 max-h-[360px] overflow-y-auto p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-800/40">
                                    {Object.entries(
                                        pages.reduce((acc, page) => {
                                            if (!acc[page.group_name]) {
acc[page.group_name] = [];
}

                                            acc[page.group_name].push(page);

                                            return acc;
                                        }, {} as Record<string, Page[]>)
                                    ).map(([groupName, groupPages]) => {
                                        const isGroupAllSelected = groupPages.every(p => getPageSelectionState(p) === 2) && editingRole?.name !== 'admin';
                                        
                                        const handleGroupToggle = () => {
                                            if (editingRole?.name === 'admin') {
return;
}

                                            const groupPageIds = groupPages.map(p => p.id);

                                            if (isGroupAllSelected) {
                                                setData('pages', data.pages.filter(id => !groupPageIds.includes(id)));
                                                const allGroupPerms = groupPages.flatMap(p => getPagePermissions(p.route_path).map(pm => pm.name));
                                                setData('permissions', data.permissions.filter(pName => !allGroupPerms.includes(pName)));
                                                setExpandedPages(prev => {
                                                    const next = { ...prev };
                                                    groupPageIds.forEach(id => {
 next[id] = false; 
});

                                                    return next;
                                                });
                                            } else {
                                                const nextPages = [...new Set([...data.pages, ...groupPageIds])];
                                                const allGroupPerms = groupPages.flatMap(p => getPagePermissions(p.route_path).map(pm => pm.name));
                                                const nextPermissions = [...new Set([...data.permissions, ...allGroupPerms])];
                                                const newExpanded = { ...expandedPages };
                                                groupPages.forEach(p => {
 newExpanded[p.id] = true; 
});

                                                setData('pages', nextPages);
                                                setData('permissions', nextPermissions);
                                                setExpandedPages(newExpanded);
                                            }
                                        };

                                        return (
                                            <div key={groupName} className="space-y-2 pb-2.5 border-b border-zinc-200/60 dark:border-zinc-700/60 last:border-b-0">
                                                <label className="flex items-center space-x-2 cursor-pointer font-bold text-xs uppercase tracking-wider text-sky-700 dark:text-sky-400 select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={isGroupAllSelected || editingRole?.name === 'admin'}
                                                        disabled={editingRole?.name === 'admin'}
                                                        onChange={handleGroupToggle}
                                                        className="checkbox-field"
                                                    />
                                                    <span>{groupName}</span>
                                                </label>
                                                <div className="pl-4 space-y-2">
                                                    {groupPages.map((page) => {
                                                        const selectionState = getPageSelectionState(page);
                                                        const isExpanded = !!expandedPages[page.id] && selectionState > 0;
                                                        const pagePerms = getPagePermissions(page.route_path);

                                                        return (
                                                            <div key={page.id} className="space-y-1.5">
                                                                <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
                                                                    <div
                                                                        onClick={() => handlePageToggle(page)}
                                                                        className="flex items-center space-x-2.5 cursor-pointer flex-1 select-none"
                                                                    >
                                                                        {/* 3-State Custom Interactive Checkbox Icon */}
                                                                        <div className="shrink-0">
                                                                            {selectionState === 0 ? (
                                                                                <div className="w-4 h-4 border-2 border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 transition-colors" />
                                                                            ) : selectionState === 1 ? (
                                                                                <div className="w-4 h-4 rounded-md bg-sky-600 text-white flex items-center justify-center shadow-xs">
                                                                                    <Minus className="w-3 h-3 stroke-[3]" />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="w-4 h-4 rounded-md bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                                                            {page.name}
                                                                        </span>
                                                                        {selectionState === 1 && (
                                                                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                                                                Chỉ xem
                                                                            </span>
                                                                        )}
                                                                        {selectionState === 2 && (
                                                                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                                                Tất cả quyền
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {pagePerms.length > 0 && selectionState > 0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setExpandedPages(prev => ({ ...prev, [page.id]: !prev[page.id] }))}
                                                                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronUp className="w-3.5 h-3.5" />
                                                                            ) : (
                                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Nested Collapsible Panel */}
                                                                {isExpanded && pagePerms.length > 0 && (
                                                                    <div className="pl-4 py-1 border-l-2 border-sky-500 dark:border-sky-400 ml-3 space-y-1.5">
                                                                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Chức năng trang:</div>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {pagePerms.map((perm) => {
                                                                                const friendlyLabel = formatPermissionLabel(perm.name);

                                                                                return (
                                                                                    <label key={perm.id} className="flex items-center space-x-1.5 cursor-pointer bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs text-[11px] select-none">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={data.permissions.includes(perm.name) || editingRole?.name === 'admin'}
                                                                                            onChange={() => handleNestedPermissionToggle(perm.name, page)}
                                                                                            disabled={editingRole?.name === 'admin'}
                                                                                            className="checkbox-field h-3.5 w-3.5"
                                                                                        />
                                                                                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                                                                                            {friendlyLabel}
                                                                                        </span>
                                                                                    </label>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                                    Hủy
                                </button>
                                <button type="submit" disabled={processing} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs disabled:opacity-50">
                                    {editingRole ? 'Lưu thay đổi' : 'Tạo mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={isDeleteModalOpen}
                title="Xác nhận xóa nhóm quyền"
                description="CẢNH BÁO: Hành động này không thể hoàn tác và sẽ ảnh hưởng trực tiếp tới quyền hạn của tất cả người dùng thuộc nhóm này. Vui lòng nhập mật khẩu để xác nhận."
                passwordValue={deletePassword}
                onPasswordChange={(val) => {
                    setDeletePassword(val);
                    setDeleteErrorMsg(null);
                }}
                errorMsg={deleteErrorMsg}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setDeletePassword('');
                    setDeleteErrorMsg(null);
                }}
                onConfirm={confirmDelete}
            />
        </DashboardLayout>
    );
}
