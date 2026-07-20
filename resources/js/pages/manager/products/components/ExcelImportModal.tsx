import React, { useState } from 'react';
import { router } from '@inertiajs/react';

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

    if (!isOpen) return null;

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
                    'Accept': 'application/json',
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
        if (!checkResult) return;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Nhập dữ liệu sản phẩm từ Excel</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {!checkResult ? (
                    <div className="space-y-4">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Vui lòng chọn file Excel hoặc CSV. Hệ thống sẽ đối chiếu 2 trường thông tin đầu tiên (Mã SP/ID và Tên) với dữ liệu cơ sở dữ liệu hiện tại.
                        </p>

                        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-center bg-zinc-50 dark:bg-zinc-800/50">
                            <input
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileSelect}
                                className="block w-full text-xs text-zinc-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                            />
                            {file && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2">
                                    Đã chọn: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                </p>
                            )}
                        </div>

                        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

                        <div className="flex justify-end space-x-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleCheckFile}
                                disabled={!file || checking}
                                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                            >
                                {checking ? 'Đang kiểm tra...' : 'Tiếp tục kiểm tra'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Check Result Warning View */
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 space-y-1">
                            <div className="flex items-center space-x-2 font-semibold">
                                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Kết quả đối chiếu file Excel:</span>
                            </div>
                            <p className="text-sm">
                                Tổng số dòng: <strong className="font-bold">{checkResult.total_count}</strong> món.
                            </p>
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                Phát hiện <strong className="font-bold text-rose-600 dark:text-rose-400">{checkResult.duplicates_count} món bị trùng</strong> thông tin (Mã ID hoặc Tên sản phẩm).
                            </p>
                            <p className="text-sm">
                                Món mới hợp lệ: <strong className="font-bold text-emerald-600 dark:text-emerald-400">{checkResult.new_count} món</strong>.
                            </p>
                        </div>

                        {/* List preview of duplicate items if any */}
                        {checkResult.duplicates_count > 0 && (
                            <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs space-y-1 bg-zinc-50 dark:bg-zinc-800/40">
                                <span className="font-semibold text-zinc-500 block mb-1">Danh sách trùng mẫu:</span>
                                {checkResult.duplicates.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-zinc-700 dark:text-zinc-300">
                                        <span>• {item.name} {item.id ? `(Mã ${item.id})` : ''}</span>
                                        <span className="text-zinc-400">{item.category || 'Mặc định'}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={confirming}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmImport('add_only_new')}
                                disabled={confirming || checkResult.new_count === 0}
                                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                            >
                                Chỉ thêm các món mới ({checkResult.new_count})
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmImport('replace_all')}
                                disabled={confirming}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {confirming ? 'Đang nhập...' : 'Thay thế toàn bộ'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
