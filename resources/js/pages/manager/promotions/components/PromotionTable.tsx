import { Edit3, Ticket, Trash2 } from 'lucide-react';

export interface PromotionData {
    id: number;
    code: string;
    name: string;
    description: string | null;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number;
    min_order_amount: number | null;
    max_discount_amount: number | null;
    max_uses: number | null;
    used_count: number;
    starts_at: string | null;
    expires_at: string | null;
    is_active: boolean;
}

interface Props {
    promotions: PromotionData[];
    onEdit: (promotion: PromotionData) => void;
    onDelete: (promotion: PromotionData) => void;
}

const money = (value: number | null) =>
    value === null ? '—' : `${Number(value).toLocaleString('vi-VN')} đ`;
const date = (value: string | null) =>
    value ? new Date(value).toLocaleString('vi-VN') : 'Không giới hạn';

export default function PromotionTable({
    promotions,
    onEdit,
    onDelete,
}: Props) {
    return (
        <div className="h-full overflow-auto rounded-2xl bg-white shadow-xs dark:bg-zinc-900">
            <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/95 dark:text-zinc-400">
                    <tr>
                        {[
                            'Mã',
                            'Tên khuyến mãi',
                            'Giá trị',
                            'Điều kiện',
                            'Lượt dùng',
                            'Thời gian',
                            'Trạng thái',
                            'Thao tác',
                        ].map((label) => (
                            <th key={label} className="px-4 py-3 font-semibold">
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-zinc-700 dark:divide-zinc-800 dark:text-zinc-300">
                    {promotions.length === 0 ? (
                        <tr>
                            <td
                                colSpan={8}
                                className="px-6 py-16 text-center text-zinc-500"
                            >
                                <Ticket className="mx-auto mb-3 h-8 w-8 stroke-[1.5]" />
                                Chưa có khuyến mãi phù hợp.
                            </td>
                        </tr>
                    ) : (
                        promotions.map((promotion) => (
                            <tr
                                key={promotion.id}
                                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            >
                                <td className="px-4 py-4 font-mono font-bold text-sky-600 dark:text-sky-400">
                                    {promotion.code}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {promotion.name}
                                    </div>
                                    <div className="mt-1 max-w-xs truncate text-zinc-500">
                                        {promotion.description || '—'}
                                    </div>
                                </td>
                                <td className="px-4 py-4 font-semibold tabular-nums">
                                    {promotion.discount_type === 'percentage'
                                        ? `${promotion.discount_value}%`
                                        : money(promotion.discount_value)}
                                    <div className="mt-1 font-normal text-zinc-500">
                                        Tối đa:{' '}
                                        {money(promotion.max_discount_amount)}
                                    </div>
                                </td>
                                <td className="px-4 py-4 tabular-nums">
                                    Đơn tối thiểu:{' '}
                                    {money(promotion.min_order_amount)}
                                </td>
                                <td className="px-4 py-4 tabular-nums">
                                    {promotion.used_count} /{' '}
                                    {promotion.max_uses ?? '∞'}
                                </td>
                                <td className="px-4 py-4">
                                    <div>{date(promotion.starts_at)}</div>
                                    <div className="text-zinc-500">
                                        đến {date(promotion.expires_at)}
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <span
                                        className={`rounded-full px-2 py-1 font-semibold ${promotion.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
                                    >
                                        {promotion.is_active
                                            ? 'Hoạt động'
                                            : 'Tạm dừng'}
                                    </span>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => onEdit(promotion)}
                                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800"
                                        >
                                            <Edit3 className="h-4 w-4 stroke-[1.5]" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(promotion)}
                                            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800"
                                        >
                                            <Trash2 className="h-4 w-4 stroke-[1.5]" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
