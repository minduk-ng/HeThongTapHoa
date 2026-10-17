import { router } from '@inertiajs/react';
import {
    FileSpreadsheet,
    Download,
    UploadCloud,
    AlertTriangle,
    CheckCircle2,
    X,
} from 'lucide-react';
import React, { useState } from 'react';

interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ImportCheckResult {
    temp_id: string;
    total_count: number;
    duplicates_count: number;
    new_count: number;
    duplicates: Array<{
        id: string;
        name: string;
        category: string;
        price: number;
    }>;
}

export default function ExcelImportModal({
    isOpen,
    onClose,
}: ExcelImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [checking, setChecking] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [checkResult, setCheckResult] = useState<ImportCheckResult | null>(
        null,
    );
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleClose = () => {
        setFile(null);
        setCheckResult(null);
        setErrorMsg(null);
        setChecking(false);
        setConfirming(false);
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setErrorMsg(null);
            setCheckResult(null);
        }
    };

    const handleCheckFile = async () => {
        if (!file) {
            setErrorMsg('Vui lòng chọn file Excel / CSV để kiểm tra');

            return;
        }

        setChecking(true);
        setErrorMsg(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/manager/products/check-import', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN':
                        (
                            document.querySelector(
                                'meta[name="csrf-token"]',
                            ) as HTMLMetaElement
                        )?.content || '',
                },
                body: formData,
            });

            const isJson = res.headers
                .get('content-type')
                ?.includes('application/json');
            const data = isJson ? await res.json() : null;

            if (!res.ok) {
                if (data && data.message) {
                    throw new Error(data.message);
                } else if (data && data.errors) {
                    const firstErr = Object.values(data.errors).flat()[0];

                    throw new Error(String(firstErr));
                }

                throw new Error(
                    `Lỗi kiểm tra file Excel (${res.status} ${res.statusText})`,
                );
            }

            if (!data) {
                throw new Error(
                    'Phản hồi từ máy chủ không hợp lệ (không phải định dạng JSON).',
                );
            }

            setCheckResult(data);
        } catch (err: any) {
            setErrorMsg(err.message || 'Đã xảy ra lỗi khi tải file.');
        } finally {
            setChecking(false);
        }
    };

    const handleConfirmImport = (action: 'replace_all' | 'add_only_new') => {
        if (!checkResult) {
            return;
        }

        setConfirming(true);
        router.post(
            '/manager/products/confirm-import',
            {
                temp_id: checkResult.temp_id,
                action,
            },
            {
                onSuccess: () => {
                    setConfirming(false);
                    setCheckResult(null);
                    setFile(null);
                    onClose();
                },
                onError: () => {
                    setConfirming(false);
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg space-y-5 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3.5 dark:border-zinc-800">
                    <div className="flex items-center gap-2.5">
                        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                            <FileSpreadsheet className="h-5 w-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                Nhập danh sách thực đơn từ Excel
                            </h3>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Hỗ trợ các định dạng file .csv, .xlsx, .xls
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        aria-label="Đóng"
                    >
                        <X className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>

                {!checkResult ? (
                    <div className="space-y-4">
                        {/* Download Template Banner */}
                        <div className="flex items-center justify-between rounded-xl border border-sky-200/80 bg-sky-50/70 p-3.5 text-xs dark:border-sky-800/60 dark:bg-sky-950/40">
                            <div className="flex min-w-0 items-center gap-2.5 pr-2">
                                <div className="shrink-0 rounded-lg bg-sky-100 p-2 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400">
                                    <FileSpreadsheet className="h-4 w-4 stroke-[1.5]" />
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        Chưa có file mẫu chuẩn?
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Tải file mẫu mẫu chuẩn với các cột định
                                        dạng sẵn để điền thông tin
                                    </p>
                                </div>
                            </div>
                            <a
                                href="/manager/products/template"
                                download="mau_nhap_san_pham.csv"
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                            >
                                <Download className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>Tải file mẫu</span>
                            </a>
                        </div>

                        {/* File Upload Box */}
                        <div className="relative rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50/60 p-6 text-center transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/60">
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileSelect}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <div className="pointer-events-none flex flex-col items-center justify-center space-y-2">
                                <div className="rounded-full border border-zinc-200/80 bg-white p-3 text-sky-600 shadow-xs dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-sky-400">
                                    <UploadCloud className="h-6 w-6 stroke-[1.5]" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                        {file
                                            ? file.name
                                            : 'Kéo thả file vào đây hoặc bấm để chọn file'}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-zinc-400">
                                        {file
                                            ? `Dung lượng: ${(file.size / 1024).toFixed(1)} KB`
                                            : 'Hệ thống sẽ đối chiếu Tên món & Mã SP trước khi nhập'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400">
                                <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.5]" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Footer Buttons */}
                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleCheckFile}
                                disabled={!file || checking}
                                className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>
                                    {checking
                                        ? 'Đang kiểm tra...'
                                        : 'Tiếp tục kiểm tra'}
                                </span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Check Result Warning View */
                    <div className="space-y-4">
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                            <div className="flex items-center gap-2 font-semibold">
                                <AlertTriangle className="h-4 w-4 stroke-[1.5] text-amber-600 dark:text-amber-400" />
                                <span>Kết quả đối chiếu file Excel:</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                                <div className="rounded-lg border border-amber-200/60 bg-white/70 p-2 dark:border-amber-800/40 dark:bg-zinc-900/60">
                                    <span className="block text-[11px] text-zinc-500">
                                        Tổng số dòng
                                    </span>
                                    <span className="font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                                        {checkResult.total_count} món
                                    </span>
                                </div>
                                <div className="rounded-lg border border-emerald-200/60 bg-emerald-50 p-2 dark:border-emerald-800/40 dark:bg-emerald-950/60">
                                    <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">
                                        Món mới
                                    </span>
                                    <span className="font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                                        {checkResult.new_count} món
                                    </span>
                                </div>
                                <div className="rounded-lg border border-rose-200/60 bg-rose-50 p-2 dark:border-rose-800/40 dark:bg-rose-950/60">
                                    <span className="block text-[11px] text-rose-700 dark:text-rose-400">
                                        Bị trùng
                                    </span>
                                    <span className="font-bold text-rose-600 tabular-nums dark:text-rose-400">
                                        {checkResult.duplicates_count} món
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* List preview of duplicate items if any */}
                        {checkResult.duplicates_count > 0 && (
                            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
                                <span className="mb-1 block font-semibold text-zinc-500">
                                    Danh sách món bị trùng lặp:
                                </span>
                                {checkResult.duplicates.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between border-b border-zinc-100 py-0.5 text-zinc-700 last:border-0 dark:border-zinc-800/60 dark:text-zinc-300"
                                    >
                                        <span className="truncate pr-2">
                                            • {item.name}{' '}
                                            {item.id ? `(ID: ${item.id})` : ''}
                                        </span>
                                        <span className="shrink-0 text-[11px] text-zinc-400">
                                            {item.category || 'Mặc định'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={confirming}
                                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    handleConfirmImport('add_only_new')
                                }
                                disabled={
                                    confirming || checkResult.new_count === 0
                                }
                                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800/60 dark:bg-sky-950/60 dark:text-sky-300"
                            >
                                Chỉ thêm các món mới ({checkResult.new_count})
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    handleConfirmImport('replace_all')
                                }
                                disabled={confirming}
                                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                            >
                                {confirming
                                    ? 'Đang nhập...'
                                    : 'Cập nhật / Thay thế tất cả'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
