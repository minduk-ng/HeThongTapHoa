import { usePage } from '@inertiajs/react';

export interface CdnOptions {
    w?: number;
    h?: number;
    q?: number;
    format?: 'webp' | 'png' | 'jpg' | 'avif';
}

/**
 * Gets CDN base URL from Inertia shared props.
 */
export function getCdnBaseUrl(): string {
    try {
        const page = usePage<{ cdn_url?: string }>();
        if (page?.props?.cdn_url) {
            return page.props.cdn_url.endsWith('/')
                ? page.props.cdn_url.slice(0, -1)
                : page.props.cdn_url;
        }
    } catch {
        // Fallback if called outside Inertia context
    }
    return '';
}

/**
 * Resolves full asset URL based on path with optional Sirv dynamic image parameters.
 * E.g., cdnAsset('/banner/banner_v2.jpg', { h: 72, q: 80, format: 'webp' })
 */
export function cdnAsset(path?: string | null, options?: CdnOptions): string {
    if (!path) return '';
    let url = path;
    if (!path.startsWith('http://') && !path.startsWith('https://')) {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const baseUrl = getCdnBaseUrl();
        url = baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
    }

    if (options && (options.w || options.h || options.q || options.format)) {
        const params = new URLSearchParams();
        if (options.w) params.set('w', options.w.toString());
        if (options.h) params.set('h', options.h.toString());
        if (options.q) params.set('q', options.q.toString());
        if (options.format) params.set('format', options.format);
        url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    return url;
}
