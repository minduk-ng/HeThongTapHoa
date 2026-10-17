import { Head, useForm, router } from '@inertiajs/react';
import {
    FolderTree,
    Plus,
    Pencil,
    Trash2,
    GripVertical,
    ArrowUpDown,
    X,
    Lightbulb,
    Users,
    ChevronDown,
    ChevronRight,
    Save,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import DashboardLayout from '../../layouts/DashboardLayout';
import type { Page } from '../../types/admin';

interface Props {
    pages: Page[];
}

export default function PagesManager({ pages }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPage, setEditingPage] = useState<Page | null>(null);
    const [isNewGroup, setIsNewGroup] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<
        Record<string, boolean>
    >({});

    // Drag and Drop sorting states
    const [isSortingMode, setIsSortingMode] = useState(false);
    const [sortedGroups, setSortedGroups] = useState<
        { group_name: string; pages: Page[] }[]
    >([]);
    const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(
        null,
    );
    const [draggedPage, setDraggedPage] = useState<{
        groupIndex: number;
        pageIndex: number;
    } | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(
        null,
    );
    const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(
        null,
    );
    const [dropPosition, setDropPosition] = useState<
        'top' | 'bottom' | 'inside' | null
    >(null);

    const { data, setData, post, put, processing, errors, reset, clearErrors } =
        useForm({
            name: '',
            route_path: '',
            group_name: '',
            sub_group: '',
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
            sub_group: page.sub_group ?? '',
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
            router.delete(`/admin/pages/${deleteId}`, {
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

    const toggleListGroup = (groupName: string) => {
        setCollapsedGroups((prev) => ({
            ...prev,
            [groupName]: !prev[groupName],
        }));
    };

    const enterSortingMode = () => {
        if (isSortingMode) {
            setIsSortingMode(false);
        } else {
            const groupsMap: Record<string, Page[]> = {};
            pages.forEach((page) => {
                if (!groupsMap[page.group_name]) {
                    groupsMap[page.group_name] = [];
                }

                groupsMap[page.group_name].push(page);
            });

            const grouped = Object.entries(groupsMap)
                .map(([group_name, list]) => ({
                    group_name,
                    pages: list,
                    minSort: Math.min(...list.map((p) => p.sort_order)),
                }))
                .sort((a, b) => a.minSort - b.minSort)
                .map(({ group_name, pages }) => ({ group_name, pages }));

            setSortedGroups(grouped);
            setIsSortingMode(true);
        }
    };

    // Group drag handlers
    const handleGroupDragStart = (e: React.DragEvent, index: number) => {
        if (draggedPage) {
            return;
        }

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

        if (
            draggedGroupIndex !== null &&
            draggedGroupIndex !== targetGroupIndex
        ) {
            const nextGroups = [...sortedGroups];
            const [draggedGroup] = nextGroups.splice(draggedGroupIndex, 1);

            let insertIndex = targetGroupIndex;

            if (
                draggedGroupIndex < targetGroupIndex &&
                dropPosition === 'top'
            ) {
                insertIndex = targetGroupIndex - 1;
            } else if (
                draggedGroupIndex > targetGroupIndex &&
                dropPosition === 'bottom'
            ) {
                insertIndex = targetGroupIndex + 1;
            }

            nextGroups.splice(insertIndex, 0, draggedGroup);
            setSortedGroups(nextGroups);
        } else if (draggedPage !== null) {
            const sourceGroupIndex = draggedPage.groupIndex;
            const sourcePageIndex = draggedPage.pageIndex;

            if (sourceGroupIndex !== targetGroupIndex) {
                const nextGroups = [...sortedGroups];
                const pageToMove =
                    nextGroups[sourceGroupIndex].pages[sourcePageIndex];

                nextGroups[sourceGroupIndex].pages.splice(sourcePageIndex, 1);

                const updatedPage = {
                    ...pageToMove,
                    group_name: nextGroups[targetGroupIndex].group_name,
                };
                nextGroups[targetGroupIndex].pages.push(updatedPage);
                setSortedGroups(nextGroups);
            }
        }

        handleDragEnd();
    };

    // Page drag handlers
    const handlePageDragStart = (
        e: React.DragEvent,
        groupIndex: number,
        pageIndex: number,
    ) => {
        e.stopPropagation();
        setDraggedPage({ groupIndex, pageIndex });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handlePageDragOver = (
        e: React.DragEvent,
        groupIndex: number,
        pageIndex: number,
    ) => {
        e.preventDefault();
        e.stopPropagation();

        if (draggedPage) {
            if (
                draggedPage.groupIndex === groupIndex &&
                draggedPage.pageIndex === pageIndex
            ) {
                return;
            }

            setDragOverGroupIndex(groupIndex);
            setDragOverPageIndex(pageIndex);

            const rect = e.currentTarget.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            setDropPosition(relativeY < rect.height / 2 ? 'top' : 'bottom');
        }
    };

    const handlePageDrop = (
        e: React.DragEvent,
        targetGroupIndex: number,
        targetPageIndex: number,
    ) => {
        e.preventDefault();
        e.stopPropagation();

        if (draggedPage) {
            const { groupIndex: sourceGroupIndex, pageIndex: sourcePageIndex } =
                draggedPage;

            if (
                sourceGroupIndex === targetGroupIndex &&
                sourcePageIndex === targetPageIndex
            ) {
                return;
            }

            const nextGroups = [...sortedGroups];
            const pageToMove =
                nextGroups[sourceGroupIndex].pages[sourcePageIndex];

            nextGroups[sourceGroupIndex].pages.splice(sourcePageIndex, 1);

            const updatedPage = {
                ...pageToMove,
                group_name: nextGroups[targetGroupIndex].group_name,
            };

            let insertIndex = targetPageIndex;

            if (
                sourceGroupIndex === targetGroupIndex &&
                sourcePageIndex < targetPageIndex &&
                dropPosition === 'top'
            ) {
                insertIndex = targetPageIndex - 1;
            } else if (
                sourceGroupIndex === targetGroupIndex &&
                sourcePageIndex > targetPageIndex &&
                dropPosition === 'bottom'
            ) {
                insertIndex = targetPageIndex + 1;
            } else if (
                sourceGroupIndex !== targetGroupIndex &&
                dropPosition === 'bottom'
            ) {
                insertIndex = targetPageIndex + 1;
            }

            nextGroups[targetGroupIndex].pages.splice(
                insertIndex,
                0,
                updatedPage,
            );
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
        const payload = sortedGroups.map((g) => ({
            group_name: g.group_name,
            pages: g.pages.map((p) => p.id),
        }));

        router.put(
            '/admin/pages/reorder',
            {
                groups: payload,
            },
            {
                onSuccess: () => {
                    setIsSortingMode(false);
                },
            },
        );
    };

    const existingGroups = [...new Set(pages.map((p) => p.group_name))];

    const orderedGroups = useMemo(() => {
        const result: { groupName: string; groupPages: Page[] }[] = [];
        pages.forEach((page) => {
            let existing = result.find((g) => g.groupName === page.group_name);

            if (!existing) {
                existing = { groupName: page.group_name, groupPages: [] };
                result.push(existing);
            }

            existing.groupPages.push(page);
        });

        return result;
    }, [pages]);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý Cấu hình Trang" />

            <div className="flex h-full min-h-0 w-full flex-1 flex-col space-y-3 overflow-hidden">
                {/* Top Control Bar Header */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                            <FolderTree className="h-5 w-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Quản lý Cấu hình Trang
                                </h1>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
                                    {pages.length} trang
                                </span>
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 tabular-nums dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
                                    {orderedGroups.length} nhóm
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Danh sách các trang đường dẫn và nhóm chức năng
                                trên menu hệ thống
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={enterSortingMode}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-2xs transition-colors ${
                                isSortingMode
                                    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                            }`}
                        >
                            <ArrowUpDown className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>
                                {isSortingMode
                                    ? 'Hủy sắp xếp'
                                    : 'Sắp xếp thứ tự'}
                            </span>
                        </button>

                        {!isSortingMode && (
                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                            >
                                <Plus className="h-3.5 w-3.5 stroke-[2]" />
                                <span>Thêm Trang mới</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                {isSortingMode ? (
                    /* Drag and Drop Sorting Mode */
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-800/60 dark:bg-amber-950/40">
                            <p className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                                <Lightbulb className="h-4 w-4 shrink-0 stroke-[1.5] text-amber-600" />
                                <span>
                                    Kéo thả tiêu đề để đổi vị trí Nhóm. Kéo thả
                                    các trang con để sắp xếp thứ tự hoặc đổi
                                    Nhóm cho trang.
                                </span>
                            </p>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsSortingMode(false)}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveReorder}
                                    className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    <span>Lưu vị trí</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {sortedGroups.map((group, groupIndex) => {
                                const isGroupDragOver =
                                    dragOverGroupIndex === groupIndex &&
                                    dragOverPageIndex === null &&
                                    dropPosition === 'inside';
                                const isGroupHeaderDragOver =
                                    dragOverGroupIndex === groupIndex &&
                                    draggedGroupIndex !== null;

                                return (
                                    <div
                                        key={group.group_name}
                                        draggable="true"
                                        onDragStart={(e) =>
                                            handleGroupDragStart(e, groupIndex)
                                        }
                                        onDragOver={(e) =>
                                            handleGroupDragOver(e, groupIndex)
                                        }
                                        onDrop={(e) =>
                                            handleGroupDrop(e, groupIndex)
                                        }
                                        onDragEnd={handleDragEnd}
                                        className={`rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 transition-colors dark:border-zinc-700/80 dark:bg-zinc-800/40 ${
                                            isGroupDragOver
                                                ? 'bg-sky-50/20 shadow-md ring-2 ring-sky-500 dark:bg-sky-950/20'
                                                : ''
                                        } ${
                                            isGroupHeaderDragOver &&
                                            dropPosition === 'top'
                                                ? '!border-t-4 !border-t-sky-500'
                                                : ''
                                        } ${
                                            isGroupHeaderDragOver &&
                                            dropPosition === 'bottom'
                                                ? '!border-b-4 !border-b-sky-500'
                                                : ''
                                        }`}
                                    >
                                        <div
                                            onDoubleClick={() =>
                                                toggleListGroup(
                                                    group.group_name,
                                                )
                                            }
                                            className={`flex cursor-move items-center justify-between select-none ${
                                                !collapsedGroups[
                                                    group.group_name
                                                ]
                                                    ? 'mb-3 border-b border-zinc-200/80 pb-3 dark:border-zinc-700/60'
                                                    : ''
                                            }`}
                                            title="Kéo thả để đổi thứ tự nhóm"
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="h-4 w-4 text-zinc-400" />
                                                <span className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {group.group_name}
                                                </span>
                                            </div>
                                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 tabular-nums dark:bg-sky-950/60 dark:text-sky-300">
                                                {group.pages.length} trang
                                            </span>
                                        </div>

                                        {!collapsedGroups[group.group_name] && (
                                            <div className="min-h-[60px] space-y-2 transition-all">
                                                {group.pages.map(
                                                    (page, pageIndex) => {
                                                        const isPageDragOver =
                                                            dragOverGroupIndex ===
                                                                groupIndex &&
                                                            dragOverPageIndex ===
                                                                pageIndex;

                                                        return (
                                                            <div
                                                                key={page.id}
                                                                draggable="true"
                                                                onDragStart={(
                                                                    e,
                                                                ) =>
                                                                    handlePageDragStart(
                                                                        e,
                                                                        groupIndex,
                                                                        pageIndex,
                                                                    )
                                                                }
                                                                onDragOver={(
                                                                    e,
                                                                ) =>
                                                                    handlePageDragOver(
                                                                        e,
                                                                        groupIndex,
                                                                        pageIndex,
                                                                    )
                                                                }
                                                                onDrop={(e) =>
                                                                    handlePageDrop(
                                                                        e,
                                                                        groupIndex,
                                                                        pageIndex,
                                                                    )
                                                                }
                                                                onDragEnd={
                                                                    handleDragEnd
                                                                }
                                                                className={`flex cursor-move items-center justify-between rounded-xl border border-zinc-200/80 bg-white p-2.5 transition-colors select-none hover:shadow-sm dark:border-zinc-700/60 dark:bg-zinc-800/80 ${
                                                                    isPageDragOver &&
                                                                    dropPosition ===
                                                                        'top'
                                                                        ? '!border-t-4 !border-t-sky-500'
                                                                        : ''
                                                                } ${
                                                                    isPageDragOver &&
                                                                    dropPosition ===
                                                                        'bottom'
                                                                        ? '!border-b-4 !border-b-sky-500'
                                                                        : ''
                                                                }`}
                                                            >
                                                                <div className="flex min-w-0 items-center gap-2.5">
                                                                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                                                            {
                                                                                page.name
                                                                            }
                                                                        </p>
                                                                        <p className="truncate font-mono text-[10px] text-zinc-400">
                                                                            {
                                                                                page.route_path
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                                {group.pages.length === 0 && (
                                                    <div className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 text-xs text-zinc-400 dark:border-zinc-700">
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
                    /* Multi-Column Responsive Groups View (Anti-Deep Scrolling) */
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {orderedGroups.map(({ groupName, groupPages }) => {
                                const isCollapsed = collapsedGroups[groupName];

                                return (
                                    <div
                                        key={groupName}
                                        className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50/50 shadow-2xs dark:border-zinc-800/80 dark:bg-zinc-800/20"
                                    >
                                        {/* Group Header */}
                                        <div
                                            onClick={() =>
                                                toggleListGroup(groupName)
                                            }
                                            className="flex cursor-pointer items-center justify-between border-b border-zinc-200/80 bg-white px-4 py-3 transition-colors select-none hover:bg-zinc-50/80 dark:border-zinc-700/80 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                                        >
                                            <div className="flex items-center gap-2">
                                                {isCollapsed ? (
                                                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-sky-500" />
                                                )}
                                                <span className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {groupName}
                                                </span>
                                            </div>
                                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 tabular-nums dark:bg-sky-950/60 dark:text-sky-300">
                                                {groupPages.length} trang
                                            </span>
                                        </div>

                                        {/* Pages List inside Group Card */}
                                        {!isCollapsed && (
                                            <div className="flex-1 divide-y divide-zinc-100 p-1 dark:divide-zinc-800/60">
                                                {groupPages.map((page) => (
                                                    <div
                                                        key={page.id}
                                                        className="group flex items-center justify-between gap-3 rounded-xl p-2.5 transition-colors hover:bg-white dark:hover:bg-zinc-800/60"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                                    {page.name}
                                                                </span>
                                                                {page.sub_group && (
                                                                    <span className="py-0.2 rounded bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                                                        {
                                                                            page.sub_group
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="mt-0.5 flex items-center gap-2">
                                                                <code className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                                                                    {
                                                                        page.route_path
                                                                    }
                                                                </code>
                                                                <span className="flex items-center gap-1 text-[11px] text-zinc-400 tabular-nums">
                                                                    <Users className="h-3 w-3 text-zinc-400" />
                                                                    <span>
                                                                        {
                                                                            page.user_count
                                                                        }
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openEditModal(
                                                                        page,
                                                                    )
                                                                }
                                                                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/60 dark:hover:text-sky-400"
                                                                title="Sửa trang"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5 stroke-[1.5]" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openDeleteModal(
                                                                        page.id,
                                                                    )
                                                                }
                                                                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                                                                title="Xóa trang"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                {editingPage
                                    ? 'Sửa thông tin Page'
                                    : 'Thêm Page mới'}
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
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                    Tên hiển thị
                                </label>
                                <input
                                    type="text"
                                    value={data.name}
                                    onChange={(e) =>
                                        setData('name', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                    placeholder="VD: Danh sách đơn hàng"
                                    required
                                />
                                {errors.name && (
                                    <p className="mt-1 text-xs text-rose-500">
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                    Đường dẫn (Route path)
                                </label>
                                <input
                                    type="text"
                                    value={data.route_path}
                                    onChange={(e) =>
                                        setData('route_path', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                    placeholder="VD: /manager/orders"
                                    required
                                />
                                {errors.route_path && (
                                    <p className="mt-1 text-xs text-rose-500">
                                        {errors.route_path}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                    Nhóm chức năng
                                </label>
                                <div className="flex gap-2">
                                    {!isNewGroup ? (
                                        <select
                                            value={data.group_name}
                                            onChange={(e) =>
                                                setData(
                                                    'group_name',
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                            required
                                        >
                                            <option value="">
                                                — Chọn nhóm chức năng —
                                            </option>
                                            {existingGroups.map((g) => (
                                                <option key={g} value={g}>
                                                    {g}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type="text"
                                            value={data.group_name}
                                            onChange={(e) =>
                                                setData(
                                                    'group_name',
                                                    e.target.value,
                                                )
                                            }
                                            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                            placeholder="Nhập tên nhóm mới..."
                                            required
                                        />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsNewGroup(!isNewGroup);
                                            setData('group_name', '');
                                        }}
                                        className="shrink-0 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                    >
                                        {isNewGroup
                                            ? 'Chọn có sẵn'
                                            : '+ Nhóm mới'}
                                    </button>
                                </div>
                                {errors.group_name && (
                                    <p className="mt-1 text-xs text-rose-500">
                                        {errors.group_name}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                    Nhóm con (Sub-group tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    value={data.sub_group}
                                    onChange={(e) =>
                                        setData('sub_group', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                    placeholder="VD: Doanh thu, Hoạt động..."
                                />
                                {errors.sub_group && (
                                    <p className="mt-1 text-xs text-rose-500">
                                        {errors.sub_group}
                                    </p>
                                )}
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
