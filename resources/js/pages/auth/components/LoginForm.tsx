import { useForm } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import GoogleButton from './GoogleButton';

// Khai báo khai sinh biến grecaptcha toàn cục cho TypeScript
declare global {
    interface Window {
        grecaptcha: any;
    }
}

interface LoginFormProps {
    onSwitchToSignup: () => void;
    onSwitchToForgot: () => void;
}

export default function LoginForm({ onSwitchToSignup, onSwitchToForgot }: LoginFormProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState(0);

    const { data, setData, post, processing, errors, setError, clearErrors } = useForm({
        email: '',
        password: '',
        remember: false,
        recaptcha_token: '',
    });

    // Hàm gọi API check số lần sai khi rời ô nhập email (onBlur)
    const checkEmailAttempts = async (email: string) => {
        if (!email || !email.includes('@')) return;
        try {
            const res = await fetch('/login/check-attempts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                const result = await res.json();
                setFailedAttempts(result.failed_attempts || 0);
            }
        } catch (e) {
            console.error('Lỗi check attempts:', e);
        }
    };

    // Theo dõi và gọi explicit render reCAPTCHA v2
    useEffect(() => {
        const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
        if (failedAttempts >= 5 && siteKey) {
            const initCaptcha = () => {
                if (window.grecaptcha && window.grecaptcha.render) {
                    const container = document.getElementById('recaptcha-container');
                    if (container && container.innerHTML === '') {
                        window.grecaptcha.render('recaptcha-container', {
                            sitekey: siteKey,
                            callback: (token: string) => {
                                setData('recaptcha_token', token);
                                clearErrors('recaptcha_token');
                            },
                            'expired-callback': () => {
                                setData('recaptcha_token', '');
                            },
                        });
                    }
                } else {
                    setTimeout(initCaptcha, 300);
                }
            };
            initCaptcha();
        } else {
            setData('recaptcha_token', '');
        }
    }, [failedAttempts]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (failedAttempts >= 5 && !data.recaptcha_token) {
            setError('recaptcha_token', 'Vui lòng hoàn thành xác thực reCAPTCHA.');
            return;
        }
        post('/login', {
            onError: () => {
                // Tăng số lần sai cục bộ khi gửi thất bại
                setFailedAttempts(prev => prev + 1);
                // Reset recaptcha checkbox
                if (window.grecaptcha && window.grecaptcha.reset) {
                    try {
                        window.grecaptcha.reset();
                    } catch (err) {
                        console.error('Lỗi reset recaptcha:', err);
                    }
                }
                setData('recaptcha_token', '');
            }
        });
    };

    const isSubmitDisabled = processing || (failedAttempts >= 5 && !data.recaptcha_token);

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center">
                <h2 className="auth-heading">Đăng nhập</h2>
                <p className="mt-1 auth-subtitle">Chào mừng bạn trở lại</p>
            </div>

            <div>
                <label htmlFor="login-email" className="form-label">
                    Email
                </label>
                <input
                    id="login-email"
                    type="email"
                    value={data.email}
                    onChange={(e) => setData('email', e.target.value)}
                    onBlur={(e) => checkEmailAttempts(e.target.value)}
                    className="input-field"
                    placeholder="you@example.com"
                    required
                />
                {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <div>
                <label htmlFor="login-password" className="form-label">
                    Mật khẩu
                </label>
                <div className="relative">
                    <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        className="input-field pr-12"
                        placeholder="••••••••"
                        required
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="btn-icon"
                    >
                        {showPassword ? (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                        ) : (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        )}
                    </button>
                </div>
                {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            {/* Google reCAPTCHA v2 explicit container */}
            {failedAttempts >= 5 && (
                <div className="my-4 flex flex-col items-center justify-center">
                    <div id="recaptcha-container" className="g-recaptcha"></div>
                    {errors.recaptcha_token && (
                        <p className="form-error mt-2 text-center">{errors.recaptcha_token}</p>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                        type="checkbox"
                        checked={data.remember}
                        onChange={(e) => setData('remember', e.target.checked)}
                        className="checkbox-field"
                    />
                    Ghi nhớ
                </label>
                <button
                    type="button"
                    onClick={onSwitchToForgot}
                    className="link-primary text-sm dark:hover:text-indigo-300"
                >
                    Quên mật khẩu?
                </button>
            </div>

            <button
                type="submit"
                disabled={isSubmitDisabled}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {processing ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Đang xử lý...
                    </span>
                ) : (
                    'Đăng nhập'
                )}
            </button>

            <div className="form-divider">
                <div className="form-divider-line" />
                <span className="form-divider-text">hoặc</span>
                <div className="form-divider-line" />
            </div>

            <GoogleButton text="Đăng nhập với Google" />

            <p className="auth-footer">
                Chưa có tài khoản?{' '}
                <button type="button" onClick={onSwitchToSignup} className="link-primary">
                    Đăng ký
                </button>
            </p>
        </form>
    );
}
