import { usePage } from '@inertiajs/react';

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
 * Resolves full asset URL based on path.
 * If path is already a full URL (http/https), returns as is.
 */
export function cdnAsset(path?: string | null): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const baseUrl = getCdnBaseUrl();
    if (baseUrl) {
        return `${baseUrl}${cleanPath}`;
    }
    return cleanPath;
}
