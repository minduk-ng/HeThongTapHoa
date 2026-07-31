import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
    addMonths,
    buildMonthGrid,
    compareDays,
    dateToDisplay,
    displayToYMD,
    formatMonthLabel,
    isSameDay,
    isWithinRange,
    pad2,
    parseYMD,
    toYMD,
    WEEKDAY_LABELS,
} from '../utils/date';

interface CommonProps {
    placeholder?: string;
    minDate?: string; // 'Y-m-d'
    maxDate?: string; // 'Y-m-d'
    disabled?: boolean;
    className?: string;
}

export type DatePickerProps = CommonProps &
    (
        | {
              mode: 'single';
              value?: string | null;
              onChange?: (value: string | null) => void;
          }
        | {
              mode: 'range';
              startDate?: string | null;
              endDate?: string | null;
              onChange?: (start: string | null, end: string | null) => void;
          }
    );

interface DateSegmentInputProps {
    d: string;
    m: string;
    y: string;
    onPart: (part: 'd' | 'm' | 'y', v: string) => void;
    onCommit: () => void;
    ariaLabel: string;
}

const SEGMENT_CLASS =
    'bg-transparent text-center text-sm tabular-nums text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500';

const SEGMENT_DIVIDER_CLASS = 'text-zinc-400 dark:text-zinc-500';

function DateSegmentInput({
    d,
    m,
    y,
    onPart,
    onCommit,
    ariaLabel,
}: DateSegmentInputProps) {
    const dRef = useRef<HTMLInputElement>(null);
    const mRef = useRef<HTMLInputElement>(null);
    const yRef = useRef<HTMLInputElement>(null);

    const handleChange = (part: 'd' | 'm' | 'y', raw: string) => {
        const maxLen = part === 'y' ? 4 : 2;
        let v = raw.replace(/\D/g, '').slice(0, maxLen);

        if (part !== 'y' && v.length === 2) {
            const cap = part === 'd' ? 31 : 12;

            if (Number(v) > cap) {
                v = String(cap);
            }
        }

        onPart(part, v);

        if (v.length === maxLen) {
            if (part === 'd') {
                mRef.current?.focus();
            }

            if (part === 'm') {
                yRef.current?.focus();
            }
        }
    };

    const handleKeyDown = (
        e: ReactKeyboardEvent<HTMLInputElement>,
        part: 'd' | 'm' | 'y',
    ) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();

            return;
        }

        if (e.key !== 'Backspace' || part === 'd') {
            return;
        }

        const current = part === 'm' ? m : y;

        if (current !== '') {
            return;
        }

        e.preventDefault();

        if (part === 'm') {
            dRef.current?.focus();
        } else {
            mRef.current?.focus();
        }
    };

    return (
        <div
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    onCommit();
                }
            }}
            className="flex flex-1 items-center rounded-lg border border-zinc-200 bg-white px-2 py-1.5 transition-colors focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-800 dark:focus-within:border-sky-500 dark:focus-within:ring-sky-950"
        >
            <input
                ref={dRef}
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="dd"
                value={d}
                onChange={(e) => handleChange('d', e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'd')}
                aria-label={`Ngày ${ariaLabel}`}
                className={`w-[24px] ${SEGMENT_CLASS}`}
            />
            <span className={SEGMENT_DIVIDER_CLASS}>/</span>
            <input
                ref={mRef}
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="mm"
                value={m}
                onChange={(e) => handleChange('m', e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'm')}
                aria-label={`Tháng ${ariaLabel}`}
                className={`w-[24px] ${SEGMENT_CLASS}`}
            />
            <span className={SEGMENT_DIVIDER_CLASS}>/</span>
            <input
                ref={yRef}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="yyyy"
                value={y}
                onChange={(e) => handleChange('y', e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'y')}
                aria-label={`Năm ${ariaLabel}`}
                className={`w-[40px] ${SEGMENT_CLASS}`}
            />
        </div>
    );
}

export default function DatePicker(props: DatePickerProps) {
    const {
        className,
        disabled = false,
        maxDate,
        minDate,
        mode,
        placeholder,
    } = props;

    const propStart =
        mode === 'single' ? parseYMD(props.value) : parseYMD(props.startDate);
    const propEnd = mode === 'range' ? parseYMD(props.endDate) : null;

    const [isOpen, setIsOpen] = useState(false);
    const [viewMonth, setViewMonth] = useState<Date>(() => new Date());
    const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>(
        'days',
    );
    const [draftStart, setDraftStart] = useState<Date | null>(null);
    const [draftEnd, setDraftEnd] = useState<Date | null>(null);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const [startD, setStartD] = useState('');
    const [startM, setStartM] = useState('');
    const [startY, setStartY] = useState('');
    const [endD, setEndD] = useState('');
    const [endM, setEndM] = useState('');
    const [endY, setEndY] = useState('');
    const popoverRef = useRef<HTMLDivElement>(null);
    const reopenGuardRef = useRef(false);

    const minD = parseYMD(minDate);
    const maxD = parseYMD(maxDate);

    const isDayDisabled = (day: Date): boolean => {
        if (minD && compareDays(day, minD) < 0) {
            return true;
        }

        if (maxD && compareDays(day, maxD) > 0) {
            return true;
        }

        return false;
    };

    const commitSingle = (day: Date | null) => {
        if (mode !== 'single') {
            return;
        }

        props.onChange?.(day ? toYMD(day) : null);
        setIsOpen(false);
    };

    const commitRange = (start: Date | null, end: Date | null) => {
        if (mode !== 'range') {
            return;
        }

        let lo = start;
        let hi = end;

        if (start && end && compareDays(start, end) > 0) {
            [lo, hi] = [end, start];
        }

        props.onChange?.(lo ? toYMD(lo) : null, hi ? toYMD(hi) : null);
        setIsOpen(false);
    };

    const segmentsOf = (day: Date | null): [string, string, string] =>
        day
            ? [
                  pad2(day.getDate()),
                  pad2(day.getMonth() + 1),
                  String(day.getFullYear()),
              ]
            : ['', '', ''];

    const commitStartInput = () => {
        const [gd, gm, gy] = segmentsOf(draftStart);

        if (startD === gd && startM === gm && startY === gy) {
            return;
        }

        const parsed = parseYMD(displayToYMD(`${startD}/${startM}/${startY}`));

        if (!parsed || isDayDisabled(parsed)) {
            setStartD(gd);
            setStartM(gm);
            setStartY(gy);

            return;
        }

        setDraftStart(parsed);
        setViewMonth(addMonths(parsed, 0));

        if (mode === 'single') {
            commitSingle(parsed);

            return;
        }

        if (draftEnd) {
            commitRange(parsed, draftEnd);
        }
    };

    const commitEndInput = () => {
        const [gd, gm, gy] = segmentsOf(draftEnd);

        if (endD === gd && endM === gm && endY === gy) {
            return;
        }

        const parsed = parseYMD(displayToYMD(`${endD}/${endM}/${endY}`));

        if (!parsed || isDayDisabled(parsed)) {
            setEndD(gd);
            setEndM(gm);
            setEndY(gy);

            return;
        }

        setDraftEnd(parsed);
        setViewMonth(addMonths(parsed, 0));

        if (draftStart) {
            commitRange(draftStart, parsed);
        }
    };

    const handleNav = (dir: -1 | 1) => {
        if (viewMode === 'days') {
            setViewMonth(addMonths(viewMonth, dir));

            return;
        }

        const step = viewMode === 'months' ? dir : dir * 12;

        setViewMonth(
            new Date(viewMonth.getFullYear() + step, viewMonth.getMonth(), 1),
        );
    };

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        function handleClickOutside(e: MouseEvent) {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    const openPopover = () => {
        if (disabled) {
            return;
        }

        const [sd, sm, sy] = segmentsOf(propStart);
        const [ed, em, ey] = segmentsOf(mode === 'range' ? propEnd : null);

        setDraftStart(propStart);
        setDraftEnd(propEnd);
        setHoverDate(null);
        setStartD(sd);
        setStartM(sm);
        setStartY(sy);
        setEndD(ed);
        setEndM(em);
        setEndY(ey);
        setViewMonth(propStart ?? propEnd ?? new Date());
        setViewMode('days');
        setIsOpen(true);
    };

    const handleDayClick = (day: Date) => {
        if (isDayDisabled(day)) {
            return;
        }

        if (mode === 'single') {
            commitSingle(day);

            return;
        }

        // Range: chưa có start hoặc đã đủ khoảng -> bắt đầu khoảng mới.
        if (!draftStart || draftEnd) {
            const [dd, mm, yy] = segmentsOf(day);

            setDraftStart(day);
            setDraftEnd(null);
            setHoverDate(null);
            setStartD(dd);
            setStartM(mm);
            setStartY(yy);
            setEndD('');
            setEndM('');
            setEndY('');

            return;
        }

        // Click thứ 2 -> hoàn tất (commitRange tự swap nếu chọn ngược).
        commitRange(draftStart, day);
    };

    const setStartPart = (part: 'd' | 'm' | 'y', v: string) => {
        if (part === 'd') {
            setStartD(v);

            return;
        }

        if (part === 'm') {
            setStartM(v);

            return;
        }

        setStartY(v);
    };

    const setEndPart = (part: 'd' | 'm' | 'y', v: string) => {
        if (part === 'd') {
            setEndD(v);

            return;
        }

        if (part === 'm') {
            setEndM(v);

            return;
        }

        setEndY(v);
    };

    const hasValue = Boolean(propStart || propEnd);

    const triggerLabel = (() => {
        if (!propStart && !propEnd) {
            return (
                placeholder ??
                (mode === 'single' ? 'Chọn ngày' : 'Chọn khoảng ngày')
            );
        }

        if (mode === 'single') {
            return propStart ? dateToDisplay(propStart) : '';
        }

        return `${propStart ? dateToDisplay(propStart) : '—'} – ${propEnd ? dateToDisplay(propEnd) : '—'}`;
    })();

    const cells = buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth());

    const yearBlockStart =
        viewMonth.getFullYear() - (viewMonth.getFullYear() % 12);

    const effectiveEnd =
        mode === 'range' && draftStart && !draftEnd ? hoverDate : draftEnd;

    const triggerClass = `flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
        hasValue
            ? 'border-sky-500/60 bg-sky-50/60 text-sky-700 dark:border-sky-400/40 dark:bg-sky-950/40 dark:text-sky-300'
            : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className ?? ''}`;

    const headerLabelClass = `font-display text-sm font-semibold text-zinc-900 transition-colors dark:text-zinc-100 ${
        viewMode === 'years'
            ? 'cursor-default'
            : 'hover:text-sky-600 dark:hover:text-sky-400'
    }`;

    return (
        <div ref={popoverRef} className="relative inline-block">
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onMouseDown={() => {
                    const el = document.activeElement;

                    reopenGuardRef.current =
                        el instanceof HTMLInputElement &&
                        (popoverRef.current?.contains(el) ?? false);
                }}
                onClick={() => {
                    if (isOpen) {
                        reopenGuardRef.current = false;
                        setIsOpen(false);
                    } else if (reopenGuardRef.current) {
                        // Blur-commit vừa đóng popover trong chuỗi mousedown này -> giữ đóng.
                        reopenGuardRef.current = false;
                    } else {
                        openPopover();
                    }
                }}
                className={triggerClass}
            >
                <CalendarDays className="h-4 w-4 stroke-[1.5]" />
                <span className="tabular-nums">{triggerLabel}</span>
            </button>

            {isOpen && (
                <div className="absolute left-0 z-30 mt-2 w-[300px] rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center justify-between px-1 pb-2">
                        <button
                            type="button"
                            aria-label={
                                viewMode === 'days'
                                    ? 'Tháng trước'
                                    : viewMode === 'months'
                                      ? 'Năm trước'
                                      : '12 năm trước'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleNav(-1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        >
                            <ChevronLeft className="h-4 w-4 stroke-[1.5]" />
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                if (viewMode === 'days') {
                                    setViewMode('months');
                                }

                                if (viewMode === 'months') {
                                    setViewMode('years');
                                }
                            }}
                            className={headerLabelClass}
                        >
                            {viewMode === 'days'
                                ? formatMonthLabel(viewMonth)
                                : viewMode === 'months'
                                  ? String(viewMonth.getFullYear())
                                  : `${yearBlockStart} – ${yearBlockStart + 11}`}
                        </button>
                        <button
                            type="button"
                            aria-label={
                                viewMode === 'days'
                                    ? 'Tháng sau'
                                    : viewMode === 'months'
                                      ? 'Năm sau'
                                      : '12 năm sau'
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleNav(1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        >
                            <ChevronRight className="h-4 w-4 stroke-[1.5]" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 px-1 pb-2">
                        <DateSegmentInput
                            d={startD}
                            m={startM}
                            y={startY}
                            onPart={setStartPart}
                            onCommit={commitStartInput}
                            ariaLabel="bắt đầu"
                        />
                        {mode === 'range' && (
                            <>
                                <span className="text-zinc-400 dark:text-zinc-500">
                                    –
                                </span>
                                <DateSegmentInput
                                    d={endD}
                                    m={endM}
                                    y={endY}
                                    onPart={setEndPart}
                                    onCommit={commitEndInput}
                                    ariaLabel="kết thúc"
                                />
                            </>
                        )}
                    </div>

                    {viewMode === 'days' && (
                        <>
                            <div className="grid grid-cols-7">
                                {WEEKDAY_LABELS.map((d) => (
                                    <span
                                        key={d}
                                        className="flex h-7 items-center justify-center text-xs font-medium text-zinc-400 dark:text-zinc-500"
                                    >
                                        {d}
                                    </span>
                                ))}
                            </div>

                            <div
                                className="grid grid-cols-7 gap-y-0.5"
                                onMouseLeave={() => setHoverDate(null)}
                            >
                                {cells.map((day, idx) => {
                                    const inMonth =
                                        day.getMonth() === viewMonth.getMonth();
                                    const dayDisabled = isDayDisabled(day);
                                    const isToday = isSameDay(day, new Date());
                                    const isStart =
                                        draftStart !== null &&
                                        isSameDay(day, draftStart);
                                    const isEnd =
                                        effectiveEnd !== null &&
                                        isSameDay(day, effectiveEnd);
                                    const inBand =
                                        mode === 'range' &&
                                        draftStart !== null &&
                                        effectiveEnd !== null &&
                                        !isSameDay(draftStart, effectiveEnd) &&
                                        isWithinRange(
                                            day,
                                            draftStart,
                                            effectiveEnd,
                                        );
                                    const isSelectedCircle =
                                        mode === 'single'
                                            ? propStart !== null &&
                                              isSameDay(day, propStart)
                                            : isStart || isEnd;

                                    let wrapperClass =
                                        'flex h-9 items-center justify-center';

                                    if (inBand) {
                                        wrapperClass +=
                                            ' bg-sky-100/60 dark:bg-sky-950/50';

                                        if (isStart || idx % 7 === 0) {
                                            wrapperClass += ' rounded-l-full';
                                        }

                                        if (isEnd || idx % 7 === 6) {
                                            wrapperClass += ' rounded-r-full';
                                        }
                                    }

                                    const circleClass = `relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                                        isSelectedCircle
                                            ? 'bg-sky-600 font-semibold text-white dark:bg-sky-500'
                                            : inMonth
                                              ? 'text-zinc-700 dark:text-zinc-300'
                                              : 'text-zinc-400 dark:text-zinc-600'
                                    } ${
                                        isToday && !isSelectedCircle
                                            ? 'font-semibold ring-1 ring-inset ring-sky-400 dark:ring-sky-500'
                                            : ''
                                    } ${
                                        dayDisabled
                                            ? 'cursor-not-allowed opacity-40'
                                            : isSelectedCircle
                                              ? ''
                                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`;

                                    return (
                                        <div
                                            key={toYMD(day)}
                                            className={wrapperClass}
                                        >
                                            <button
                                                type="button"
                                                disabled={dayDisabled}
                                                onMouseDown={(e) =>
                                                    e.preventDefault()
                                                }
                                                onClick={() =>
                                                    handleDayClick(day)
                                                }
                                                onMouseEnter={() => {
                                                    if (
                                                        mode === 'range' &&
                                                        draftStart &&
                                                        !draftEnd &&
                                                        !dayDisabled
                                                    ) {
                                                        setHoverDate(day);
                                                    }
                                                }}
                                                aria-label={day.toLocaleDateString(
                                                    'vi-VN',
                                                    {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                    },
                                                )}
                                                className={circleClass}
                                            >
                                                {day.getDate()}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {viewMode === 'months' && (
                        <div className="grid grid-cols-4 gap-1">
                            {Array.from({ length: 12 }, (_, idx) => {
                                const isViewingMonth =
                                    idx === viewMonth.getMonth();
                                const isCurrentMonth =
                                    idx === new Date().getMonth() &&
                                    viewMonth.getFullYear() ===
                                        new Date().getFullYear();

                                const monthClass = `flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                                    isViewingMonth
                                        ? 'bg-sky-600 font-semibold text-white dark:bg-sky-500'
                                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                                } ${
                                    isCurrentMonth && !isViewingMonth
                                        ? 'font-semibold ring-1 ring-inset ring-sky-400 dark:ring-sky-500'
                                        : ''
                                }`;

                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setViewMonth(
                                                new Date(
                                                    viewMonth.getFullYear(),
                                                    idx,
                                                    1,
                                                ),
                                            );
                                            setViewMode('days');
                                        }}
                                        aria-label={`Tháng ${idx + 1}, ${viewMonth.getFullYear()}`}
                                        className={monthClass}
                                    >
                                        {`Thg ${idx + 1}`}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {viewMode === 'years' && (
                        <div className="grid grid-cols-4 gap-1">
                            {Array.from({ length: 12 }, (_, idx) => {
                                const y = yearBlockStart + idx;
                                const isViewingYear =
                                    y === viewMonth.getFullYear();
                                const isCurrentYear =
                                    y === new Date().getFullYear();

                                const yearClass = `flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                                    isViewingYear
                                        ? 'bg-sky-600 font-semibold text-white dark:bg-sky-500'
                                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                                } ${
                                    isCurrentYear && !isViewingYear
                                        ? 'font-semibold ring-1 ring-inset ring-sky-400 dark:ring-sky-500'
                                        : ''
                                }`;

                                return (
                                    <button
                                        key={y}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setViewMonth(
                                                new Date(
                                                    y,
                                                    viewMonth.getMonth(),
                                                    1,
                                                ),
                                            );
                                            setViewMode('months');
                                        }}
                                        className={yearClass}
                                    >
                                        {y}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
