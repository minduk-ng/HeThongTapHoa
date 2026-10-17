import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

let scrollLockCount = 0;
let originalBodyOverflow = '';

interface PlanningDialogProps {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    busy?: boolean;
    variant?: 'modal' | 'drawer';
    children: ReactNode;
}

export default function PlanningDialog({
    open,
    onClose,
    labelledBy,
    busy = false,
    variant = 'modal',
    children,
}: PlanningDialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const backdropPointer = useRef<number | null>(null);

    useEffect(() => {
        const dialog = ref.current;

        if (!open || !dialog) {
            return;
        }

        const opener = document.activeElement;
        dialog.showModal();

        if (scrollLockCount === 0) {
            originalBodyOverflow = document.body.style.overflow;
        }

        scrollLockCount += 1;
        document.body.style.overflow = 'hidden';

        const closeControl = Array.from(
            dialog.querySelectorAll<HTMLElement>(
                '[data-dialog-close]:not(:disabled)',
            ),
        ).find((element) => element.getClientRects().length > 0);
        const heading = dialog.querySelector<HTMLElement>(
            '[data-dialog-heading]',
        );
        (closeControl ?? heading)?.focus({ preventScroll: true });

        return () => {
            backdropPointer.current = null;
            dialog.close();
            scrollLockCount -= 1;

            if (scrollLockCount === 0) {
                document.body.style.overflow = originalBodyOverflow;
            }

            if (opener instanceof HTMLElement && opener.isConnected) {
                opener.focus({ preventScroll: true });
            }
        };
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            aria-busy={busy}
            className={`planning-ui fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent text-inherit backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs open:flex ${variant === 'drawer' ? 'justify-end p-0' : 'items-center justify-center p-4 sm:p-6'}`}
            onCancel={(event) => {
                event.preventDefault();
                backdropPointer.current = null;

                if (!busy) {
                    onClose();
                }
            }}
            onPointerDown={(event) => {
                backdropPointer.current =
                    event.target === event.currentTarget &&
                    event.button === 0 &&
                    !busy
                        ? event.pointerId
                        : null;
            }}
            onPointerUp={(event) => {
                const startedOnBackdrop =
                    backdropPointer.current === event.pointerId;
                backdropPointer.current = null;

                // Touch implicit capture can retain the down target after dragging into the panel.
                if (
                    startedOnBackdrop &&
                    !busy &&
                    event.target === event.currentTarget &&
                    document.elementFromPoint(event.clientX, event.clientY) ===
                        event.currentTarget
                ) {
                    onClose();
                }
            }}
            onPointerCancel={() => {
                backdropPointer.current = null;
            }}
            onLostPointerCapture={() => {
                backdropPointer.current = null;
            }}
            onPointerLeave={() => {
                backdropPointer.current = null;
            }}
        >
            {children}
        </dialog>
    );
}
