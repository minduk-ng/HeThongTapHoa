<?php

if (!function_exists('cdn_asset')) {
    /**
     * Generate an asset path for the application, using Sirv CDN if enabled.
     */
    function cdn_asset(?string $path = null): string
    {
        if (!$path) {
            return '';
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        $enabled = (bool) config('filesystems.disks.sirv.enabled', false);
        $cleanPath = '/' . ltrim($path, '/');

        if ($enabled) {
            $cdnUrl = rtrim((string) config('filesystems.disks.sirv.cdn_url', 'https://ngminduk-191.sirv.com'), '/');
            $baseFolder = '/' . trim((string) config('filesystems.disks.sirv.base_folder', '/TapHoa'), '/');

            if (str_starts_with($cleanPath, $baseFolder)) {
                return $cdnUrl . $cleanPath;
            }

            return $cdnUrl . $baseFolder . $cleanPath;
        }

        return asset(ltrim($path, '/'));
    }
}
