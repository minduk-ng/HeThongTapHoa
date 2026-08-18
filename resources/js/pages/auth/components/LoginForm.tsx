import { useForm } from '@inertiajs/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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
        if (!email || !email.includes('@')) {
return;
}

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
    }, [failedAttempts, clearErrors, setData]);

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
                            <EyeOff className="h-5 w-5 stroke-[1.5]" />
                        ) : (
                            <Eye className="h-5 w-5 stroke-[1.5]" />
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
                    className="link-primary text-sm dark:hover:text-sky-300"
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
                        <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
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
