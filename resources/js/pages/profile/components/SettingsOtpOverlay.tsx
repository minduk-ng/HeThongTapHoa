import { useEffect, useRef, useState } from 'react';

interface SettingsOtpOverlayProps {
    email: string;
    verifyUrl: string;
    resendCooldown: number;
    setResendCooldown: React.Dispatch<React.SetStateAction<number>>;
    cooldownMultiplier: number;
    setCooldownMultiplier: React.Dispatch<React.SetStateAction<number>>;
    onSuccess: (updatedUser: any) => void;
    onClose: () => void;
}

const getCookie = (name: string): string => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
return decodeURIComponent(parts.pop()?.split(';').shift() || '');
}

    return '';
};

export default function SettingsOtpOverlay({
    email,
    verifyUrl,
    resendCooldown,
    setResendCooldown,
    cooldownMultiplier,
    setCooldownMultiplier,
    onSuccess,
    onClose
}: SettingsOtpOverlayProps) {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resendProcessing, setResendProcessing] = useState(false);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        inputs.current[0]?.focus();
    }, []);

    const handleChange = (element: HTMLInputElement, index: number) => {
        if (element.value && isNaN(Number(element.value))) {
return;
}

        const val = element.value;
        const nextOtp = otp.map((d, idx) => (idx === index ? val : d));
        setOtp(nextOtp);

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

    const verifyOtp = async (code: string) => {
        setStatus('processing');
        setErrorMsg(null);

        try {
            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
                },
                body: JSON.stringify({ code })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                setStatus('success');
                setTimeout(() => {
                    onSuccess(result.user);
                }, 800);
            } else {
                setStatus('error');
                setErrorMsg(result.errors?.code || 'Mã xác thực không chính xác.');
                setTimeout(() => {
                    setOtp(['', '', '', '', '', '']);
                    setStatus('idle');
                    inputs.current[0]?.focus();
                }, 500);
            }
        } catch {
            setStatus('error');
            setErrorMsg('Có lỗi kết nối xảy ra.');
            setTimeout(() => {
                setOtp(['', '', '', '', '', '']);
                setStatus('idle');
                inputs.current[0]?.focus();
            }, 500);
        }
    };

    useEffect(() => {
        const code = otp.join('');

        if (code.length === 6 && status === 'idle') {
            queueMicrotask(() => verifyOtp(code));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otp]);

    const handleResend = async () => {
        if (resendCooldown > 0 || resendProcessing) {
return;
}

        setResendProcessing(true);

        try {
            const response = await fetch('/resend-otp', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
                }
            });

            if (response.ok) {
                setOtp(['', '', '', '', '', '']);
                setStatus('idle');
                setErrorMsg(null);
                inputs.current[0]?.focus();
                setResendCooldown(cooldownMultiplier);
                setCooldownMultiplier(prev => prev * 2);
            }
        } catch {
            // Ignore resend network error silently
        } finally {
            setResendProcessing(false);
        }
    };

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(24, 24, 27, 0.6)',
                backdropFilter: 'blur(4px)',
                padding: '1rem',
            }}
        >
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="text-center">
                    <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">Xác thực OTP</h3>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Nhập mã 6 số đã được gửi đến <span className="font-semibold">{email}</span>
                    </p>
                </div>

                <div className="my-6 flex justify-center gap-2">
                    {otp.map((v, i) => {
                        let fieldClass = 'otp-input-field transition-colors duration-200';

                        if (status === 'error') {
                            fieldClass += ' otp-input-error';
                        }

                        if (status === 'success') {
                            fieldClass += ' otp-input-success';
                        }

                        if (status === 'processing') {
                            fieldClass += ' animate-pulse border-sky-400';
                        }

                        return (
                            <input
                                key={i}
                                ref={(el) => {
                                    inputs.current[i] = el;
                                }}
                                type="text"
                                maxLength={1}
                                className={fieldClass}
                                value={v}
                                onChange={(e) => handleChange(e.target, i)}
                                onKeyDown={(e) => handleKeyDown(e, i)}
                                onPaste={handlePaste}
                                disabled={status === 'processing' || status === 'success'}
                            />
                        );
                    })}
                </div>

                {errorMsg && <p className="mb-4 text-center text-xs text-red-500">{errorMsg}</p>}

                <div className="flex items-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary flex-1 py-2.5 text-xs font-semibold hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 dark:hover:text-rose-400 border-zinc-200 dark:border-zinc-700"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendProcessing || resendCooldown > 0 || status === 'processing' || status === 'success'}
                        className="btn-primary flex-1 py-2.5 text-xs font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {resendProcessing ? 'Đang gửi...' : resendCooldown > 0 ? `Gửi lại (${resendCooldown}s)` : 'Gửi lại mã'}
                    </button>
                </div>
            </div>
        </div>
    );
}
