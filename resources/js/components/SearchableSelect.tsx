import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
    id: number;
    name: string;
}

interface Props {
    options: SelectOption[];
    value: number | null;
    onChange: (id: number | null) => void;
    placeholder?: string;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'Chọn...',
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = options.find((o) => o.id === value) ?? null;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();

        return options.filter(
            (o) => !q || o.name.toLowerCase().includes(q),
        );
    }, [options, query]);

    const openList = () => {
        setOpen(true);
        setQuery('');
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    return (
        <div className="relative mt-1.5">
            <button
                type="button"
                onClick={() => (open ? setOpen(false) : openList())}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
                <span className={selected ? '' : 'text-zinc-400'}>
                    {selected ? selected.name : placeholder}
                </span>
                <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>

            {open && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="flex items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-700">
                        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Tìm kiếm..."
                            className="w-full bg-transparent py-2 text-sm outline-none dark:text-zinc-100"
                        />
                    </div>
                    <div className="max-h-56 overflow-auto">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-zinc-400">
                                Không có kết quả
                            </div>
                        ) : (
                            filtered.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(o.id);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                >
                                    <span>{o.name}</span>
                                    {o.id === value && (
                                        <Check className="h-4 w-4 text-sky-500" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
