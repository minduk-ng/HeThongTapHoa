import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
    onThemeChange?: (isDark: boolean) => void;
}

export default function ThemeToggle({ onThemeChange }: ThemeToggleProps) {
    const [mounted, setMounted] = useState(false);
    const [dark, setDark] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            const root = document.documentElement;
            const isDark = root.classList.contains('dark');
            setMounted(true);
            setDark(isDark);

            if (onThemeChange) {
                onThemeChange(isDark);
            }
        });
    }, [onThemeChange]);

    const toggleTheme = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextDark = !dark;
        setDark(nextDark);
        const root = document.documentElement;

        if (nextDark) {
            root.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }

        if (onThemeChange) {
onThemeChange(nextDark);
}
    };

    if (!mounted) {
        return <div className="h-6 w-11 rounded-full bg-slate-200 dark:bg-slate-700" />;
    }

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 dark:focus:ring-offset-slate-800 ${
                dark ? 'bg-sky-600' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={dark}
            aria-label="Toggle Theme"
        >
            <span
                className={`pointer-events-none flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out dark:bg-slate-900 ${
                    dark ? 'translate-x-5' : 'translate-x-0'
                }`}
            >
                {dark ? (
                    <Sun className="h-3 w-3 text-amber-400 stroke-[2]" />
                ) : (
                    <Moon className="h-3 w-3 text-slate-600 stroke-[2]" />
                )}
            </span>
        </button>
    );
}

