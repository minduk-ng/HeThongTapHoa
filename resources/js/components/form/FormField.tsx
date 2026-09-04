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
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {label}
                {required && <span className="text-rose-500 ml-1 font-semibold">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">
                    {hint}
                </p>
            )}
            {error && (
                <p className="text-xs text-rose-500 font-medium mt-1">
                    {error}
                </p>
            )}
        </div>
    );
}
