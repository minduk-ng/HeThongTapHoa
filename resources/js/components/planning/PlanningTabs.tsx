import { useEffect, useRef } from 'react';

interface PlanningTabsProps<T extends string> {
    id: string;
    label: string;
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}

export default function PlanningTabs<T extends string>({ id, label, options, value, onChange }: PlanningTabsProps<T>) {
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const media = window.matchMedia('(min-width: 640px)');
        let focused: Element | null = null;
        const trackFocus = (event: FocusEvent) => {
            focused = event.target instanceof Element ? event.target : null;
        };
        const transferFocus = () => {
            if (!focused || !root.current?.contains(focused)) {
                return;
            }

            const target = root.current.querySelector<HTMLElement>(
                media.matches ? '[role="tab"][aria-selected="true"]' : 'select'
            );

            target?.focus();
        };

        document.addEventListener('focusin', trackFocus);
        media.addEventListener('change', transferFocus);

        return () => {
            document.removeEventListener('focusin', trackFocus);
            media.removeEventListener('change', transferFocus);
        };
    }, []);

    return (
        <div ref={root} className="min-w-0">
            <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:hidden dark:text-slate-200">
                <span>{label}</span>
                <select
                    value={value}
                    onChange={(event) => onChange(event.target.value as T)}
                    aria-controls={`${id}-panel-${value}`}
                    className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:outline-sky-400"
                >
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </label>
            <div role="tablist" aria-label={label} className="hidden gap-6 border-b border-slate-200 sm:flex dark:border-slate-800">
                {options.map((option, index) => (
                    <button
                        key={option.value}
                        id={`${id}-tab-${option.value}`}
                        type="button"
                        role="tab"
                        aria-selected={value === option.value}
                        aria-controls={`${id}-panel-${option.value}`}
                        tabIndex={value === option.value ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(event) => {
                            const next = event.key === 'Home' ? 0
                                : event.key === 'End' ? options.length - 1
                                : event.key === 'ArrowRight' ? (index + 1) % options.length
                                : event.key === 'ArrowLeft' ? (index + options.length - 1) % options.length
                                : null;

                            if (next === null) {
                                return;
                            }

                            event.preventDefault();
                            onChange(options[next].value);
                            root.current?.querySelector<HTMLButtonElement>(`#${id}-tab-${options[next].value}`)?.focus();
                        }}
                        className={`min-h-11 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:focus-visible:outline-sky-400 ${value === option.value
                            ? 'border-sky-700 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                            : 'border-transparent text-slate-600 hover:border-slate-300 dark:text-slate-300'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
