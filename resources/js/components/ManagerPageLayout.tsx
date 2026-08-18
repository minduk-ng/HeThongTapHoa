import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode, ElementType } from 'react';
import React, { useState } from 'react';

export interface ManagerPageLayoutProps {
    icon?: ElementType<{ className?: string }>;
    title?: string;
    subtitle?: string;
    badge?: ReactNode;
    actions?: ReactNode;
    filters?: ReactNode;
    children: ReactNode;
    defaultFiltersOpen?: boolean;
    hasActiveFilter?: boolean;
    sidebar?: ReactNode; // Legacy fallback support
}

export default function ManagerPageLayout({
    icon: Icon,
    title,
    subtitle,
    badge,
    actions,
    filters,
    children,
    defaultFiltersOpen = false,
    hasActiveFilter = false,
    sidebar,
}: ManagerPageLayoutProps) {
    const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen || hasActiveFilter);

    // Fallback nếu có trang vẫn dùng cấu trúc sidebar cũ
    if (sidebar && !title) {
        return (
            <div className="flex-1 flex flex-col lg:flex-row gap-4 h-full w-full min-h-0 overflow-hidden">
                <aside className="w-full lg:w-80 shrink-0 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs flex flex-col overflow-y-auto min-h-0 space-y-5">
                    {sidebar}
                </aside>
                <main className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col gap-3.5 h-full w-full min-h-0 overflow-hidden">
            {/* Top Control Bar Header */}
            <div className="shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-2 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Icon, Title & Badge */}
                    <div className="flex items-center gap-3 min-w-0">
                        {Icon && (
                            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0">
                                <Icon className="w-5 h-5 stroke-[1.5]" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                {title && (
                                    <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {title}
                                    </h1>
                                )}
                                {badge && <div className="shrink-0">{badge}</div>}
                            </div>
                            {subtitle && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right: Toggle Filter button & Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {filters && (
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(!filtersOpen)}
                                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors shadow-2xs ${
                                    filtersOpen
                                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/60 text-sky-700 dark:text-sky-300'
                                        : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                }`}
                                title={filtersOpen ? 'Thu gọn bộ lọc' : 'Mở rộng bộ lọc'}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Bộ lọc</span>
                                {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
                                {filtersOpen ? (
                                    <ChevronUp className="w-3 h-3 text-zinc-400" />
                                ) : (
                                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                                )}
                            </button>
                        )}
                        {actions}
                    </div>
                </div>

                {/* Collapsible Horizontal Filter Row */}
                {filters && filtersOpen && (
                    <div className="mt-3.5 pt-3.5 border-t border-zinc-100 dark:border-zinc-800 transition-all duration-200">
                        {filters}
                    </div>
                )}
            </div>

            {/* Main Table Content (Full Width) */}
            <main className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
