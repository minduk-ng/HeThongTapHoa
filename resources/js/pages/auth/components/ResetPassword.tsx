import { useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function ResetPassword() {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const { data, setData, post, processing, errors } = useForm({
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/reset-password');
    };

    const inputClass = 'input-field';

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center">
                <h2 className="auth-heading">Đặt lại mật khẩu</h2>
                <p className="mt-2 auth-subtitle">Vui lòng nhập mật khẩu mới của bạn.</p>
            </div>

            <div>
                <label htmlFor="reset-password" className="form-label">
                    Mật khẩu mới
                </label>
                <div className="relative">
                    <input
                        id="reset-password"
                        type={showPassword ? 'text' : 'password'}
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        className={`${inputClass} pr-12`}
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
                <label htmlFor="reset-confirm" className="form-label">
                    Xác nhận mật khẩu
                </label>
                <div className="relative">
                    <input
                        id="reset-confirm"
                        type={showConfirm ? 'text' : 'password'}
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        className={`${inputClass} pr-12`}
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
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {processing ? (
                    <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
                        Đang cập nhật...
                    </span>
                ) : (
                    'Cập nhật mật khẩu'
                )}
            </button>
        </form>
    );
}
