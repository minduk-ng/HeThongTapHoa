import React, { ReactNode } from 'react';

interface ManagerPageLayoutProps {
    sidebar: ReactNode;
    children: ReactNode;
}

export default function ManagerPageLayout({ sidebar, children }: ManagerPageLayoutProps) {
    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 h-full w-full min-h-0 overflow-hidden">
            {/* Component 1: Left Dashboard Sidebar Control Panel */}
            <aside className="w-full lg:w-80 shrink-0 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs flex flex-col overflow-y-auto min-h-0 space-y-5">
                {sidebar}
            </aside>

            {/* Component 2: Right Main Data Table Area */}
            <main className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
