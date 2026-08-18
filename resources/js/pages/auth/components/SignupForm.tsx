import { useForm } from '@inertiajs/react';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="email@example.com"
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
                            <EyeOff className="h-5 w-5 stroke-[1.5]" />
                        ) : (
                            <Eye className="h-5 w-5 stroke-[1.5]" />
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
                            <EyeOff className="h-5 w-5 stroke-[1.5]" />
                        ) : (
                            <Eye className="h-5 w-5 stroke-[1.5]" />
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
                        <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
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
