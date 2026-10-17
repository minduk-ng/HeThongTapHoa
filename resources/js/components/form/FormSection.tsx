import React from 'react';

export interface FormSectionProps {
    title?: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
    gridCols?: 1 | 2 | 3;
    children: React.ReactNode;
    className?: string;
}

export default function FormSection({
    title,
    description,
    icon: Icon,
    gridCols = 1,
    children,
    className = '',
}: FormSectionProps) {
    const gridClass =
        gridCols === 3
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : gridCols === 2
              ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
              : 'space-y-4';

    return (
        <div
            className={`rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-800/40 ${className}`}
        >
            {(title || Icon) && (
                <div className="mb-3.5 flex items-center justify-between border-b border-zinc-200/50 pb-2.5 dark:border-zinc-700/50">
                    <div className="flex items-center gap-2">
                        {Icon && (
                            <Icon className="h-4 w-4 stroke-[1.5] text-zinc-500 dark:text-zinc-400" />
                        )}
                        {title && (
                            <h3 className="font-display text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                                {title}
                            </h3>
                        )}
                    </div>
                    {description && (
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            {description}
                        </span>
                    )}
                </div>
            )}
            <div className={gridClass}>{children}</div>
        </div>
    );
}
