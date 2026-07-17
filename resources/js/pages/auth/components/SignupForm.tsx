import { useForm } from '@inertiajs/react';
import { useState } from 'react';
import GoogleButton from './GoogleButton';

interface SignupFormProps {
    onSwitchToLogin: () => void;
}

export default function SignupForm({ onSwitchToLogin }: SignupFormProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/signup');
    };

    const inputClass = 'input-field';

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center">
                <h2 className="auth-heading">Đăng ký</h2>
                <p className="mt-1 auth-subtitle">Tạo tài khoản mới</p>
            </div>

            <div>
                <label htmlFor="signup-name" className="form-label">
                    Họ và tên
                </label>
                <input
                    id="signup-name"
                    type="text"
                    value={data.name}
                    onChange={(e) => setData('name', e.target.value)}
                    className={inputClass}
                    placeholder="Nguyễn Văn A"
                    required
                />
                {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            <div>
                <label htmlFor="signup-email" className="form-label">
                    Email
                </label>
                <input
                    id="signup-email"
                    type="email"
                    value={data.email}
                    onChange={(e) => setData('email', e.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                    required
                />
                {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <div>
                <label htmlFor="signup-password" className="form-label">
                    Mật khẩu
                </label>
                <div className="relative">
                    <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        className={`${inputClass} pr-12`}
                        placeholder="Tối thiểu 8 ký tự"
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

            <div>
                <label htmlFor="signup-confirm" className="form-label">
                    Xác nhận mật khẩu
                </label>
                <div className="relative">
                    <input
                        id="signup-confirm"
                        type={showConfirm ? 'text' : 'password'}
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        className={`${inputClass} pr-12`}
                        placeholder="Nhập lại mật khẩu"
                        required
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="btn-icon"
                    >
                        {showConfirm ? (
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
                {errors.password_confirmation && <p className="form-error">{errors.password_confirmation}</p>}
            </div>

            <button
                type="submit"
                disabled={processing}
                className="btn-primary"
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
                    'Đăng ký'
                )}
            </button>

            <div className="form-divider">
                <div className="form-divider-line" />
                <span className="form-divider-text">hoặc</span>
                <div className="form-divider-line" />
            </div>

            <GoogleButton text="Đăng ký với Google" />

            <p className="auth-footer">
                Đã có tài khoản?{' '}
                <button type="button" onClick={onSwitchToLogin} className="link-primary">
                    Đăng nhập
                </button>
            </p>
        </form>
    );
}
