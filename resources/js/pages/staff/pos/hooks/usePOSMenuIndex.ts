import { useMemo, useState } from 'react';
import type { POSProductData } from '../types/pos.types';
import type { MenuIndex } from '../utils/menuAlgorithms';
import { buildMenuIndex } from '../utils/menuAlgorithms';

export function usePOSMenuIndex(products: readonly POSProductData[]): {
    index: MenuIndex | null;
    indexError: string | null;
} {
    const [lastValidIndex, setLastValidIndex] = useState<MenuIndex | null>(
        null,
    );
    const result = useMemo(() => {
        try {
            return { index: buildMenuIndex(products), indexError: null };
        } catch (e) {
            return {
                index: null,
                indexError:
                    e instanceof Error
                        ? e.message
                        : 'Dữ liệu món ăn không hợp lệ.',
            };
        }
    }, [products]);

    if (result.index && result.index !== lastValidIndex) {
        setLastValidIndex(result.index);
    }

    return {
        index: result.index ?? lastValidIndex,
        indexError: result.indexError,
    };
}
