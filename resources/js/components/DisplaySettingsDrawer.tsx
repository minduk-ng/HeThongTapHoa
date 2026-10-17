import {
    Check,
    LayoutGrid,
    Monitor,
    RotateCcw,
    SlidersHorizontal,
    Volume2,
    VolumeX,
    X,
} from 'lucide-react';
import React, { useEffect } from 'react';
import type { DisplaySettings } from '../hooks/useDisplaySettings';

export interface DisplaySettingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    screenId: 'kitchen' | 'pos' | 'serving';
    settings: DisplaySettings;
    previewSettings: DisplaySettings;
    onUpdatePreview: (updates: Partial<DisplaySettings>) => void;
    onSave: () => void;
    onReset: () => void;
    hasUnsavedChanges: boolean;
}

const SCREEN_TITLES: Record<'kitchen' | 'pos' | 'serving', string> = {
    kitchen: 'Màn hình Bếp (KDS)',
    pos: 'Màn hình Bán hàng (POS)',
    serving: 'Màn hình Phục vụ (Serving)',
};

const SCALE_OPTIONS: Array<{
    value: 85 | 100 | 110 | 125;
    label: string;
    desc: string;
}> = [
    { value: 85, label: '85%', desc: 'Gọn nhẹ cho laptop nhỏ' },
    { value: 100, label: '100%', desc: 'Tiêu chuẩn mặc định' },
    { value: 110, label: '110%', desc: 'Rõ nét cho máy tính bảng' },
    { value: 125, label: '125%', desc: 'Màn hình lớn / TV' },
];

const DENSITY_OPTIONS: Array<{
    value: 'compact' | 'normal' | 'comfortable';
    label: string;
    desc: string;
}> = [
    { value: 'compact', label: 'Thu gọn', desc: 'Tối đa hóa diện tích xem' },
    { value: 'normal', label: 'Tiêu chuẩn', desc: 'Độ cân bằng hài hòa' },
    { value: 'comfortable', label: 'Rộng rãi', desc: 'Nút to cho cảm ứng' },
];

const COLUMN_OPTIONS: Array<{
    value: 'auto' | 2 | 3 | 4 | 5 | 6;
    label: string;
}> = [
    { value: 'auto', label: 'Tự động' },
    { value: 2, label: '2 cột' },
    { value: 3, label: '3 cột' },
    { value: 4, label: '4 cột' },
    { value: 5, label: '5 cột' },
    { value: 6, label: '6 cột' },
];

export default function DisplaySettingsDrawer({
    isOpen,
    onClose,
    screenId,
    previewSettings,
    onUpdatePreview,
    onSave,
    onReset,
    hasUnsavedChanges,
}: DisplaySettingsDrawerProps) {
    // ESC key closes drawer
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Slide-over panel */}
            <div className="fixed inset-y-0 right-0 flex w-full max-w-full flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-200 sm:max-w-sm dark:border-zinc-800 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-5 dark:border-zinc-800">
                    <div className="flex items-center space-x-2">
                        <SlidersHorizontal className="h-5 w-5 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                        <div>
                            <h2 className="font-display text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                Cài đặt hiển thị
                            </h2>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {SCREEN_TITLES[screenId]}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        title="Đóng bảng cài đặt"
                    >
                        <X className="h-5 w-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Content body */}
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                    {/* Live Preview notice */}
                    <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 p-3 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
                        <div className="flex items-center space-x-1.5 font-semibold">
                            <Monitor className="h-4 w-4 shrink-0 stroke-[1.5]" />
                            <span>Xem trước trực tiếp (Live Preview)</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-sky-700/90 dark:text-sky-300/80">
                            Các thay đổi được áp dụng ngay trên màn hình nền.
                            Nhấn “Lưu thiết lập” để ghi nhớ cho các lần truy cập
                            sau.
                        </p>
                    </div>

                    {/* Section 1: Zoom / Scale */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            Tỷ lệ thu phóng (Display Zoom)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {SCALE_OPTIONS.map((opt) => {
                                const isSelected =
                                    previewSettings.scale === opt.value;

                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() =>
                                            onUpdatePreview({
                                                scale: opt.value,
                                            })
                                        }
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-colors ${
                                            isSelected
                                                ? 'border-sky-500 bg-sky-50/80 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-100'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className="font-display text-sm font-bold tabular-nums">
                                                {opt.label}
                                            </span>
                                            {isSelected && (
                                                <Check className="h-4 w-4 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                                            )}
                                        </div>
                                        <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                            {opt.desc}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 2: Density */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            Mật độ khoảng cách (Density)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {DENSITY_OPTIONS.map((opt) => {
                                const isSelected =
                                    previewSettings.density === opt.value;

                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() =>
                                            onUpdatePreview({
                                                density: opt.value,
                                            })
                                        }
                                        className={`rounded-lg border px-2.5 py-2 text-center text-xs font-semibold transition-colors ${
                                            isSelected
                                                ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
                                                : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 3: Kitchen & Serving Grid Columns */}
                    {(screenId === 'kitchen' || screenId === 'serving') && (
                        <div className="space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                            <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                <LayoutGrid className="h-4 w-4 stroke-[1.5] text-zinc-500" />
                                <span>Số cột hiển thị (Grid Columns)</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {COLUMN_OPTIONS.map((opt) => {
                                    const isSelected =
                                        previewSettings.gridColumns ===
                                        opt.value;

                                    return (
                                        <button
                                            key={String(opt.value)}
                                            type="button"
                                            onClick={() =>
                                                onUpdatePreview({
                                                    gridColumns: opt.value,
                                                })
                                            }
                                            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                                                isSelected
                                                    ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
                                                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-zinc-400">
                                Chế độ Tự động sẽ tự điều chỉnh số cột theo kích
                                thước màn hình thiết bị.
                            </p>
                        </div>
                    )}

                    {/* Section 4: Kitchen Specific: Card Appearance & Audio Alerts */}
                    {screenId === 'kitchen' && (
                        <div className="space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                    Kiểu thẻ order bếp (Card Mode)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onUpdatePreview({
                                                cardMode: 'auto',
                                            })
                                        }
                                        className={`rounded-xl border p-2.5 text-left transition-colors ${
                                            previewSettings.cardMode !==
                                            'compact'
                                                ? 'border-sky-500 bg-sky-50/80 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-100'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'
                                        }`}
                                    >
                                        <span className="block text-xs font-bold">
                                            Auto-height
                                        </span>
                                        <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                                            Co giãn theo số món thực tế
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onUpdatePreview({
                                                cardMode: 'compact',
                                            })
                                        }
                                        className={`rounded-xl border p-2.5 text-left transition-colors ${
                                            previewSettings.cardMode ===
                                            'compact'
                                                ? 'border-sky-500 bg-sky-50/80 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-100'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'
                                        }`}
                                    >
                                        <span className="block text-xs font-bold">
                                            Thu gọn tối đa
                                        </span>
                                        <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                                            Gọn gàng nhất cho giờ cao điểm
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Audio alert toggle */}
                            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                                <div className="flex items-center space-x-2">
                                    {previewSettings.audioAlert ? (
                                        <Volume2 className="h-4 w-4 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                                    ) : (
                                        <VolumeX className="h-4 w-4 stroke-[1.5] text-zinc-400" />
                                    )}
                                    <div>
                                        <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                            Âm thanh thông báo
                                        </span>
                                        <span className="text-[10px] text-zinc-400">
                                            Phát chuông bíp khi có order món mới
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onUpdatePreview({
                                            audioAlert:
                                                !previewSettings.audioAlert,
                                        })
                                    }
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                        previewSettings.audioAlert
                                            ? 'bg-sky-600'
                                            : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                            previewSettings.audioAlert
                                                ? 'translate-x-5'
                                                : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer */}
                <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        title="Khôi phục thiết lập gốc"
                    >
                        <RotateCcw className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>Mặc định</span>
                    </button>

                    <button
                        type="button"
                        onClick={onSave}
                        className="flex items-center space-x-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-sky-700 focus:outline-hidden"
                    >
                        <Check className="h-4 w-4 stroke-[1.5]" />
                        <span>
                            {hasUnsavedChanges ? 'Lưu thiết lập' : 'Đã lưu'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
