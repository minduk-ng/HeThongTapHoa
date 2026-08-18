import { useForm } from '@inertiajs/react';
import { KeyRound, ArrowLeft, Loader2 } from 'lucide-react';
import type { FormEvent } from 'react';

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
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                    <KeyRound className="h-6 w-6 stroke-[1.5]" />
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
                    placeholder="email@example.com"
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
                        <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
                        Đang gửi yêu cầu...
                    </span>
                ) : (
                    'Gửi mã xác nhận'
                )}
            </button>

            <button
                type="button"
                onClick={onBack}
                className="flex w-full items-center justify-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
                <ArrowLeft className="h-4 w-4 stroke-[1.5]" />
                Quay lại đăng nhập
            </button>
        </form>
    );
}
