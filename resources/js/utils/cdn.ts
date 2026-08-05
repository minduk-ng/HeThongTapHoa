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
    return cleanPath;
}
