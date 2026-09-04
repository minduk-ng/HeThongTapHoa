import { router } from '@inertiajs/react';
import { FileSpreadsheet, Download, UploadCloud, AlertTriangle, CheckCircle2, X } from 'lucide-react';
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
    duplicates: Array<{ id: string; name: string; category: string; price: number }>;
}

export default function ExcelImportModal({ isOpen, onClose }: ExcelImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [checking, setChecking] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [checkResult, setCheckResult] = useState<ImportCheckResult | null>(null);
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
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '',
                },
                body: formData,
            });

            const isJson = res.headers.get('content-type')?.includes('application/json');
            const data = isJson ? await res.json() : null;

            if (!res.ok) {
                if (data && data.message) {
                    throw new Error(data.message);
                } else if (data && data.errors) {
                    const firstErr = Object.values(data.errors).flat()[0];

                    throw new Error(String(firstErr));
                }

                throw new Error(`Lỗi kiểm tra file Excel (${res.status} ${res.statusText})`);
            }

            if (!data) {
                throw new Error('Phản hồi từ máy chủ không hợp lệ (không phải định dạng JSON).');
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
            }
        );
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
                {/* Header */}
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3.5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                            <FileSpreadsheet className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                Nhập danh sách thực đơn từ Excel
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Hỗ trợ các định dạng file .csv, .xlsx, .xls
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                     aria-label="Đóng">
                        <X className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                {!checkResult ? (
                    <div className="space-y-4">
                        {/* Download Template Banner */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/60 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 shrink-0">
                                    <FileSpreadsheet className="w-4 h-4 stroke-[1.5]" />
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Chưa có file mẫu chuẩn?</p>
                                    <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-0.5">
                                        Tải file mẫu mẫu chuẩn với các cột định dạng sẵn để điền thông tin
                                    </p>
                                </div>
                            </div>
                            <a
                                href="/manager/products/template"
                                download="mau_nhap_san_pham.csv"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shrink-0 shadow-xs"
                            >
                                <Download className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Tải file mẫu</span>
                            </a>
                        </div>

                        {/* File Upload Box */}
                        <div className="relative border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-6 text-center bg-zinc-50/60 dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                                <div className="p-3 rounded-full bg-white dark:bg-zinc-900 shadow-xs border border-zinc-200/80 dark:border-zinc-700/80 text-sky-600 dark:text-sky-400">
                                    <UploadCloud className="w-6 h-6 stroke-[1.5]" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                        {file ? file.name : 'Kéo thả file vào đây hoặc bấm để chọn file'}
                                    </p>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        {file
                                            ? `Dung lượng: ${(file.size / 1024).toFixed(1)} KB`
                                            : 'Hệ thống sẽ đối chiếu Tên món & Mã SP trước khi nhập'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 stroke-[1.5]" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Footer Buttons */}
                        <div className="flex justify-end items-center gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleCheckFile}
                                disabled={!file || checking}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>{checking ? 'Đang kiểm tra...' : 'Tiếp tục kiểm tra'}</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Check Result Warning View */
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 space-y-2 text-xs">
                            <div className="flex items-center gap-2 font-semibold">
                                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 stroke-[1.5]" />
                                <span>Kết quả đối chiếu file Excel:</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                                <div className="p-2 rounded-lg bg-white/70 dark:bg-zinc-900/60 border border-amber-200/60 dark:border-amber-800/40">
                                    <span className="text-[11px] text-zinc-500 block">Tổng số dòng</span>
                                    <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                        {checkResult.total_count} món
                                    </span>
                                </div>
                                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/40">
                                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block">Món mới</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                        {checkResult.new_count} món
                                    </span>
                                </div>
                                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200/60 dark:border-rose-800/40">
                                    <span className="text-[11px] text-rose-700 dark:text-rose-400 block">Bị trùng</span>
                                    <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                                        {checkResult.duplicates_count} món
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* List preview of duplicate items if any */}
                        {checkResult.duplicates_count > 0 && (
                            <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs space-y-1 bg-zinc-50 dark:bg-zinc-800/40">
                                <span className="font-semibold text-zinc-500 block mb-1">Danh sách món bị trùng lặp:</span>
                                {checkResult.duplicates.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-zinc-700 dark:text-zinc-300 py-0.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                                        <span className="truncate pr-2">• {item.name} {item.id ? `(ID: ${item.id})` : ''}</span>
                                        <span className="text-zinc-400 shrink-0 text-[11px]">{item.category || 'Mặc định'}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={confirming}
                                className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmImport('add_only_new')}
                                disabled={confirming || checkResult.new_count === 0}
                                className="px-4 py-2 text-xs font-semibold text-sky-700 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 rounded-xl hover:bg-sky-100 transition-colors disabled:opacity-50"
                            >
                                Chỉ thêm các món mới ({checkResult.new_count})
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmImport('replace_all')}
                                disabled={confirming}
                                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs disabled:opacity-50"
                            >
                                {confirming ? 'Đang nhập...' : 'Cập nhật / Thay thế tất cả'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
