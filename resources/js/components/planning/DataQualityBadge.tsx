import {
    CheckCircle2,
    AlertTriangle,
    AlertCircle,
    Clock,
    HelpCircle,
} from 'lucide-react';
import { formatDataQuality } from './planningFormatters';
import type { QualityTone } from './planningFormatters';

interface DataQualityBadgeProps {
    quality: string | null | undefined;
    className?: string;
    showIcon?: boolean;
}

const TONE_CLASSES: Record<QualityTone, string> = {
    emerald:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/80',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/80',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/80',
    zinc: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

export default function DataQualityBadge({
    quality,
    className = '',
    showIcon = true,
}: DataQualityBadgeProps) {
    const { label, tone } = formatDataQuality(quality);

    const renderIcon = () => {
        if (!showIcon) {
            return null;
        }

        switch (quality) {
            case 'sufficient':
                return <CheckCircle2 className="h-3 w-3 shrink-0" />;
            case 'limited':
                return <AlertTriangle className="h-3 w-3 shrink-0" />;
            case 'insufficient':
                return <AlertCircle className="h-3 w-3 shrink-0" />;
            case 'stale':
                return <Clock className="h-3 w-3 shrink-0" />;
            case 'invalid':
                return <AlertCircle className="h-3 w-3 shrink-0" />;
            default:
                return <HelpCircle className="h-3 w-3 shrink-0" />;
        }
    };

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${TONE_CLASSES[tone]} ${className}`}
            title={`Chất lượng dữ liệu: ${label}`}
        >
            {renderIcon()}
            <span>{label}</span>
        </span>
    );
}
