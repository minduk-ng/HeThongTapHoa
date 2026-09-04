import { usePage, router } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import SettingsOtpOverlay from './components/SettingsOtpOverlay';

const getCookie = (name: string): string => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
return decodeURIComponent(parts.pop()?.split(';').shift() || '');
}

    return '';
};

export default function Settings() {
    const { auth } = usePage().props as any;
    const user = auth.user;

    // Name editing states
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameVal, setNameVal] = useState(user.name);
    const [nameError, setNameError] = useState<string | null>(null);

    // Email editing states
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [emailVal, setEmailVal] = useState(user.email);
    const [emailError, setEmailError] = useState<string | null>(null);

    // Password states
    const [currentPass, setCurrentPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [passError, setPassError] = useState<string | null>(null);
    const [passSuccess, setPassSuccess] = useState<string | null>(null);

    // Persistent OTP Resend Cooldown states
    const [resendCooldown, setResendCooldown] = useState(0);
    const [cooldownMultiplier, setCooldownMultiplier] = useState(60);

    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => {
                setResendCooldown((prev) => prev - 1);
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    // OTP Overlay states
    const [otpConfig, setOtpConfig] = useState<{ email: string; verifyUrl: string } | null>(null);

    const handleUpdateName = async () => {
        if (!nameVal.trim()) {
            setNameError('Tên không được để trống.');

            return;
        }

        try {
            const response = await fetch('/profile/update-name', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
                },
                body: JSON.stringify({ name: nameVal })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                setIsEditingName(false);
                setNameError(null);
                router.reload();
            } else {
                setNameError(result.errors?.name || 'Cập nhật tên thất bại.');
            }
        } catch {
            setNameError('Đã có lỗi xảy ra.');
        }
    };

    const handleUpdateEmail = async () => {
        if (!emailVal.trim()) {
            setEmailError('Email không được để trống.');

            return;
        }

        try {
            const response = await fetch('/profile/update-email', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
                },
                body: JSON.stringify({ email: emailVal })
            });
            const result = await response.json();

            if (response.ok && result.requires_otp) {
                setEmailError(null);
                setOtpConfig({
                    email: emailVal,
                    verifyUrl: '/profile/verify-email-otp'
                });
            } else {
                setEmailError(result.errors?.email || 'Email không hợp lệ hoặc đã được sử dụng.');
            }
        } catch {
            setEmailError('Đã có lỗi xảy ra.');
        }
    };

    const handleSavePassword = async () => {
        setPassError(null);
        setPassSuccess(null);

        if (!newPass || newPass.length < 8) {
            setPassError('Mật khẩu mới phải có tối thiểu 8 ký tự.');

            return;
        }

        if (newPass !== confirmPass) {
            setPassError('Mật khẩu xác nhận không khớp.');

            return;
        }

        if (!user.has_password) {
            // Direct setup
            try {
                const response = await fetch('/profile/setup-password', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
                    },
                    body: JSON.stringify({
                        password: newPass,
                        password_confirmation: confirmPass
                    })
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    setNewPass('');
                    setConfirmPass('');
                    setPassSuccess('Đã thiết lập mật khẩu thành công.');
                    router.reload();
                } else {
                    setPassError(result.errors?.password || 'Thiết lập mật khẩu thất bại.');
                }
            } catch {
                setPassError('Đã có lỗi xảy ra.');
            }
        } else {
            // Requires verification
            if (!currentPass) {
                setPassError('Vui lòng nhập mật khẩu cũ.');

                return;
            }

            try {
                const response = await fetch('/profile/change-password', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
                    },
                    body: JSON.stringify({
                        current_password: currentPass,
                        password: newPass,
                        password_confirmation: confirmPass
                    })
                });
                const result = await response.json();

                if (response.ok && result.requires_otp) {
                    setOtpConfig({
                        email: user.email,
                        verifyUrl: '/profile/verify-password-otp'
                    });
                } else {
                    setPassError(result.errors?.current_password || result.errors?.password || 'Đổi mật khẩu thất bại.');
                }
            } catch {
                setPassError('Đã có lỗi xảy ra.');
            }
        }
    };

    const handleOtpSuccess = () => {
        setOtpConfig(null);
        setIsEditingEmail(false);
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
        setPassSuccess('Cập nhật thành công.');
        router.reload();
    };

    return (
        <>
            <DashboardLayout>
                <div className="mb-6">
                    <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100">Cài đặt tài khoản</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Quản lý thông tin hồ sơ và bảo mật của bạn</p>
                </div>

                {/* Outer container wrapping both panels - 1:2 column ratio split */}
                <div className="relative py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        
                        {/* Left Column (1/3 width) - Profile Details */}
                        <div className="md:col-span-1 flex flex-col items-center justify-center text-center space-y-6 md:border-r md:border-zinc-100 dark:md:border-zinc-800 md:pr-8 py-4">
                            <div className="relative">
                                {user.avatar ? (
                                    <img src={user.avatar} alt="Avatar" className="h-28 w-28 rounded-full border-4 border-sky-50 dark:border-sky-950/40 object-cover shadow-sm" />
                                ) : (
                                    <div className="avatar-placeholder h-28 w-28 text-3xl font-bold rounded-full border-4 border-sky-50 dark:border-sky-950/40 shadow-sm">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="w-full space-y-4">
                                {isEditingName ? (
                                    <div className="space-y-2 max-w-xs mx-auto">
                                        <input
                                            type="text"
                                            value={nameVal}
                                            onChange={(e) => setNameVal(e.target.value)}
                                            className="input-field text-center"
                                        />
                                        {nameError && <p className="text-xs text-red-500">{nameError}</p>}
                                        <div className="flex gap-2 justify-center">
                                            <button onClick={handleUpdateName} className="btn-primary py-1.5 text-xs w-auto px-4 font-semibold">
                                                Lưu
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsEditingName(false);
                                                    setNameVal(user.name);
                                                    setNameError(null);
                                                }}
                                                className="btn-secondary py-1.5 text-xs w-auto px-4"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <h3 className="font-display text-xl font-bold text-zinc-800 dark:text-zinc-100">
                                                {user.name}
                                            </h3>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-1">
                                                {user.email}
                                            </p>
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Người dùng</p>
                                        </div>
                                        <button onClick={() => setIsEditingName(true)} className="btn-secondary py-1.5 text-xs w-auto px-6">
                                            Sửa thông tin
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column (2/3 width) - Security Settings */}
                        <div className="md:col-span-2 space-y-6 md:pl-8 py-4">
                            <h2 className="font-display text-lg font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                Bảo mật tài khoản
                            </h2>

                            {/* Email Section */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                    Địa chỉ email
                                </label>
                                {isEditingEmail ? (
                                    <div className="space-y-2">
                                        <input
                                            type="email"
                                            value={emailVal}
                                            onChange={(e) => setEmailVal(e.target.value)}
                                            className="input-field"
                                        />
                                        {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                                        <div className="flex gap-2">
                                            <button onClick={handleUpdateEmail} className="btn-primary py-1.5 text-xs w-auto px-4 font-semibold">
                                                Lưu
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsEditingEmail(false);
                                                    setEmailVal(user.email);
                                                    setEmailError(null);
                                                }}
                                                className="btn-secondary py-1.5 text-xs w-auto px-4"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                                        <span className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">
                                            {user.email}
                                        </span>
                                        <button onClick={() => setIsEditingEmail(true)} className="btn-secondary py-1.5 text-xs w-auto px-4">
                                            Sửa
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Password Section */}
                            <div className="space-y-4 border-t border-zinc-100 dark:border-zinc-800 pt-6">
                                <div>
                                    <h3 className="font-display text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                                        {user.has_password ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu'}
                                    </h3>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {user.has_password
                                            ? 'Yêu cầu xác nhận mật khẩu cũ.'
                                            : 'Tài khoản chưa cài đặt mật khẩu. Hãy thiết lập mật khẩu ngay.'}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {user.has_password && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-zinc-500 dark:text-zinc-400">Mật khẩu cũ</label>
                                            <input
                                                type="password"
                                                value={currentPass}
                                                onChange={(e) => setCurrentPass(e.target.value)}
                                                className="input-field"
                                                placeholder="Nhập mật khẩu hiện tại"
                                            />
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-zinc-500 dark:text-zinc-400">Mật khẩu mới</label>
                                        <input
                                            type="password"
                                            value={newPass}
                                            onChange={(e) => setNewPass(e.target.value)}
                                            className="input-field"
                                            placeholder="Tối thiểu 8 ký tự"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-zinc-500 dark:text-zinc-400">Xác nhận mật khẩu mới</label>
                                        <input
                                            type="password"
                                            value={confirmPass}
                                            onChange={(e) => setConfirmPass(e.target.value)}
                                            className="input-field"
                                            placeholder="Nhập lại mật khẩu mới"
                                        />
                                    </div>

                                    {passError && <p className="text-xs text-red-500">{passError}</p>}
                                    {passSuccess && <p className="text-xs text-green-500">{passSuccess}</p>}

                                    <button onClick={handleSavePassword} className="btn-primary py-2 text-xs font-semibold">
                                        Lưu mật khẩu
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardLayout>

            {otpConfig && (
                <SettingsOtpOverlay
                    email={otpConfig.email}
                    verifyUrl={otpConfig.verifyUrl}
                    resendCooldown={resendCooldown}
                    setResendCooldown={setResendCooldown}
                    cooldownMultiplier={cooldownMultiplier}
                    setCooldownMultiplier={setCooldownMultiplier}
                    onSuccess={handleOtpSuccess}
                    onClose={() => setOtpConfig(null)}
                />
            )}
        </>
    );
}
