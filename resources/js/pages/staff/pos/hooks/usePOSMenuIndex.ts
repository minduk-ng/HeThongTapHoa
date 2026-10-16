import { useMemo } from 'react';
import type { POSProductData } from '../types/pos.types';
import type { MenuIndex } from '../utils/menuAlgorithms';
import { buildMenuIndex } from '../utils/menuAlgorithms';

export function usePOSMenuIndex(products: readonly POSProductData[]): {
    index: MenuIndex | null;
    indexError: string | null;
} {
    return useMemo(() => {
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
}
