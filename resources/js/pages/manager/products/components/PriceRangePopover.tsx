import { CircleDollarSign, ChevronDown } from 'lucide-react';
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
    const [tempMin, setTempMin] = useState<string>(
        minPrice ? String(minPrice) : '',
    );
    const [tempMax, setTempMax] = useState<string>(
        maxPrice ? String(maxPrice) : '',
    );
    const popoverRef = useRef<HTMLDivElement>(null);

    // Sync with external props
    useEffect(() => {
        queueMicrotask(() => {
            setTempMin(minPrice ? String(minPrice) : '');
            setTempMax(maxPrice ? String(maxPrice) : '');
        });
    }, [minPrice, maxPrice]);

    // Close popover when clicked outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatVND = (value: number | string) => {
        const num = Number(value);

        if (isNaN(num)) {
            return '0 đ';
        }

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

    const handleSliderChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        isMin: boolean,
    ) => {
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
    const minPercent = Math.min(
        Math.max(((numMin - globalMin) / (safeMax - globalMin)) * 100, 0),
        100,
    );
    const maxPercent = Math.min(
        Math.max(((numMax - globalMin) / (safeMax - globalMin)) * 100, 0),
        100,
    );

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center space-x-1.5 rounded-xl border px-3 py-1.5 text-xs transition-colors ${
                    minPrice || maxPrice
                        ? 'border-sky-500 bg-sky-50 font-semibold text-sky-600 dark:bg-sky-950/40 dark:text-sky-400'
                        : 'border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
            >
                <CircleDollarSign className="h-3.5 w-3.5 stroke-[1.5] text-zinc-400" />
                <span className="tabular-nums">
                    {minPrice || maxPrice
                        ? `${formatVND(minPrice || 0)} — ${formatVND(maxPrice || globalMax)}`
                        : 'Lọc khoảng giá'}
                </span>
                <ChevronDown className="ml-1 h-3.5 w-3.5 text-zinc-400" />
            </button>

            {isOpen && (
                <div className="absolute left-0 z-30 mt-2 w-80 space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            Khoảng giá bán
                        </span>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                        >
                            Đặt lại
                        </button>
                    </div>

                    {/* Unified Visual Track Slider Container */}
                    <div className="space-y-3 pt-1">
                        <div className="flex justify-between text-xs font-semibold text-zinc-600 tabular-nums dark:text-zinc-400">
                            <span>{formatVND(numMin)}</span>
                            <span>{formatVND(numMax)}</span>
                        </div>

                        {/* Combined Dual Handle Track Container */}
                        <div className="relative flex h-6 w-full items-center">
                            {/* Base Gray Track */}
                            <div className="absolute h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700" />

                            {/* Active Sky Highlight Track */}
                            <div
                                className="absolute h-2 rounded-full bg-sky-600"
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
                                className={`pointer-events-none absolute h-2 w-full cursor-pointer appearance-none bg-transparent focus:outline-hidden ${
                                    numMin > safeMax / 2 ? 'z-20' : 'z-10'
                                } transition-transform [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-sky-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sky-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-125`}
                            />

                            {/* Overlaid Max Handle Slider */}
                            <input
                                type="range"
                                min={globalMin}
                                max={safeMax}
                                step={5000}
                                value={numMax}
                                onChange={(e) => handleSliderChange(e, false)}
                                className={`pointer-events-none absolute h-2 w-full cursor-pointer appearance-none bg-transparent focus:outline-hidden ${
                                    numMin > safeMax / 2 ? 'z-10' : 'z-20'
                                } transition-transform [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-sky-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sky-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-125`}
                            />
                        </div>
                    </div>

                    {/* Direct Number Inputs */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                Từ (VNĐ)
                            </label>
                            <input
                                type="number"
                                value={tempMin}
                                onChange={(e) => setTempMin(e.target.value)}
                                placeholder="0"
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                Đến (VNĐ)
                            </label>
                            <input
                                type="number"
                                value={tempMax}
                                onChange={(e) => setTempMax(e.target.value)}
                                placeholder={String(globalMax)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end space-x-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            Đóng
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className="rounded-xl bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700"
                        >
                            Áp dụng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
