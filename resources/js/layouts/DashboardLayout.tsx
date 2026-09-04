import { usePage } from '@inertiajs/react';
import { Check, AlertTriangle, X } from 'lucide-react';
import type { ReactNode} from 'react';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

interface DashboardLayoutProps {
    children: ReactNode;
    fullWidth?: boolean;
    hideNavbar?: boolean;
}

export default function DashboardLayout({ children, fullWidth = false, hideNavbar = false }: DashboardLayoutProps) {
    const { flash } = usePage().props as any;
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (!flash?.success && !flash?.error) {
            return;
        }

        const type = flash?.success ? 'success' : 'error';
        const message = flash?.success || flash?.error || '';

        queueMicrotask(() => {
            setNotification({ type, message });
        });
        const timer = setTimeout(() => setNotification(null), 4000);

        return () => clearTimeout(timer);
    }, [flash]);

    return (
        <div className={`flex flex-col bg-slate-50 text-slate-800 transition-colors duration-150 dark:bg-slate-900 dark:text-slate-100 ${
            fullWidth ? 'h-screen w-screen overflow-hidden' : 'min-h-screen'
        }`}>
            {/* Top Navigation Bar Header */}
            {!hideNavbar && <Sidebar />}
            
            <main className="relative flex flex-1 flex-col w-full min-h-0 overflow-hidden">
                {/* Floating Notification Toast */}
                {notification && (
                    <div className="fixed top-20 right-6 z-50 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg transition-opacity duration-150 dark:border-slate-700 dark:bg-slate-800 max-w-sm">
                        {notification.type === 'success' ? (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                                <Check className="h-5 w-5 stroke-[2]" />
                            </div>
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                                <AlertTriangle className="h-5 w-5 stroke-[1.5]" />
                            </div>
                        )}
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {notification.message}
                        </div>
                        <button
                            type="button"
                            onClick={() => setNotification(null)}
                            aria-label="Đóng thông báo"
                            className="ml-auto p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <X className="h-4 w-4 stroke-[1.5]" />
                        </button>
                    </div>
                )}

                {/* Main Content Container */}
                <div className={`relative flex-1 w-full min-h-0 ${fullWidth ? `${hideNavbar ? '' : 'p-3'} flex flex-col h-full overflow-hidden` : 'max-w-7xl mx-auto p-6 md:p-8 overflow-y-auto'}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
