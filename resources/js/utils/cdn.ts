import { usePage } from '@inertiajs/react';

export interface CdnOptions {
    w?: number;
    h?: number;
    q?: number;
    format?: 'webp' | 'png' | 'jpg' | 'avif';
}

/**
 * CDN base URL from Inertia shared props (chỉ gọi trong component / custom hook).
 */
export function useCdnBaseUrl(): string {
    const { props } = usePage<{ cdn_url?: string }>();
    const url = props?.cdn_url ?? '';

    return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Resolves full asset URL based on path with optional Sirv dynamic image parameters.
 * E.g., cdnAsset('/banner/banner_v2.jpg', { h: 72, q: 80, format: 'webp' }, cdnUrl)
 */
export function cdnAsset(path?: string | null, options?: CdnOptions, baseUrl?: string): string {
    if (!path) {
return '';
}

    let url = path;

    if (!path.startsWith('http://') && !path.startsWith('https://')) {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        url = baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
    }

    if (options && (options.w || options.h || options.q || options.format)) {
        const params = new URLSearchParams();

        if (options.w) {
params.set('w', options.w.toString());
}

        if (options.h) {
params.set('h', options.h.toString());
}

        if (options.q) {
params.set('q', options.q.toString());
}

        if (options.format) {
params.set('format', options.format);
}

        url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    return url;
}
