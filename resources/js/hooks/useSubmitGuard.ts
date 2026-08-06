import { useCallback, useRef, useState } from 'react';

export function useSubmitGuard() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const lockRef = useRef(false);

    const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
        if (lockRef.current) return undefined;
        lockRef.current = true;
        setIsSubmitting(true);
        try {
            return await fn();
        } finally {
            lockRef.current = false;
            setIsSubmitting(false);
        }
    }, []);

    return { isSubmitting, guard };
}
