import { Head, usePage } from '@inertiajs/react';
import type { PageProps } from './../types/auth';
import DashboardLayout from '../layouts/DashboardLayout';
export default function Welcome() {
    const { auth } = usePage<PageProps>().props;
    const { user } = auth;

    return (
        <DashboardLayout>
            <Head title="Trang chủ" />
            
            <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 dark:bg-slate-800 dark:ring-white/10 text-center space-y-6 max-w-2xl">
                <div>
                    <h1 className="page-heading text-3xl">
                        Chào mừng trở lại, {user?.name}!
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-4 text-lg">
                        Đây là trang tổng quan. Hãy chọn chức năng từ menu bên trái.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    );
}
