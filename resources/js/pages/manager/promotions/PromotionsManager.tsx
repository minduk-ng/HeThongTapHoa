import { useMemo, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, Ticket } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import PromotionFormDrawer from './components/PromotionFormDrawer';
import PromotionTable, { PromotionData } from './components/PromotionTable';

interface Props {
    promotions: PromotionData[];
    filters: { search?: string };
    menu_items?: { id: number; name: string }[];
    menu_categories?: { id: number; name: string }[];
}
export default function PromotionsManager({
    promotions,
    filters,
    menu_items,
    menu_categories,
}: Props) {
    const [search, setSearch] = useState(filters.search || '');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<PromotionData | null>(null);
    const [deleting, setDeleting] = useState<PromotionData | null>(null);
    const [password, setPassword] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const filtered = useMemo(
        () =>
            promotions.filter((promotion) =>
                `${promotion.code} ${promotion.name}`
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()),
            ),
        [promotions, search],
    );
    const confirmDelete = (event: React.FormEvent) => {
        event.preventDefault();
        if (!deleting || processing) return;
        setProcessing(true);
        router.delete(`/manager/promotions/${deleting.id}`, {
            data: { password },
            onSuccess: () => {
                setDeleting(null);
                setPassword('');
                setDeleteError(null);
            },
            onError: (errors) =>
                setDeleteError(errors.password || 'Không thể xóa khuyến mãi.'),
            onFinish: () => setProcessing(false),
        });
    };
    return (
        <DashboardLayout fullWidth>
            <Head title="Quản lý khuyến mãi" />
            <ManagerPageLayout
                sidebar={
                    <>
                        <div>
                            <div className="mb-1 flex items-center gap-2 text-sky-600 dark:text-sky-400">
                                <Ticket className="h-5 w-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold tracking-wider uppercase">
                                    Phân hệ Quản lý
                                </span>
                            </div>
                            <h1 className="font-display text-xl text-zinc-900 dark:text-zinc-100">
                                Khuyến mãi
                            </h1>
                            <p className="mt-1 text-xs text-zinc-500">
                                Quản lý mã giảm giá cho thanh toán POS
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setEditing(null);
                                setDrawerOpen(true);
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700"
                        >
                            <Plus className="h-4 w-4 stroke-[1.5]" />
                            Thêm khuyến mãi mới
                        </button>
                        <label className="relative block">
                            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Tìm mã hoặc tên…"
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pr-3 pl-9 text-xs outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800"
                            />
                        </label>
                        <div className="mt-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                            <div className="text-xs text-zinc-500">
                                Tổng khuyến mãi
                            </div>
                            <div className="mt-1 font-display text-2xl tabular-nums">
                                {promotions.length}
                            </div>
                        </div>
                    </>
                }
            >
                <PromotionTable
                    promotions={filtered}
                    onEdit={(promotion) => {
                        setEditing(promotion);
                        setDrawerOpen(true);
                    }}
                    onDelete={(promotion) => {
                        setDeleting(promotion);
                        setPassword('');
                        setDeleteError(null);
                    }}
                />
            </ManagerPageLayout>
            <PromotionFormDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                promotionToEdit={editing}
                menuItems={menu_items}
                menuCategories={menu_categories}
            />
            <DeleteConfirmModal
                isOpen={!!deleting}
                title="Xác nhận xóa khuyến mãi"
                description={`Xóa mã ${deleting?.code || ''}?`}
                passwordValue={password}
                onPasswordChange={setPassword}
                onClose={() => setDeleting(null)}
                onConfirm={confirmDelete}
                processing={processing}
                errorMsg={deleteError}
            />
        </DashboardLayout>
    );
}
