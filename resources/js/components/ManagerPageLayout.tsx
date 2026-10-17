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
    const [filtersOpen, setFiltersOpen] = useState(
        defaultFiltersOpen || hasActiveFilter,
    );

    // Fallback nếu có trang vẫn dùng cấu trúc sidebar cũ
    if (sidebar && !title) {
        return (
            <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
                <aside className="flex h-full min-h-0 w-full shrink-0 flex-col space-y-5 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs lg:w-80 dark:border-zinc-800/80 dark:bg-zinc-900">
                    {sidebar}
                </aside>
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3.5 overflow-hidden">
            {/* Top Control Bar Header */}
            <div className="shrink-0 rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Left: Icon, Title & Badge */}
                    <div className="flex min-w-0 items-center gap-3">
                        {Icon && (
                            <Icon className="h-5 w-5 shrink-0 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                        )}
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                {title && (
                                    <h1 className="font-display text-xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                        {title}
                                    </h1>
                                )}
                                {badge && (
                                    <div className="shrink-0">{badge}</div>
                                )}
                            </div>
                            {subtitle && (
                                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right: Toggle Filter button & Actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {filters && (
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(!filtersOpen)}
                                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-2xs transition-colors ${
                                    filtersOpen
                                        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-300'
                                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                                }`}
                                title={
                                    filtersOpen
                                        ? 'Thu gọn bộ lọc'
                                        : 'Mở rộng bộ lọc'
                                }
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>Bộ lọc</span>
                                {hasActiveFilter && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                )}
                                {filtersOpen ? (
                                    <ChevronUp className="h-3 w-3 text-zinc-400" />
                                ) : (
                                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                                )}
                            </button>
                        )}
                        {actions}
                    </div>
                </div>

                {/* Collapsible Horizontal Filter Row */}
                {filters && filtersOpen && (
                    <div className="mt-3.5 border-t border-zinc-100 pt-3.5 transition-colors duration-200 dark:border-zinc-800">
                        {filters}
                    </div>
                )}
            </div>

            {/* Main Table Content (Full Width) */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {children}
            </main>
        </div>
    );
}
