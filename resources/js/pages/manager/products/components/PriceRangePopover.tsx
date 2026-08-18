import React, { useState, useRef, useEffect } from 'react';
import { CircleDollarSign, ChevronDown } from 'lucide-react';

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

    // Sync with external props
    useEffect(() => {
        setTempMin(minPrice ? String(minPrice) : '');
        setTempMax(maxPrice ? String(maxPrice) : '');
    }, [minPrice, maxPrice]);

    // Close popover when clicked outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatVND = (value: number | string) => {
        const num = Number(value);
        if (isNaN(num)) return '0 đ';
        return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
    };

    const handleApply = () => {
        onChange(tempMin, tempMax);
        setIsOpen(false);
    };

    const handleReset = () => {
        setTempMin('');
        setTempMax('');
        onChange('', '');
        setIsOpen(false);
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, isMin: boolean) => {
        const val = Number(e.target.value);
        if (isMin) {
            const currentMax = tempMax ? Number(tempMax) : globalMax;
            const newMin = Math.min(val, currentMax);
            setTempMin(String(newMin));
        } else {
            const currentMin = tempMin ? Number(tempMin) : globalMin;
            const newMax = Math.max(val, currentMin);
            setTempMax(String(newMax));
        }
    };

    const numMin = tempMin ? Number(tempMin) : globalMin;
    const numMax = tempMax ? Number(tempMax) : globalMax;

    // Calculate highlight bar percentage
    const safeMax = globalMax > globalMin ? globalMax : globalMin + 100000;
    const minPercent = Math.min(Math.max(((numMin - globalMin) / (safeMax - globalMin)) * 100, 0), 100);
    const maxPercent = Math.min(Math.max(((numMax - globalMin) / (safeMax - globalMin)) * 100, 0), 100);

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs border rounded-xl transition-colors ${
                    minPrice || maxPrice
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 font-medium'
                }`}
            >
                <CircleDollarSign className="w-3.5 h-3.5 text-zinc-400 stroke-[1.5]" />
                <span className="tabular-nums">
                    {minPrice || maxPrice
                        ? `${formatVND(minPrice || 0)} — ${formatVND(maxPrice || globalMax)}`
                        : 'Lọc khoảng giá'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-zinc-400" />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xl z-30 p-4 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Khoảng giá bán</span>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="text-xs text-sky-600 hover:underline dark:text-sky-400 font-medium"
                        >
                            Đặt lại
                        </button>
                    </div>

                    {/* Unified Visual Track Slider Container */}
                    <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums">
                            <span>{formatVND(numMin)}</span>
                            <span>{formatVND(numMax)}</span>
                        </div>

                        {/* Combined Dual Handle Track Container */}
                        <div className="relative w-full h-6 flex items-center">
                            {/* Base Gray Track */}
                            <div className="absolute w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full" />

                            {/* Active Sky Highlight Track */}
                            <div
                                className="absolute h-2 bg-sky-600 rounded-full"
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
                                onChange={(e) => handleSliderChange(e, true)}
                                className={`absolute w-full h-2 appearance-none bg-transparent pointer-events-none cursor-pointer focus:outline-hidden ${
                                    numMin > safeMax / 2 ? 'z-20' : 'z-10'
                                } [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sky-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-125 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-sky-600 [&::-moz-range-thumb]:shadow-md transition-transform`}
                            />

                            {/* Overlaid Max Handle Slider */}
                            <input
                                type="range"
                                min={globalMin}
                                max={safeMax}
                                step={5000}
                                value={numMax}
                                onChange={(e) => handleSliderChange(e, false)}
                                className={`absolute w-full h-2 appearance-none bg-transparent pointer-events-none cursor-pointer focus:outline-hidden ${
                                    numMin > safeMax / 2 ? 'z-10' : 'z-20'
                                } [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sky-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-125 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-sky-600 [&::-moz-range-thumb]:shadow-md transition-transform`}
                            />
                        </div>
                    </div>

                    {/* Direct Number Inputs */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Từ (VNĐ)</label>
                            <input
                                type="number"
                                value={tempMin}
                                onChange={(e) => setTempMin(e.target.value)}
                                placeholder="0"
                                className="w-full px-2.5 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 tabular-nums font-semibold"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Đến (VNĐ)</label>
                            <input
                                type="number"
                                value={tempMax}
                                onChange={(e) => setTempMax(e.target.value)}
                                placeholder={String(globalMax)}
                                className="w-full px-2.5 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 tabular-nums font-semibold"
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end space-x-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                            Đóng
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 shadow-xs transition-colors"
                        >
                            Áp dụng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
