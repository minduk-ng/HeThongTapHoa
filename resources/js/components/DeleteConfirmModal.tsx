import React from 'react';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    passwordValue: string;
    onPasswordChange: (value: string) => void;
    onClose: () => void;
    onConfirm: (e: React.FormEvent) => void;
    processing?: boolean;
    errorMsg?: string | null;
}

export default function DeleteConfirmModal({
    isOpen,
    title,
    description,
    passwordValue,
    onPasswordChange,
    onClose,
    onConfirm,
    processing = false,
    errorMsg,
}: DeleteConfirmModalProps) {
    if (!isOpen) {
return null;
}

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-md">
                <h2 className="modal-heading text-red-600 dark:text-red-400">
                    {title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {description}
                </p>
                <form onSubmit={onConfirm} className="space-y-4">
                    <div>
                        <label className="form-label">Mật khẩu xác nhận</label>
                        <input
                            type="password"
                            value={passwordValue}
                            onChange={(e) => onPasswordChange(e.target.value)}
                            className="input-field"
                            placeholder="••••••••"
                            required
                            disabled={processing}
                        />
                        {errorMsg && (
                            <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                                {errorMsg}
                            </p>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="btn-secondary"
                            disabled={processing}
                        >
                            Hủy
                        </button>
                        <button 
                            type="submit" 
                            className="btn-primary bg-red-600 hover:bg-red-700 w-auto font-semibold"
                            disabled={processing}
                        >
                            Xác nhận xóa
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
