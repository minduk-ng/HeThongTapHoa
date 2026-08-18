import { useForm, router, usePage } from '@inertiajs/react';
import type { FormEvent} from 'react';
import { useEffect, useRef, useState } from 'react';

interface OtpVerifyProps {
    email: string;
    type: 'signup' | 'reset_password';
}

const getCookie = (name: string): string => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
return decodeURIComponent(parts.pop()?.split(';').shift() || '');
}

    return '';
};

export default function OtpVerify({ email }: OtpVerifyProps) {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [localError, setLocalError] = useState<string | null>(null);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);
    const { errors } = usePage().props as any;

    const { setData } = useForm({
        code: '',
    });

    const { post: postResend, processing: resendProcessing } = useForm();

    const [resendCooldown, setResendCooldown] = useState(60);
    const [cooldownMultiplier, setCooldownMultiplier] = useState(60);
    const [otpExpirationCooldown, setOtpExpirationCooldown] = useState(600); // 10 minutes in seconds

    // Countdown effect for OTP expiration
    useEffect(() => {
        if (otpExpirationCooldown > 0) {
            const timer = setTimeout(() => {
                setOtpExpirationCooldown((prev) => prev - 1);
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [otpExpirationCooldown]);

    // Countdown effect for resend
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => {
                setResendCooldown((prev) => prev - 1);
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    // Auto focus first input on mount
    useEffect(() => {
        inputs.current[0]?.focus();
    }, []);

    const handleChange = (element: HTMLInputElement, index: number) => {
        if (element.value && isNaN(Number(element.value))) {
return false;
}

        const val = element.value;
        const nextOtp = otp.map((d, idx) => (idx === index ? val : d));
        setOtp(nextOtp);

        // Focus next input
        if (val !== '' && index < 5) {
            inputs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace') {
            if (!otp[index] && index > 0) {
                const nextOtp = [...otp];
                nextOtp[index - 1] = '';
                setOtp(nextOtp);
                inputs.current[index - 1]?.focus();
            } else if (otp[index]) {
                const nextOtp = [...otp];
                nextOtp[index] = '';
                setOtp(nextOtp);
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');

        if (pastedData.some((char) => isNaN(Number(char)))) {
return;
}

        const newOtp = [...otp];
        pastedData.forEach((char, index) => {
            if (index < 6) {
newOtp[index] = char;
}
        });
        setOtp(newOtp);

        const focusIndex = Math.min(pastedData.length, 5);
        inputs.current[focusIndex]?.focus();
    };

    // Keep code in sync with otp array
    useEffect(() => {
        setData('code', otp.join(''));
    }, [otp, setData]);

    const verifyOtpCode = async (code: string) => {
        setStatus('processing');
        setLocalError(null);

        try {
            const csrfToken = getCookie('XSRF-TOKEN');
            const response = await fetch('/verify-otp', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ code })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                setStatus('success');
                // Hold for 800ms to show green validation before redirecting
                setTimeout(() => {
                    router.visit(result.redirect);
                }, 800);
            } else {
                setStatus('error');
                const msg = result.errors?.code || 'Mã xác thực không chính xác hoặc đã hết hạn.';
                setLocalError(msg);

                // Hold error state for 500ms (animation duration) then reset and focus
                setTimeout(() => {
                    setOtp(['', '', '', '', '', '']);
                    setStatus('idle');
                    inputs.current[0]?.focus();
                }, 500);
            }
        } catch {
            setStatus('error');
            setLocalError('Đã xảy ra lỗi kết nối. Vui lòng thử lại.');
            setTimeout(() => {
                setOtp(['', '', '', '', '', '']);
                setStatus('idle');
                inputs.current[0]?.focus();
            }, 500);
        }
    };

    // Auto submit when all 6 digits are filled
    useEffect(() => {
        const code = otp.join('');

        if (code.length === 6 && status === 'idle') {
            queueMicrotask(() => verifyOtpCode(code));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otp]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const code = otp.join('');

        if (code.length === 6) {
            verifyOtpCode(code);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;

        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleResend = () => {
        if (resendCooldown > 0) {
return;
}

        postResend('/resend-otp', {
            onSuccess: () => {
                setOtp(['', '', '', '', '', '']);
                setStatus('idle');
                setLocalError(null);
                inputs.current[0]?.focus();
                
                setResendCooldown(cooldownMultiplier);
                setCooldownMultiplier((prev) => prev * 2);
                setOtpExpirationCooldown(600); // Reset OTP expiration back to 10 minutes
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center">
                <h2 className="auth-heading">Xác thực OTP</h2>
                <p className="mt-2 auth-subtitle">
                    Vui lòng nhập mã gồm 6 chữ số đã được gửi đến <br />
                    <span className="font-medium text-gray-900 dark:text-gray-200">{email}</span>
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold">
                    {otpExpirationCooldown > 0 
                        ? `Mã OTP có hiệu lực trong vòng ${formatTime(otpExpirationCooldown)}` 
                        : "Mã OTP đã hết hiệu lực. Vui lòng gửi lại mã."}
                </p>
            </div>

            <div className="flex justify-center gap-2 sm:gap-3">
                {otp.map((dataVal, index) => {
                    let inputClass = 'otp-input-field transition-all duration-200';

                    if (status === 'error') {
                        inputClass += ' otp-input-error';
                    } else if (status === 'success') {
                        inputClass += ' otp-input-success';
                    } else if (status === 'processing') {
                        inputClass += ' animate-pulse border-indigo-400';
                    }

                    return (
                        <input
                            className={inputClass}
                            type="text"
                            name="otp"
                            maxLength={1}
                            key={index}
                            value={dataVal}
                            onChange={(e) => handleChange(e.target, index)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            onPaste={handlePaste}
                            disabled={status === 'processing' || status === 'success'}
                            ref={(el) => {
 inputs.current[index] = el; 
}}
                        />
                    );
                })}
            </div>

            {(localError || errors.code) && <p className="form-error text-center">{localError || errors.code}</p>}

            <button
                type="submit"
                disabled={status === 'processing' || status === 'success' || otp.join('').length !== 6}
                className="btn-primary"
            >
                {status === 'processing' ? 'Đang xác thực...' : status === 'success' ? 'Xác thực thành công!' : 'Xác thực'}
            </button>

            <p className="auth-footer">
                Chưa nhận được mã?{' '}
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendProcessing || resendCooldown > 0 || status === 'processing' || status === 'success'}
                    className="link-primary disabled:opacity-50"
                >
                    {resendProcessing ? 'Đang gửi...' : resendCooldown > 0 ? `Gửi lại mã (${resendCooldown}s)` : 'Gửi lại mã'}
                </button>
            </p>
        </form>
    );
}
