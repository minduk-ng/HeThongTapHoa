import { Loader2, X } from 'lucide-react';
import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface ManagerFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    title: string;
    subtitle?: string;
    isEditing?: boolean;
    isDirty?: boolean;
    submitting?: boolean;
    submitLabel?: string;
    cancelLabel?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    formId?: string;
    children: React.ReactNode;
}

const sizeClasses: Record<string, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
};

export default function ManagerFormModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    subtitle,
    isEditing = false,
    isDirty = false,
    submitting = false,
    submitLabel,
    cancelLabel = 'Hủy',
    size = 'lg',
    formId = 'manager-form-modal',
    children,
}: ManagerFormModalProps) {
    const [showSpinner, setShowSpinner] = useState(false);
    const [showNudge, setShowNudge] = useState(false);
    const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Anti-flash spinner delay 300ms
    useEffect(() => {
        if (submitting) {
            const timer = setTimeout(() => setShowSpinner(true), 300);

            return () => {
                clearTimeout(timer);
                setShowSpinner(false);
            };
        }

        return undefined;
    }, [submitting]);

    const triggerNudge = useCallback(() => {
        if (nudgeTimerRef.current) {
            clearTimeout(nudgeTimerRef.current);
        }

        setShowNudge(true);
        nudgeTimerRef.current = setTimeout(() => {
            setShowNudge(false);
        }, 1200);
    }, []);

    useEffect(() => {
        return () => {
            if (nudgeTimerRef.current) {
                clearTimeout(nudgeTimerRef.current);
            }
        };
    }, []);

    // Backdrop click guard
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            if (isDirty) {
                triggerNudge();
            } else {
                onClose();
            }
        }
    };

    // Escape key handling
    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isDirty) {
                    triggerNudge();
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isDirty, onClose, triggerNudge]);

    if (!isOpen) {
        return null;
    }

    const defaultSubmitLabel = isEditing ? 'Lưu thay đổi' : 'Thêm mới';
    const finalSubmitLabel = submitLabel || defaultSubmitLabel;

    return (
        <div className="fixed inset-0 z-100 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
                onClick={handleBackdropClick}
                aria-hidden="true"
            />

            {/* Centered Modal Container */}
            <div
                className="fixed inset-0 z-101 flex items-center justify-center p-4 sm:p-6"
                onClick={handleBackdropClick}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={`flex w-full flex-col ${sizeClasses[size] || 'max-w-2xl'} max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl transition-all dark:border-zinc-800/80 dark:bg-zinc-900`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200/80 bg-zinc-50/50 px-6 py-4.5 dark:border-zinc-800/80 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                                        {title}
                                    </h2>
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            isEditing
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                        }`}
                                    >
                                        {isEditing ? 'Cập nhật' : 'Thêm mới'}
                                    </span>
                                </div>
                                {subtitle && (
                                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            aria-label="Đóng"
                        >
                            <X className="h-5 w-5 stroke-[1.5]" />
                        </button>
                    </div>

                    {/* Scrollable Form Body */}
                    <form
                        id={formId}
                        onSubmit={onSubmit}
                        className="flex-1 space-y-4 overflow-y-auto p-6 text-xs"
                    >
                        {children}
                    </form>

                    {/* Sticky Footer */}
                    <div className="flex items-center justify-between border-t border-zinc-200/80 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800/80 dark:bg-zinc-800/60">
                        {/* Dirty State / Warning Message */}
                        <div className="flex items-center">
                            {showNudge && (
                                <span className="animate-pulse text-xs font-medium text-amber-600 dark:text-amber-400">
                                    Nội dung chưa được lưu! Nhấn Lưu hoặc Hủy để
                                    đóng.
                                </span>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-2xs transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                type="submit"
                                form={formId}
                                disabled={submitting}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-xs transition-all disabled:opacity-50 ${
                                    showNudge
                                        ? 'scale-105 bg-sky-600 ring-4 ring-sky-400/50'
                                        : 'bg-sky-600 hover:bg-sky-700 active:bg-sky-800'
                                }`}
                            >
                                {showSpinner && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                                {submitting ? 'Đang lưu…' : finalSubmitLabel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
