import { useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

interface ForgotPasswordProps {
    onBack: () => void;
}

export default function ForgotPassword({ onBack }: ForgotPasswordProps) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/forgot-password');
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                    <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                </div>
                <h2 className="auth-heading">Quên mật khẩu?</h2>
                <p className="mt-2 auth-subtitle">
                    Không sao cả, chuyện này vẫn thường xảy ra. Vui lòng nhập địa chỉ email liên kết với tài khoản của bạn.
                </p>
            </div>

            <div>
                <label htmlFor="forgot-email" className="form-label">
                    Email
                </label>
                <input
                    id="forgot-email"
                    type="email"
                    value={data.email}
                    onChange={(e) => setData('email', e.target.value)}
                    className="input-field"
                    placeholder="you@example.com"
                    required
                />
                {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <button
                type="submit"
                disabled={processing}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {processing ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Đang gửi yêu cầu...
                    </span>
                ) : (
                    'Gửi mã xác nhận'
                )}
            </button>

            <button
                type="button"
                onClick={onBack}
                className="flex w-full items-center justify-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Quay lại đăng nhập
            </button>
        </form>
    );
}
