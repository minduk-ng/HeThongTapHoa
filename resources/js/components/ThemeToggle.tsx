import { useEffect, useState } from 'react';

interface ThemeToggleProps {
    onThemeChange?: (isDark: boolean) => void;
}

export default function ThemeToggle({ onThemeChange }: ThemeToggleProps) {
    const [mounted, setMounted] = useState(false);
    const [dark, setDark] = useState(false);

    useEffect(() => {
        setMounted(true);
        const root = document.documentElement;
        const isDark = root.classList.contains('dark');
        setDark(isDark);
        if (onThemeChange) onThemeChange(isDark);
    }, []);

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
        if (onThemeChange) onThemeChange(nextDark);
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
                    <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                            clipRule="evenodd"
                        />
                    </svg>
                ) : (
                    <svg className="h-3 w-3 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                )}
            </span>
        </button>
    );
}
