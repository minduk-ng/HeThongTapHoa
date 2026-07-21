import { ReactNode, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { usePage } from '@inertiajs/react';

interface DashboardLayoutProps {
    children: ReactNode;
    fullWidth?: boolean;
}

export default function DashboardLayout({ children, fullWidth = false }: DashboardLayoutProps) {
    const { flash } = usePage().props as any;
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (flash?.success) {
            setNotification({ type: 'success', message: flash.success });
            const timer = setTimeout(() => setNotification(null), 4000);
            return () => clearTimeout(timer);
        } else if (flash?.error) {
            setNotification({ type: 'error', message: flash.error });
            const timer = setTimeout(() => setNotification(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [flash]);

    return (
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800 transition-colors duration-150 dark:bg-slate-900 dark:text-slate-100">
            {/* Top Navigation Bar Header */}
            <Sidebar />
            
            <main className="relative flex flex-1 flex-col w-full">
                {/* Floating Notification Toast */}
                {notification && (
                    <div className="fixed top-20 right-6 z-50 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg transition-all duration-200 dark:border-slate-700 dark:bg-slate-800 max-w-sm">
                        {notification.type === 'success' ? (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        )}
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {notification.message}
                        </div>
                        <button onClick={() => setNotification(null)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Main Content Container */}
                <div className={`relative z-10 flex-1 w-full ${fullWidth ? 'p-3 flex flex-col' : 'max-w-7xl mx-auto p-6 md:p-8'}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
