import { Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlanningResultSummary } from '../../types/planning';

const messages = {
    no_run: ['Chưa có kết quả', 'Chưa có lượt hoàn thành phù hợp nguồn dữ liệu và kỳ dự báo. Người có quyền chạy dự báo có thể thao tác ở phần trạng thái lượt.'],
    running: ['Đang xử lý dự báo', 'Lượt dự báo đang chờ hoặc đang chạy, chưa có kết quả khả dụng.'],
    failed: ['Lượt dự báo thất bại', 'Chưa có kết quả khả dụng. Người có quyền chạy dự báo có thể thử lại ở phần trạng thái lượt.'],
    horizon_mismatch: ['Chưa có kết quả phù hợp kỳ dự báo', 'Kết quả đang hiển thị thuộc kỳ của lượt đã lưu, khác kỳ được yêu cầu.'],
    missing_forecasts: ['Chưa đủ dữ liệu để đề xuất', 'Lượt đã hoàn thành nhưng chưa có dự báo sản phẩm khả dụng. Chưa thể kết luận về tồn kho.'],
    no_recommendation_evidence: ['Chưa đủ dữ liệu để đề xuất', 'Có dự báo sản phẩm nhưng chưa có bản ghi đề xuất được tạo. Chưa thể kết luận về tồn kho.'],
} satisfies Record<NonNullable<PlanningResultSummary['empty_reason']>, readonly [string, string]>;

export default function PlanningResultState({ reason, title, description, children }: {
    reason?: PlanningResultSummary['empty_reason'];
    title?: string;
    description?: string;
    children?: ReactNode;
}) {
    const message = messages[reason ?? 'no_run'];

    return (
        <div className="flex items-start gap-3 p-5 text-slate-700 dark:text-slate-300">
            <Boxes aria-hidden="true" className="h-6 w-6 shrink-0 text-slate-400" />
            <div>
                <h3 className="font-display text-base font-semibold">{title ?? message[0]}</h3>
                <p className="mt-1 text-sm">{description ?? message[1]}</p>
                {children}
            </div>
        </div>
    );
}
