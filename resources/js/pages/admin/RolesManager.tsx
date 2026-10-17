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
    Lock,
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
    run: 'Chạy dự báo',
    configure: 'Cấu hình tham số',
    apply_model: 'Áp dụng mô hình',
    procurement_review: 'Duyệt đề xuất nhập hàng',
    experiments: 'Dữ liệu thử nghiệm',
    'planning.view': 'Xem dự báo & kế hoạch',
    'planning.run': 'Chạy tính toán dự báo',
    'planning.configure': 'Cấu hình tham số dự báo',
    'planning.apply_model': 'Áp dụng mô hình dự báo',
    'planning.procurement_review': 'Duyệt kế hoạch nhập hàng',
    'planning.experiments': 'Quản lý dữ liệu thử nghiệm',
    'kitchen.dispatch.manage': 'Quản lý hạn điều phối',
};

function formatPermissionLabel(permName: string): string {
    if (PERMISSION_LABEL_DICTIONARY[permName]) {
        return PERMISSION_LABEL_DICTIONARY[permName];
    }

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
    const [expandedPages, setExpandedPages] = useState<Record<number, boolean>>(
        {},
    );

    const { data, setData, post, put, processing, errors, reset, clearErrors } =
        useForm({
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
            const matching = permissions.filter((p) => {
                const parts = p.name.split('.');

                return parts[0] === candidate;
            });

            if (matching.length > 0) {
                return matching;
            }
        }

        // Exact match fallback
        const exactMatch = pagePath
            .replace(/^\/+|\/+$/g, '')
            .replace(/\//g, '.');
        const fallback = permissions.filter((p) =>
            p.name.startsWith(exactMatch),
        );

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
        const rolePermissions = role.permissions
            ? role.permissions.map((p) => p.name)
            : [];
        const rolePages = role.pages ? role.pages.map((p) => p.id) : [];

        setData({
            name: role.name,
            description: role.description || '',
            permissions: rolePermissions,
            pages: rolePages,
        });
        setEditingRole(role);

        // Auto expand pages that have checked permissions
        const nextExpanded: Record<number, boolean> = {};
        rolePages.forEach((pId) => {
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
                    setDeleteErrorMsg(
                        err.password || 'Mật khẩu xác nhận không chính xác.',
                    );
                },
            });
        }
    };

    // Selection state: 0 = Unselected, 1 = View only (-), 2 = All permissions (✓)
    const getPageSelectionState = (page: Page): number => {
        if (editingRole?.name === 'admin') {
            return 2;
        }

        const pagePerms = getPagePermissions(page.route_path).map(
            (p) => p.name,
        );
        const selectedPerms = data.permissions.filter((pName) =>
            pagePerms.includes(pName),
        );

        if (pagePerms.length === 0) {
            return data.pages.includes(page.id) ? 2 : 0;
        }

        if (selectedPerms.length === 0) {
            return data.pages.includes(page.id) ? 1 : 0;
        }

        const viewPerm = pagePerms.find((p) => p.endsWith('.view'));

        if (
            viewPerm &&
            selectedPerms.length === 1 &&
            selectedPerms[0] === viewPerm
        ) {
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
        const pagePerms = getPagePermissions(page.route_path).map(
            (p) => p.name,
        );
        const viewPerm = pagePerms.find((p) => p.endsWith('.view'));

        let nextPages = [...data.pages];
        let nextPermissions = data.permissions.filter(
            (pName) => !pagePerms.includes(pName),
        );

        if (currentState === 0) {
            // Unselected -> State 1 (View only)
            if (!nextPages.includes(page.id)) {
                nextPages.push(page.id);
            }

            if (viewPerm) {
                nextPermissions.push(viewPerm);
            }

            setExpandedPages((prev) => ({ ...prev, [page.id]: false }));
        } else if (currentState === 1) {
            // State 1 -> State 2 (All permissions)
            if (!nextPages.includes(page.id)) {
                nextPages.push(page.id);
            }

            nextPermissions = [...new Set([...nextPermissions, ...pagePerms])];
            setExpandedPages((prev) => ({ ...prev, [page.id]: true }));
        } else {
            // State 2 -> State 0 (Unselected)
            nextPages = nextPages.filter((id) => id !== page.id);
            setExpandedPages((prev) => ({ ...prev, [page.id]: false }));
        }

        setData('pages', nextPages);
        setData('permissions', nextPermissions);
    };

    const handleNestedPermissionToggle = (
        permissionName: string,
        page: Page,
    ) => {
        if (editingRole?.name === 'admin') {
            return;
        }

        const currentPermissions = [...data.permissions];
        let nextPermissions = [];

        if (currentPermissions.includes(permissionName)) {
            nextPermissions = currentPermissions.filter(
                (p) => p !== permissionName,
            );
        } else {
            nextPermissions = [...currentPermissions, permissionName];
        }

        setData('permissions', nextPermissions);

        // Auto-uncheck page if no permissions for this page remain
        const pagePermissions = getPagePermissions(page.route_path).map(
            (p) => p.name,
        );
        const hasAnyPermissionLeft = nextPermissions.some((pName) =>
            pagePermissions.includes(pName),
        );

        if (!hasAnyPermissionLeft && data.pages.includes(page.id)) {
            setData(
                'pages',
                data.pages.filter((id) => id !== page.id),
            );
            setExpandedPages((prev) => ({ ...prev, [page.id]: false }));
        }
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Nhóm quyền" />

            <div className="flex h-full min-h-0 w-full flex-1 flex-col space-y-3 overflow-hidden">
                {/* Top Control Bar Header */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                            <Shield className="h-5 w-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Nhóm quyền & Phân vai trò
                                </h1>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
                                    {roles.length} vai trò
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Cấu hình phân quyền chi tiết cho từng vai trò
                                trên từng chức năng và trang hệ thống
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-[2]" />
                        <span>Tạo Role mới</span>
                    </button>
                </div>

                {/* Roles Table Panel */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/90">
                                <tr className="text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    <th className="px-4 py-3 text-left">
                                        Tên vai trò (Role)
                                    </th>
                                    <th className="px-4 py-3 text-left">
                                        Mô tả chức trách
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                        Loại vai trò
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                        Số quyền được cấp
                                    </th>
                                    <th className="px-4 py-3 text-center">
                                        Thao tác
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {roles.map((role) => (
                                    <tr
                                        key={role.id}
                                        className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                                    >
                                        <td className="px-4 py-3.5 text-left font-bold text-sky-700 dark:text-sky-400">
                                            {role.name}
                                        </td>
                                        <td className="px-4 py-3.5 text-left text-zinc-600 dark:text-zinc-300">
                                            {role.description || '—'}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {role.is_system ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/60 dark:text-rose-300">
                                                    <Lock className="h-3 w-3" />
                                                    <span>Hệ thống</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                    Tùy chỉnh
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 tabular-nums dark:border-sky-800/60 dark:bg-sky-950/60 dark:text-sky-300">
                                                {role.permissions
                                                    ? role.permissions.length
                                                    : 0}{' '}
                                                quyền
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openEditModal(role)
                                                    }
                                                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 hover:text-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/60"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    <span>Phân quyền</span>
                                                </button>
                                                {!role.is_system && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            openDeleteModal(
                                                                role.id,
                                                            )
                                                        }
                                                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/60"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
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
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                {editingRole
                                    ? `Phân quyền Vai trò: ${editingRole.name}`
                                    : 'Tạo Vai trò mới'}
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

                        <form
                            onSubmit={handleSubmit}
                            className="space-y-4 text-xs"
                        >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                        Tên Role mã hóa
                                    </label>
                                    <input
                                        type="text"
                                        value={data.name}
                                        onChange={(e) =>
                                            setData('name', e.target.value)
                                        }
                                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 focus:border-sky-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                        disabled={editingRole?.is_system}
                                        placeholder="VD: cashier, warehouse"
                                        required
                                    />
                                    {errors.name && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.name}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                        Mô tả vai trò
                                    </label>
                                    <input
                                        type="text"
                                        value={data.description}
                                        onChange={(e) =>
                                            setData(
                                                'description',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                        placeholder="VD: Nhân viên thu ngân và bán hàng"
                                    />
                                    {errors.description && (
                                        <p className="mt-1 text-xs text-rose-500">
                                            {errors.description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                    Quyền truy cập trang & Chức năng chi tiết
                                </label>
                                <p className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <Lightbulb className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-amber-500" />
                                    <span>
                                        <b>Quy trình chọn 3 trạng thái</b>: Bấm
                                        1 lần ➜ Chỉ Xem (hiện dấu <b>-</b>)
                                        &bull; Bấm lần 2 ➜ Tất cả quyền (hiện
                                        dấu <b>✓</b>) &bull; Bấm lần 3 ➜ Hủy
                                        chọn.
                                    </span>
                                </p>

                                <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5 dark:border-zinc-700/80 dark:bg-zinc-800/40">
                                    {Object.entries(
                                        pages.reduce(
                                            (acc, page) => {
                                                if (!acc[page.group_name]) {
                                                    acc[page.group_name] = [];
                                                }

                                                acc[page.group_name].push(page);

                                                return acc;
                                            },
                                            {} as Record<string, Page[]>,
                                        ),
                                    ).map(([groupName, groupPages]) => {
                                        const isGroupAllSelected =
                                            groupPages.every(
                                                (p) =>
                                                    getPageSelectionState(p) ===
                                                    2,
                                            ) && editingRole?.name !== 'admin';

                                        const handleGroupToggle = () => {
                                            if (editingRole?.name === 'admin') {
                                                return;
                                            }

                                            const groupPageIds = groupPages.map(
                                                (p) => p.id,
                                            );

                                            if (isGroupAllSelected) {
                                                setData(
                                                    'pages',
                                                    data.pages.filter(
                                                        (id) =>
                                                            !groupPageIds.includes(
                                                                id,
                                                            ),
                                                    ),
                                                );
                                                const allGroupPerms =
                                                    groupPages.flatMap((p) =>
                                                        getPagePermissions(
                                                            p.route_path,
                                                        ).map((pm) => pm.name),
                                                    );
                                                setData(
                                                    'permissions',
                                                    data.permissions.filter(
                                                        (pName) =>
                                                            !allGroupPerms.includes(
                                                                pName,
                                                            ),
                                                    ),
                                                );
                                                setExpandedPages((prev) => {
                                                    const next = { ...prev };
                                                    groupPageIds.forEach(
                                                        (id) => {
                                                            next[id] = false;
                                                        },
                                                    );

                                                    return next;
                                                });
                                            } else {
                                                const nextPages = [
                                                    ...new Set([
                                                        ...data.pages,
                                                        ...groupPageIds,
                                                    ]),
                                                ];
                                                const allGroupPerms =
                                                    groupPages.flatMap((p) =>
                                                        getPagePermissions(
                                                            p.route_path,
                                                        ).map((pm) => pm.name),
                                                    );
                                                const nextPermissions = [
                                                    ...new Set([
                                                        ...data.permissions,
                                                        ...allGroupPerms,
                                                    ]),
                                                ];
                                                const newExpanded = {
                                                    ...expandedPages,
                                                };
                                                groupPages.forEach((p) => {
                                                    newExpanded[p.id] = true;
                                                });

                                                setData('pages', nextPages);
                                                setData(
                                                    'permissions',
                                                    nextPermissions,
                                                );
                                                setExpandedPages(newExpanded);
                                            }
                                        };

                                        return (
                                            <div
                                                key={groupName}
                                                className="space-y-2 border-b border-zinc-200/60 pb-2.5 last:border-b-0 dark:border-zinc-700/60"
                                            >
                                                <label className="flex cursor-pointer items-center space-x-2 text-xs font-bold tracking-wider text-sky-700 uppercase select-none dark:text-sky-400">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            isGroupAllSelected ||
                                                            editingRole?.name ===
                                                                'admin'
                                                        }
                                                        disabled={
                                                            editingRole?.name ===
                                                            'admin'
                                                        }
                                                        onChange={
                                                            handleGroupToggle
                                                        }
                                                        className="checkbox-field"
                                                    />
                                                    <span>{groupName}</span>
                                                </label>
                                                <div className="space-y-2 pl-4">
                                                    {groupPages.map((page) => {
                                                        const selectionState =
                                                            getPageSelectionState(
                                                                page,
                                                            );
                                                        const isExpanded =
                                                            !!expandedPages[
                                                                page.id
                                                            ] &&
                                                            selectionState > 0;
                                                        const pagePerms =
                                                            getPagePermissions(
                                                                page.route_path,
                                                            );

                                                        return (
                                                            <div
                                                                key={page.id}
                                                                className="space-y-1.5"
                                                            >
                                                                <div className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-white p-2 dark:border-zinc-700/60 dark:bg-zinc-800">
                                                                    <div
                                                                        onClick={() =>
                                                                            handlePageToggle(
                                                                                page,
                                                                            )
                                                                        }
                                                                        className="flex flex-1 cursor-pointer items-center space-x-2.5 select-none"
                                                                    >
                                                                        {/* 3-State Custom Interactive Checkbox Icon */}
                                                                        <div className="shrink-0">
                                                                            {selectionState ===
                                                                            0 ? (
                                                                                <div className="h-4 w-4 rounded-md border-2 border-zinc-300 bg-white transition-colors dark:border-zinc-600 dark:bg-zinc-700" />
                                                                            ) : selectionState ===
                                                                              1 ? (
                                                                                <div className="flex h-4 w-4 items-center justify-center rounded-md bg-sky-600 text-white shadow-xs">
                                                                                    <Minus className="h-3 w-3 stroke-[3]" />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex h-4 w-4 items-center justify-center rounded-md bg-emerald-600 text-white shadow-xs">
                                                                                    <Check className="h-3 w-3 stroke-[3]" />
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                                                            {
                                                                                page.name
                                                                            }
                                                                        </span>
                                                                        {selectionState ===
                                                                            1 && (
                                                                            <span className="py-0.2 rounded-full border border-sky-200 bg-sky-50 px-2 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                                                                Chỉ
                                                                                xem
                                                                            </span>
                                                                        )}
                                                                        {selectionState ===
                                                                            2 && (
                                                                            <span className="py-0.2 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                                                Tất
                                                                                cả
                                                                                quyền
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {pagePerms.length >
                                                                        0 &&
                                                                        selectionState >
                                                                            0 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    setExpandedPages(
                                                                                        (
                                                                                            prev,
                                                                                        ) => ({
                                                                                            ...prev,
                                                                                            [page.id]:
                                                                                                !prev[
                                                                                                    page
                                                                                                        .id
                                                                                                ],
                                                                                        }),
                                                                                    )
                                                                                }
                                                                                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                                                                            >
                                                                                {isExpanded ? (
                                                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                                                ) : (
                                                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                                                )}
                                                                            </button>
                                                                        )}
                                                                </div>

                                                                {/* Nested Collapsible Panel */}
                                                                {isExpanded &&
                                                                    pagePerms.length >
                                                                        0 && (
                                                                        <div className="ml-3 space-y-1.5 border-l-2 border-sky-500 py-1 pl-4 dark:border-sky-400">
                                                                            <div className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                                                                                Chức
                                                                                năng
                                                                                trang:
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {pagePerms.map(
                                                                                    (
                                                                                        perm,
                                                                                    ) => {
                                                                                        const friendlyLabel =
                                                                                            formatPermissionLabel(
                                                                                                perm.name,
                                                                                            );

                                                                                        return (
                                                                                            <label
                                                                                                key={
                                                                                                    perm.id
                                                                                                }
                                                                                                className="flex cursor-pointer items-center space-x-1.5 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-1 text-[11px] shadow-2xs select-none dark:border-zinc-700/60 dark:bg-zinc-800"
                                                                                            >
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={
                                                                                                        data.permissions.includes(
                                                                                                            perm.name,
                                                                                                        ) ||
                                                                                                        editingRole?.name ===
                                                                                                            'admin'
                                                                                                    }
                                                                                                    onChange={() =>
                                                                                                        handleNestedPermissionToggle(
                                                                                                            perm.name,
                                                                                                            page,
                                                                                                        )
                                                                                                    }
                                                                                                    disabled={
                                                                                                        editingRole?.name ===
                                                                                                        'admin'
                                                                                                    }
                                                                                                    className="checkbox-field h-3.5 w-3.5"
                                                                                                />
                                                                                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                                                                                    {
                                                                                                        friendlyLabel
                                                                                                    }
                                                                                                </span>
                                                                                            </label>
                                                                                        );
                                                                                    },
                                                                                )}
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
