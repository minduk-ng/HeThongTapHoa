import { Head, router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { Store } from 'lucide-react';
import ForgotPassword from './components/ForgotPassword';
import LoginForm from './components/LoginForm';
import OtpVerify from './components/OtpVerify';
import ResetPassword from './components/ResetPassword';
import SignupForm from './components/SignupForm';
import ThemeToggle from '../../components/ThemeToggle';

interface AuthPageProps {
    step: 'login' | 'signup' | 'otp' | 'forgot' | 'reset';
    email?: string;
    otpType?: 'signup' | 'reset_password';
}

export default function Auth({ step, email, otpType }: AuthPageProps) {
    const titles = {
        login: 'Đăng nhập',
        signup: 'Đăng ký',
        otp: 'Xác thực OTP',
        forgot: 'Quên mật khẩu',
        reset: 'Đặt lại mật khẩu',
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 transition-colors duration-300 dark:bg-slate-900">
            <Head title={titles[step]} />
            <ThemeToggle />

            {/* Decorative background elements */}
            <div className="absolute top-0 -left-4 h-72 w-72 rounded-full bg-sky-300 opacity-20 mix-blend-multiply blur-3xl filter animate-blob dark:bg-sky-900 dark:opacity-20" />
            <div className="absolute top-0 -right-4 h-72 w-72 rounded-full bg-sky-200 opacity-20 mix-blend-multiply blur-3xl filter animate-blob animation-delay-2000 dark:bg-sky-950 dark:opacity-20" />
            <div className="absolute -bottom-8 left-20 h-72 w-72 rounded-full bg-slate-300 opacity-20 mix-blend-multiply blur-3xl filter animate-blob animation-delay-4000 dark:bg-slate-800 dark:opacity-20" />

            <div className="relative z-10 w-full max-w-md px-6 py-12">
                <div className="rounded-3xl bg-white/90 p-8 shadow-2xl backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 transition-all duration-300 dark:bg-slate-800/90">
                    <div className="mb-8 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 shadow-md shadow-sky-500/20">
                            <Store className="h-8 w-8 text-white stroke-[1.5]" />
                        </div>
                    </div>

                    <div className="transition-all duration-300">
                        {step === 'login' && (
                            <LoginForm
                                onSwitchToSignup={() => router.visit('/signup')}
                                onSwitchToForgot={() => router.visit('/forgot-password')}
                            />
                        )}
                        {step === 'signup' && <SignupForm onSwitchToLogin={() => router.visit('/login')} />}
                        {step === 'otp' && email && otpType && <OtpVerify email={email} type={otpType} />}
                        {step === 'forgot' && <ForgotPassword onBack={() => router.visit('/login')} />}
                        {step === 'reset' && <ResetPassword />}
                    </div>
                </div>
            </div>
        </div>
    );
}
