import { Head, useForm, router } from '@inertiajs/react';
import { useState, Fragment } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Page } from '../../types/admin';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';

interface Props {
    pages: Page[];
}

export default function PagesManager({ pages }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPage, setEditingPage] = useState<Page | null>(null);
    const [isNewGroup, setIsNewGroup] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    // Drag and Drop sorting states
    const [isSortingMode, setIsSortingMode] = useState(false);
    const [sortedGroups, setSortedGroups] = useState<{ group_name: string; pages: Page[] }[]>([]);
    const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
    const [draggedPage, setDraggedPage] = useState<{ groupIndex: number; pageIndex: number } | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
    const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);
    const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | 'inside' | null>(null);

    const { data, setData, post, put, delete: destroy, processing, errors, reset, clearErrors } = useForm({
        name: '',
        route_path: '',
        group_name: '',
    });

    const openCreateModal = () => {
        clearErrors();
        reset();
        setIsNewGroup(false);
        setEditingPage(null);
        setIsModalOpen(true);
    };

    const openEditModal = (page: Page) => {
        clearErrors();
        setData({
            name: page.name,
            route_path: page.route_path,
            group_name: page.group_name,
        });
        setIsNewGroup(false);
        setEditingPage(page);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        reset();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingPage) {
            put(`/admin/pages/${editingPage.id}`, {
                onSuccess: () => closeModal(),
            });
        } else {
            post('/admin/pages', {
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
            router.delete(`/admin/pages/${deleteId}`, {
                data: { password: deletePassword },
                onSuccess: () => {
                    setIsDeleteModalOpen(false);
                    setDeleteId(null);
                    setDeletePassword('');
                },
                onError: (err) => {
                    alert(err.password || 'Mật khẩu không chính xác.');
                }
            });
        }
    };

    const toggleListGroup = (groupName: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    const enterSortingMode = () => {
        if (isSortingMode) {
            setIsSortingMode(false);
        } else {
            // Group pages by group_name, keeping order
            const groupsMap: Record<string, Page[]> = {};
            pages.forEach(page => {
                if (!groupsMap[page.group_name]) {
                    groupsMap[page.group_name] = [];
                }
                groupsMap[page.group_name].push(page);
            });

            // Convert to ordered array based on minimum sort_order of pages in group
            const grouped = Object.entries(groupsMap).map(([group_name, list]) => ({
                group_name,
                pages: list,
                minSort: Math.min(...list.map(p => p.sort_order))
            }))
            .sort((a, b) => a.minSort - b.minSort)
            .map(({ group_name, pages }) => ({ group_name, pages }));

            setSortedGroups(grouped);
            setIsSortingMode(true);
        }
    };

    // Group drag handlers
    const handleGroupDragStart = (e: React.DragEvent, index: number) => {
        if (draggedPage) return;
        setDraggedGroupIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleGroupDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedGroupIndex !== null) {
            if (draggedGroupIndex !== index) {
                setDragOverGroupIndex(index);
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                setDropPosition(relativeY < rect.height / 2 ? 'top' : 'bottom');
            }
        } else if (draggedPage !== null) {
            setDragOverGroupIndex(index);
            setDragOverPageIndex(null);
            setDropPosition('inside');
        }
    };

    const handleGroupDrop = (e: React.DragEvent, targetGroupIndex: number) => {
        e.preventDefault();
        if (draggedGroupIndex !== null && draggedGroupIndex !== targetGroupIndex) {
            const nextGroups = [...sortedGroups];
            const [draggedGroup] = nextGroups.splice(draggedGroupIndex, 1);
            
            let insertIndex = targetGroupIndex;
            if (draggedGroupIndex < targetGroupIndex && dropPosition === 'top') {
                insertIndex = targetGroupIndex - 1;
            } else if (draggedGroupIndex > targetGroupIndex && dropPosition === 'bottom') {
                insertIndex = targetGroupIndex + 1;
            }
            
            nextGroups.splice(insertIndex, 0, draggedGroup);
            setSortedGroups(nextGroups);
        } else if (draggedPage !== null) {
            const sourceGroupIndex = draggedPage.groupIndex;
            const sourcePageIndex = draggedPage.pageIndex;
            
            if (sourceGroupIndex !== targetGroupIndex) {
                const nextGroups = [...sortedGroups];
                const pageToMove = nextGroups[sourceGroupIndex].pages[sourcePageIndex];
                
                nextGroups[sourceGroupIndex].pages.splice(sourcePageIndex, 1);
                
                const updatedPage = { ...pageToMove, group_name: nextGroups[targetGroupIndex].group_name };
                nextGroups[targetGroupIndex].pages.push(updatedPage);
                setSortedGroups(nextGroups);
            }
        }
        handleDragEnd();
    };

    // Page drag handlers
    const handlePageDragStart = (e: React.DragEvent, groupIndex: number, pageIndex: number) => {
        e.stopPropagation();
        setDraggedPage({ groupIndex, pageIndex });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handlePageDragOver = (e: React.DragEvent, groupIndex: number, pageIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedPage) {
            if (draggedPage.groupIndex === groupIndex && draggedPage.pageIndex === pageIndex) return;
            setDragOverGroupIndex(groupIndex);
            setDragOverPageIndex(pageIndex);
            
            const rect = e.currentTarget.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            setDropPosition(relativeY < rect.height / 2 ? 'top' : 'bottom');
        }
    };

    const handlePageDrop = (e: React.DragEvent, targetGroupIndex: number, targetPageIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedPage) {
            const { groupIndex: sourceGroupIndex, pageIndex: sourcePageIndex } = draggedPage;
            if (sourceGroupIndex === targetGroupIndex && sourcePageIndex === targetPageIndex) return;
            
            const nextGroups = [...sortedGroups];
            const pageToMove = nextGroups[sourceGroupIndex].pages[sourcePageIndex];
            
            nextGroups[sourceGroupIndex].pages.splice(sourcePageIndex, 1);
            
            const updatedPage = { ...pageToMove, group_name: nextGroups[targetGroupIndex].group_name };
            
            let insertIndex = targetPageIndex;
            if (sourceGroupIndex === targetGroupIndex && sourcePageIndex < targetPageIndex && dropPosition === 'top') {
                insertIndex = targetPageIndex - 1;
            } else if (sourceGroupIndex === targetGroupIndex && sourcePageIndex > targetPageIndex && dropPosition === 'bottom') {
                insertIndex = targetPageIndex + 1;
            } else if (sourceGroupIndex !== targetGroupIndex && dropPosition === 'bottom') {
                insertIndex = targetPageIndex + 1;
            }
            
            nextGroups[targetGroupIndex].pages.splice(insertIndex, 0, updatedPage);
            setSortedGroups(nextGroups);
        }
        handleDragEnd();
    };

    const handleDragEnd = () => {
        setDraggedGroupIndex(null);
        setDraggedPage(null);
        setDragOverGroupIndex(null);
        setDragOverPageIndex(null);
        setDropPosition(null);
    };

    const handleSaveReorder = () => {
        const payload = sortedGroups.map(g => ({
            group_name: g.group_name,
            pages: g.pages.map(p => p.id),
        }));

        router.put('/admin/pages/reorder', {
            groups: payload
        }, {
            onSuccess: () => {
                setIsSortingMode(false);
            }
        });
    };

    const existingGroups = [...new Set(pages.map(p => p.group_name))];

    return (
        <DashboardLayout>
            <Head title="Quản lý Pages" />

            <div className="page-header">
                <div>
                    <h1 className="page-heading">Quản lý Pages (Tool)</h1>
                    <p className="page-subtitle">
                        Danh sách các trang và nhóm chức năng trên hệ thống
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={enterSortingMode} className="btn-secondary w-auto inline-flex items-center gap-2 font-medium">
                        {isSortingMode ? (
                            <>
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Hủy Sắp Xếp
                            </>
                        ) : (
                            <>
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                </svg>
                                Sắp xếp
                            </>
                        )}
                    </button>
                    {!isSortingMode && (
                        <button onClick={openCreateModal} className="btn-primary w-auto inline-flex items-center gap-2">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Thêm Page
                        </button>
                    )}
                </div>
            </div>

            {isSortingMode ? (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-indigo-50/50 dark:bg-slate-800 p-4 rounded-xl border border-indigo-100/50 dark:border-slate-700/50">
                        <p className="text-sm text-indigo-700 dark:text-indigo-400 font-medium">
                            💡 Kéo thả tiêu đề để đổi vị trí Nhóm. Kéo thả các trang con để sắp xếp thứ tự hoặc đổi Nhóm cho trang.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setIsSortingMode(false)} className="btn-secondary">
                                Hủy
                            </button>
                            <button onClick={handleSaveReorder} className="btn-primary w-auto">
                                Lưu vị trí
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        {sortedGroups.map((group, groupIndex) => {
                            const isGroupDragOver = dragOverGroupIndex === groupIndex && dragOverPageIndex === null && dropPosition === 'inside';
                            const isGroupHeaderDragOver = dragOverGroupIndex === groupIndex && draggedGroupIndex !== null;
                            
                            return (
                                <div
                                    key={group.group_name}
                                    draggable="true"
                                    onDragStart={(e) => handleGroupDragStart(e, groupIndex)}
                                    onDragOver={(e) => handleGroupDragOver(e, groupIndex)}
                                    onDrop={(e) => handleGroupDrop(e, groupIndex)}
                                    onDragEnd={handleDragEnd}
                                    className={`card-panel transition-all p-4 border border-gray-200 dark:border-slate-700/80 ${
                                        isGroupDragOver ? 'ring-2 ring-indigo-500 dark:ring-indigo-400 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-lg' : ''
                                    } ${
                                        isGroupHeaderDragOver && dropPosition === 'top' ? '!border-t-4 !border-t-indigo-500 dark:!border-t-indigo-400' : ''
                                    } ${
                                        isGroupHeaderDragOver && dropPosition === 'bottom' ? '!border-b-4 !border-b-indigo-500 dark:!border-b-indigo-400' : ''
                                    }`}
                                >
                                    <div 
                                        onDoubleClick={() => toggleListGroup(group.group_name)}
                                        className={`flex items-center justify-between cursor-move select-none ${
                                            !collapsedGroups[group.group_name] ? 'pb-3 border-b border-gray-100 dark:border-slate-700/50 mb-3' : ''
                                        }`}
                                        title="Nhấp đúp chuột để thu gọn/mở rộng nhóm"
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                            </svg>
                                            <span className="font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                                {group.group_name}
                                            </span>
                                        </div>
                                        <span className="text-xs bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                                            {group.pages.length} Pages
                                        </span>
                                    </div>

                                    {!collapsedGroups[group.group_name] && (
                                        <div className="space-y-2 min-h-[80px] transition-all">
                                            {group.pages.map((page, pageIndex) => {
                                                const isPageDragOver = dragOverGroupIndex === groupIndex && dragOverPageIndex === pageIndex;
                                                
                                                return (
                                                    <div
                                                        key={page.id}
                                                        draggable="true"
                                                        onDragStart={(e) => handlePageDragStart(e, groupIndex, pageIndex)}
                                                        onDragOver={(e) => handlePageDragOver(e, groupIndex, pageIndex)}
                                                        onDrop={(e) => handlePageDrop(e, groupIndex, pageIndex)}
                                                        onDragEnd={handleDragEnd}
                                                        className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50 hover:shadow-md transition-all cursor-move select-none ${
                                                            isPageDragOver && dropPosition === 'top' ? '!border-t-4 !border-t-indigo-500 dark:!border-t-indigo-400' : ''
                                                        } ${
                                                            isPageDragOver && dropPosition === 'bottom' ? '!border-b-4 !border-b-indigo-500 dark:!border-b-indigo-400' : ''
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <svg className="h-4 w-4 text-gray-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                                            </svg>
                                                            <div>
                                                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{page.name}</p>
                                                                <p className="text-xs text-gray-400 font-mono">{page.route_path}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {group.pages.length === 0 && (
                                                <div className="flex h-20 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-xs text-gray-400">
                                                    Kéo thả trang vào đây
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="card-panel">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                        <thead>
                            <tr>
                                <th>Tên hiển thị</th>
                                <th>Đường dẫn</th>
                                <th>Nhóm chức năng</th>
                                <th>Người truy cập</th>
                                <th className="text-right">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="table-body">
                            {(() => {
                                const orderedGroups: { groupName: string; groupPages: Page[] }[] = [];
                                pages.forEach(page => {
                                    let existing = orderedGroups.find(g => g.groupName === page.group_name);
                                    if (!existing) {
                                        existing = { groupName: page.group_name, groupPages: [] };
                                        orderedGroups.push(existing);
                                    }
                                    existing.groupPages.push(page);
                                });
                                return orderedGroups;
                            })().map(({ groupName, groupPages }) => {
                                const isCollapsed = collapsedGroups[groupName];
                                return (
                                    <Fragment key={groupName}>
                                        <tr className="bg-gray-50/50 dark:bg-slate-800/50 border-y border-gray-100 dark:border-slate-700/50">
                                            <td colSpan={5} className="px-6 py-3 font-semibold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 cursor-pointer select-none" onClick={() => toggleListGroup(groupName)}>
                                                <div className="flex items-center gap-2">
                                                    <svg
                                                        className={`h-3 w-3 transform transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    <span>{groupName} ({groupPages.length})</span>
                                                </div>
                                            </td>
                                        </tr>
                                        {!isCollapsed && groupPages.map((page) => (
                                            <tr key={page.id} className="data-table-row bg-slate-50/30 dark:bg-slate-800/10">
                                                <td className="font-medium text-gray-900 dark:text-gray-100 pl-10">{page.name}</td>
                                                <td><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-slate-700 text-pink-600 dark:text-pink-400">{page.route_path}</code></td>
                                                <td>
                                                    <span className="badge badge-indigo">{page.group_name}</span>
                                                </td>
                                                <td className="font-semibold text-gray-700 dark:text-gray-300 font-mono text-sm">{page.user_count} người</td>
                                                <td className="text-right space-x-2">
                                                    <button onClick={() => openEditModal(page)} className="btn-sm btn-edit">
                                                        Sửa
                                                    </button>
                                                    <button onClick={() => openDeleteModal(page.id)} className="btn-sm btn-delete">
                                                        Xóa
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })}
                            {pages.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                                        Chưa có page nào.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-heading">
                            {editingPage ? 'Sửa Page' : 'Thêm Page mới'}
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="form-label">Tên hiển thị</label>
                                <input
                                    type="text"
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    className="input-field"
                                    placeholder="VD: Trang chủ"
                                />
                                {errors.name && <p className="form-error">{errors.name}</p>}
                            </div>

                            <div>
                                <label className="form-label">Đường dẫn</label>
                                <input
                                    type="text"
                                    value={data.route_path}
                                    onChange={(e) => setData('route_path', e.target.value)}
                                    className="input-field"
                                    placeholder="VD: /admin/dashboard"
                                />
                                {errors.route_path && <p className="form-error">{errors.route_path}</p>}
                            </div>

                            <div>
                                <label className="form-label">Nhóm chức năng</label>
                                <div className="flex gap-2">
                                    {!isNewGroup ? (
                                        <select
                                            value={data.group_name}
                                            onChange={(e) => setData('group_name', e.target.value)}
                                            className="input-field flex-1"
                                        >
                                            <option value="">-- Chọn nhóm chức năng --</option>
                                            {existingGroups.map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={data.group_name}
                                            onChange={(e) => setData('group_name', e.target.value)}
                                            className="input-field flex-1"
                                            placeholder="Nhập nhóm mới..."
                                        />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsNewGroup(!isNewGroup);
                                            setData('group_name', '');
                                        }}
                                        className="btn-secondary px-3 animate-none"
                                    >
                                        {isNewGroup ? 'Chọn' : '+ Mới'}
                                    </button>
                                </div>
                                {errors.group_name && <p className="form-error">{errors.group_name}</p>}
                            </div>

                            <div className="modal-footer">
                                <button type="button" onClick={closeModal} className="btn-secondary">
                                    Hủy
                                </button>
                                <button type="submit" disabled={processing} className="btn-primary w-auto">
                                    {editingPage ? 'Cập nhật' : 'Thêm mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={isDeleteModalOpen}
                title="Xác nhận xóa trang"
                description="Hành động này không thể hoàn tác. Vui lòng nhập mật khẩu của bạn để xác nhận xóa trang."
                passwordValue={deletePassword}
                onPasswordChange={setDeletePassword}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
            />
        </DashboardLayout>
    );
}
