import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Page, Permission, Role } from '../../types/admin';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';

interface Props {
    roles: Role[];
    permissions: Permission[];
    pages: Page[];
}

export default function RolesManager({ roles, permissions, pages }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [expandedPages, setExpandedPages] = useState<Record<number, boolean>>({});

    const { data, setData, post, put, delete: destroy, processing, errors, reset, clearErrors } = useForm({
        name: '',
        description: '',
        permissions: [] as string[],
        pages: [] as number[],
    });

    const getPagePermissions = (pagePath: string): Permission[] => {
        let prefix = '';
        const path = pagePath.replace(/^\//, '');
        if (path === 'admin/pages') {
            prefix = 'pages';
        } else if (path === 'admin/roles') {
            prefix = 'roles';
        } else if (path === 'admin/permissions') {
            prefix = 'users';
        }

        if (!prefix) return [];
        return permissions.filter(p => p.name.startsWith(prefix + '.'));
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
        const initialExpanded: Record<number, boolean> = {};
        if (role.pages) {
            role.pages.forEach(p => {
                initialExpanded[p.id] = true;
            });
        }
        setData({
            name: role.name,
            description: role.description || '',
            permissions: role.permissions.map(p => p.name),
            pages: role.pages ? role.pages.map(p => p.id) : [],
        });
        setEditingRole(role);
        setExpandedPages(initialExpanded);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        reset();
        setExpandedPages({});
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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const openDeleteModal = (id: number) => {
        setDeleteId(id);
        setDeletePassword('');
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
                },
                onError: (err: any) => {
                    alert(err.password || 'Mật khẩu không chính xác.');
                }
            });
        }
    };

    const handlePageToggle = (page: Page) => {
        if (editingRole?.name === 'admin') return;
        
        const pagePermissions = getPagePermissions(page.route_path);
        const prefix = page.route_path.replace(/^\/admin\//, '').replace(/^\//, '');
        const viewPermName = prefix === 'permissions' ? 'users.view' : `${prefix}.view`;

        if (data.pages.includes(page.id)) {
            // Uncheck page: remove page ID and all its permissions
            setData('pages', data.pages.filter(id => id !== page.id));
            const permNames = pagePermissions.map(p => p.name);
            setData('permissions', data.permissions.filter(pName => !permNames.includes(pName)));
            setExpandedPages(prev => ({ ...prev, [page.id]: false }));
        } else {
            // Check page: add page ID, check view permission by default, and expand
            setData('pages', [...data.pages, page.id]);
            const nextPermissions = [...data.permissions];
            const hasView = nextPermissions.includes(viewPermName);
            if (!hasView && permissions.some(p => p.name === viewPermName)) {
                nextPermissions.push(viewPermName);
            }
            setData('permissions', nextPermissions);
            setExpandedPages(prev => ({ ...prev, [page.id]: true }));
        }
    };

    const handleNestedPermissionToggle = (permissionName: string, page: Page) => {
        if (editingRole?.name === 'admin') return;

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
        <DashboardLayout>
            <Head title="Quản lý Nhóm quyền" />

            <div className="page-header">
                <div>
                    <h1 className="page-heading">Nhóm quyền (Roles)</h1>
                    <p className="page-subtitle">
                        Quản lý các nhóm quyền và gán chức năng cho từng nhóm
                    </p>
                </div>
                <button onClick={openCreateModal} className="btn-primary w-auto inline-flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tạo Role mới
                </button>
            </div>

            <div className="card-panel">
                <div className="overflow-x-auto">
                    <table className="data-table">
                    <thead>
                        <tr>
                            <th>Tên Role</th>
                            <th>Mô tả</th>
                            <th>Hệ thống</th>
                            <th>Số quyền</th>
                            <th className="text-right">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="table-body">
                        {roles.map((role) => (
                            <tr key={role.id} className="data-table-row">
                                <td className="font-bold text-indigo-600 dark:text-indigo-400">{role.name}</td>
                                <td className="text-gray-600 dark:text-gray-300">{role.description}</td>
                                <td>
                                    {role.is_system ? (
                                        <span className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Hệ thống</span>
                                    ) : (
                                        <span className="badge bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300">Tùy chỉnh</span>
                                    )}
                                </td>
                                <td>
                                    <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                        {role.permissions.length} quyền
                                    </span>
                                </td>
                                <td className="text-right space-x-2">
                                    <button onClick={() => openEditModal(role)} className="btn-sm btn-edit">
                                        Sửa
                                    </button>
                                    {!role.is_system && (
                                        <button onClick={() => openDeleteModal(role.id)} className="btn-sm btn-delete">
                                            Xóa
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-2xl">
                        <h2 className="modal-heading">
                            {editingRole ? `Sửa Role: ${editingRole.name}` : 'Tạo Role mới'}
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Tên Role</label>
                                    <input
                                        type="text"
                                        value={data.name}
                                        onChange={(e) => setData('name', e.target.value)}
                                        className="input-field"
                                        disabled={editingRole?.is_system}
                                        placeholder="VD: editor"
                                    />
                                    {errors.name && <p className="form-error">{errors.name}</p>}
                                </div>
                                <div>
                                    <label className="form-label">Mô tả</label>
                                    <input
                                        type="text"
                                        value={data.description}
                                        onChange={(e) => setData('description', e.target.value)}
                                        className="input-field"
                                        placeholder="VD: Người biên tập nội dung"
                                    />
                                    {errors.description && <p className="form-error">{errors.description}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="form-label mb-3 font-semibold text-gray-800 dark:text-gray-100">Quyền truy cập trang & Chức năng</label>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto p-4 rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50">
                                    {Object.entries(
                                        pages.reduce((acc, page) => {
                                            if (!acc[page.group_name]) acc[page.group_name] = [];
                                            acc[page.group_name].push(page);
                                            return acc;
                                        }, {} as Record<string, Page[]>)
                                    ).map(([groupName, groupPages]) => {
                                        const isGroupAllSelected = groupPages.every(p => data.pages.includes(p.id)) && editingRole?.name !== 'admin';
                                        
                                        const handleGroupToggle = () => {
                                            if (editingRole?.name === 'admin') return;
                                            const groupPageIds = groupPages.map(p => p.id);
                                            if (isGroupAllSelected) {
                                                // Uncheck group: remove page IDs and their permissions
                                                setData('pages', data.pages.filter(id => !groupPageIds.includes(id)));
                                                const allGroupPerms = groupPages.flatMap(p => getPagePermissions(p.route_path).map(pm => pm.name));
                                                setData('permissions', data.permissions.filter(pName => !allGroupPerms.includes(pName)));
                                                setExpandedPages(prev => {
                                                    const next = { ...prev };
                                                    groupPageIds.forEach(id => { next[id] = false; });
                                                    return next;
                                                });
                                            } else {
                                                // Check group: add page IDs and their default view permissions
                                                const nextPages = [...new Set([...data.pages, ...groupPageIds])];
                                                const nextPermissions = [...data.permissions];
                                                const newExpanded = { ...expandedPages };
                                                
                                                groupPages.forEach(p => {
                                                    newExpanded[p.id] = true;
                                                    const prefix = p.route_path.replace(/^\/admin\//, '').replace(/^\//, '');
                                                    const viewPermName = prefix === 'permissions' ? 'users.view' : `${prefix}.view`;
                                                    if (!nextPermissions.includes(viewPermName) && permissions.some(pm => pm.name === viewPermName)) {
                                                        nextPermissions.push(viewPermName);
                                                    }
                                                });
                                                setData('pages', nextPages);
                                                setData('permissions', nextPermissions);
                                                setExpandedPages(newExpanded);
                                            }
                                        };

                                        return (
                                            <div key={groupName} className="space-y-3 pb-3 border-b border-gray-100 dark:border-slate-700/50 last:border-b-0">
                                                <label className="flex items-center space-x-2 cursor-pointer font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                                    <input
                                                        type="checkbox"
                                                        checked={isGroupAllSelected || editingRole?.name === 'admin'}
                                                        disabled={editingRole?.name === 'admin'}
                                                        onChange={handleGroupToggle}
                                                        className="checkbox-field"
                                                    />
                                                    <span>{groupName}</span>
                                                </label>
                                                <div className="pl-4 space-y-3">
                                                    {groupPages.map((page) => {
                                                        const isPageChecked = data.pages.includes(page.id) || editingRole?.name === 'admin';
                                                        const isExpanded = !!expandedPages[page.id] && isPageChecked;
                                                        const pagePerms = getPagePermissions(page.route_path);

                                                        return (
                                                            <div key={page.id} className="space-y-2">
                                                                <div className="flex items-center justify-between bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-gray-100 dark:border-slate-700/50">
                                                                    <label className="flex items-center space-x-3 cursor-pointer flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isPageChecked}
                                                                            onChange={() => handlePageToggle(page)}
                                                                            disabled={editingRole?.name === 'admin'}
                                                                            className="checkbox-field"
                                                                        />
                                                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                                            {page.name}
                                                                        </span>
                                                                    </label>
                                                                    {pagePerms.length > 0 && isPageChecked && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setExpandedPages(prev => ({ ...prev, [page.id]: !prev[page.id] }))}
                                                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                                                        >
                                                                            <svg
                                                                                className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                                                fill="none"
                                                                                viewBox="0 0 24 24"
                                                                                stroke="currentColor"
                                                                            >
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Nested Collapsible Panel */}
                                                                {isExpanded && pagePerms.length > 0 && (
                                                                    <div className="pl-6 py-1 border-l-2 border-indigo-500 dark:border-indigo-400 ml-4 space-y-2">
                                                                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chức năng trang:</div>
                                                                        <div className="flex flex-wrap gap-3">
                                                                            {pagePerms.map((perm) => {
                                                                                const actionLabel = perm.name.split('.')[1];
                                                                                const friendlyLabel = 
                                                                                    actionLabel === 'view' ? 'Xem' :
                                                                                    actionLabel === 'create' ? 'Thêm' :
                                                                                    actionLabel === 'edit' ? 'Sửa' :
                                                                                    actionLabel === 'delete' ? 'Xóa' : perm.name;
                                                                                
                                                                                return (
                                                                                    <label key={perm.id} className="flex items-center space-x-2 cursor-pointer bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm text-xs">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={data.permissions.includes(perm.name) || editingRole?.name === 'admin'}
                                                                                            onChange={() => handleNestedPermissionToggle(perm.name, page)}
                                                                                            disabled={editingRole?.name === 'admin'}
                                                                                            className="checkbox-field h-4 w-4"
                                                                                        />
                                                                                        <span className="text-gray-700 dark:text-gray-300 font-medium">
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

                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn-secondary">
                                    Hủy
                                </button>
                                <button type="submit" disabled={processing} className="btn-primary w-auto">
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
                onPasswordChange={setDeletePassword}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
            />
        </DashboardLayout>
    );
}
