import React from 'react';

export interface FormFieldProps {
    label: string;
    required?: boolean;
    error?: string;
    hint?: string;
    children: React.ReactNode;
    className?: string;
}

export default function FormField({
    label,
    required = false,
    error,
    hint,
    children,
    className = '',
}: FormFieldProps) {
    return (
        <div className={className}>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {label}
                {required && (
                    <span className="ml-1 font-semibold text-rose-500">*</span>
                )}
            </label>
            {children}
            {hint && !error && (
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                    {hint}
                </p>
            )}
            {error && (
                <p className="mt-1 text-xs font-medium text-rose-500">
                    {error}
                </p>
            )}
        </div>
    );
}
