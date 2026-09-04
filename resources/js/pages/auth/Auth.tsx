import { Head, router } from '@inertiajs/react';
import { Store } from 'lucide-react';
import ThemeToggle from '../../components/ThemeToggle';
import ForgotPassword from './components/ForgotPassword';
import LoginForm from './components/LoginForm';
import OtpVerify from './components/OtpVerify';
import ResetPassword from './components/ResetPassword';
import SignupForm from './components/SignupForm';

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
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-50 transition-colors duration-300 dark:bg-zinc-950">
            <Head title={titles[step]} />
            <ThemeToggle />

            {/* Decorative background elements */}
            <div className="absolute top-0 -left-4 h-72 w-72 rounded-full bg-sky-300 opacity-20 mix-blend-multiply blur-3xl filter animate-blob dark:bg-sky-900 dark:opacity-20" />
            <div className="absolute top-0 -right-4 h-72 w-72 rounded-full bg-sky-200 opacity-20 mix-blend-multiply blur-3xl filter animate-blob animation-delay-2000 dark:bg-sky-950 dark:opacity-20" />
            <div className="absolute -bottom-8 left-20 h-72 w-72 rounded-full bg-zinc-300 opacity-20 mix-blend-multiply blur-3xl filter animate-blob animation-delay-4000 dark:bg-zinc-800 dark:opacity-20" />

            <div className="relative z-10 w-full max-w-md px-6 py-12">
                <div className="rounded-3xl bg-white p-8 shadow-lg border border-zinc-200 dark:border-zinc-800 transition-colors duration-200 dark:bg-zinc-900">
                    <div className="mb-8 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-600 shadow-xs text-white">
                            <Store className="h-8 w-8 text-white stroke-[1.5]" />
                        </div>
                    </div>

                    <div className="transition-colors duration-200">
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
