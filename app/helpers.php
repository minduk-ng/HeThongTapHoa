<?php

if (! function_exists('cdn_asset')) {
    /**
     * Generate an asset path for the application, using Sirv CDN if enabled.
     *
     * @param  array<string, mixed>  $options
     */
    function cdn_asset(?string $path = null, array $options = []): string
    {
        $enabled = (bool) config('filesystems.disks.sirv.enabled', false);
        $cdnUrl = rtrim((string) config('filesystems.disks.sirv.cdn_url', 'https://ngminduk-191.sirv.com'), '/');
        $baseFolder = '/'.trim((string) config('filesystems.disks.sirv.base_folder', '/TapHoa'), '/');
        $baseUrl = $enabled ? ($cdnUrl.$baseFolder) : rtrim(asset(''), '/');

        if ($path === null || $path === '') {
            return $baseUrl;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $url = $path;
        } else {
            $cleanPath = '/'.ltrim($path, '/');
            if ($enabled) {
                if (str_starts_with($cleanPath, $baseFolder)) {
                    $url = $cdnUrl.$cleanPath;
                } else {
                    $url = $baseUrl.$cleanPath;
                }
            } else {
                $url = asset(ltrim($path, '/'));
            }
        }

        if (! empty($options)) {
            $query = http_build_query($options);
            if (! empty($query)) {
                $url .= (str_contains($url, '?') ? '&' : '?').$query;
            }
        }

        return $url;
    }
}
