import React, { useState, useRef, useEffect } from 'react';

interface PriceRangePopoverProps {
    minPrice?: number | string;
    maxPrice?: number | string;
    globalMin?: number;
    globalMax?: number;
    onChange: (min: string, max: string) => void;
}

export default function PriceRangePopover({
    minPrice,
    maxPrice,
    globalMin = 0,
    globalMax = 500000,
    onChange,
}: PriceRangePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [tempMin, setTempMin] = useState<string>(minPrice ? String(minPrice) : '');
    const [tempMax, setTempMax] = useState<string>(maxPrice ? String(maxPrice) : '');
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setTempMin(minPrice ? String(minPrice) : '');
        setTempMax(maxPrice ? String(maxPrice) : '');
    }, [minPrice, maxPrice]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const numMin = tempMin !== '' ? Number(tempMin) : globalMin;
    const numMax = tempMax !== '' ? Number(tempMax) : globalMax;

    // Handle min slider drag with auto inversion swap
    const handleMinSlider = (valStr: string) => {
        const val = Number(valStr);
        if (val > numMax) {
            setTempMin(String(numMax));
            setTempMax(String(val));
        } else {
            setTempMin(String(val));
        }
    };

    // Handle max slider drag with auto inversion swap
    const handleMaxSlider = (valStr: string) => {
        const val = Number(valStr);
        if (val < numMin) {
            setTempMax(String(numMin));
            setTempMin(String(val));
        } else {
            setTempMax(String(val));
        }
    };

    const handleApply = () => {
        let finalMin = tempMin !== '' ? Number(tempMin) : globalMin;
        let finalMax = tempMax !== '' ? Number(tempMax) : globalMax;

        if (finalMin > finalMax) {
            [finalMin, finalMax] = [finalMax, finalMin];
        }

        const strMin = finalMin > globalMin ? String(finalMin) : '';
        const strMax = finalMax < globalMax ? String(finalMax) : '';

        onChange(strMin, strMax);
        setIsOpen(false);
    };

    const handleReset = () => {
        setTempMin('');
        setTempMax('');
        onChange('', '');
        setIsOpen(false);
    };

    const formatVND = (val: string | number) => {
        if (!val && val !== 0) return '0 đ';
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    // Calculate highlight bar percentage
    const safeMax = globalMax > globalMin ? globalMax : globalMin + 100000;
    const minPercent = Math.min(Math.max(((numMin - globalMin) / (safeMax - globalMin)) * 100, 0), 100);
    const maxPercent = Math.min(Math.max(((numMax - globalMin) / (safeMax - globalMin)) * 100, 0), 100);

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center space-x-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
                    minPrice || maxPrice
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-750'
                }`}
            >
                <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                    {minPrice || maxPrice
                        ? `${formatVND(minPrice || 0)} - ${formatVND(maxPrice || globalMax)}`
                        : 'Lọc khoảng giá'}
                </span>
                <svg className="w-4 h-4 ml-1 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-30 p-4 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Khoảng giá bán</span>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400 font-medium"
                        >
                            Đặt lại
                        </button>
                    </div>

                    {/* Unified Visual Track Slider Container */}
                    <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            <span>{formatVND(numMin)}</span>
                            <span>{formatVND(numMax)}</span>
                        </div>

                        {/* Combined Dual Handle Track Container */}
                        <div className="relative w-full h-6 flex items-center">
                            {/* Base Gray Track */}
                            <div className="absolute w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full" />

                            {/* Active Blue Highlight Track */}
                            <div
                                className="absolute h-2 bg-blue-600 rounded-full"
                                style={{
                                    left: `${Math.min(minPercent, maxPercent)}%`,
                                    width: `${Math.abs(maxPercent - minPercent)}%`,
                                }}
                            />

                            {/* Overlaid Min Handle Slider */}
                            <input
                                type="range"
                                min={globalMin}
                                max={safeMax}
                                step={5000}
                                value={numMin}
                                onChange={(e) => handleMinSlider(e.target.value)}
                                className="absolute w-full h-2 appearance-none bg-transparent pointer-events-auto cursor-pointer focus:outline-hidden [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-transform"
                            />

                            {/* Overlaid Max Handle Slider */}
                            <input
                                type="range"
                                min={globalMin}
                                max={safeMax}
                                step={5000}
                                value={numMax}
                                onChange={(e) => handleMaxSlider(e.target.value)}
                                className="absolute w-full h-2 appearance-none bg-transparent pointer-events-auto cursor-pointer focus:outline-hidden [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 transition-transform"
                            />
                        </div>
                    </div>

                    {/* Direct Number Inputs */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Từ (VNĐ)</label>
                            <input
                                type="number"
                                value={tempMin}
                                onChange={(e) => setTempMin(e.target.value)}
                                placeholder="0"
                                className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Đến (VNĐ)</label>
                            <input
                                type="number"
                                value={tempMax}
                                onChange={(e) => setTempMax(e.target.value)}
                                placeholder={String(globalMax)}
                                className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            Đóng
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-xs"
                        >
                            Áp dụng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
