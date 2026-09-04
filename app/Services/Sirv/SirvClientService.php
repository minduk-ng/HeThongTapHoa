<?php

namespace App\Services\Sirv;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SirvClientService
{
    protected string $clientId;

    protected string $clientSecret;

    protected string $cdnUrl;

    protected string $baseFolder;

    public function __construct()
    {
        $config = config('filesystems.disks.sirv', []);
        $this->clientId = $config['client_id'] ?? '';
        $this->clientSecret = $config['client_secret'] ?? '';
        $this->cdnUrl = rtrim($config['cdn_url'] ?? 'https://ngminduk-191.sirv.com', '/');
        $this->baseFolder = '/'.trim($config['base_folder'] ?? '/TapHoa', '/');
    }

    public function getAccessToken(): ?string
    {
        try {
            return Cache::remember('sirv_access_token', 1000, fn () => $this->fetchTokenFromApi());
        } catch (\Throwable $e) {
            Log::warning('Sirv cache store unavailable, fetching token directly', ['error' => $e->getMessage()]);

            return $this->fetchTokenFromApi();
        }
    }

    protected function fetchTokenFromApi(): ?string
    {
        $response = Http::post('https://api.sirv.com/v2/token', [
            'clientId' => $this->clientId,
            'clientSecret' => $this->clientSecret,
        ]);

        if ($response->successful()) {
            return $response->json('token');
        }

        Log::error('Sirv authentication failed', ['response' => $response->body()]);

        return null;
    }

    public function getUrl(string $path): string
    {
        $cleanPath = '/'.ltrim($path, '/');
        if (str_starts_with($cleanPath, $this->baseFolder)) {
            return $this->cdnUrl.$cleanPath;
        }

        return $this->cdnUrl.$this->baseFolder.$cleanPath;
    }

    public function uploadFile(string $remotePath, mixed $contents): bool
    {
        $token = $this->getAccessToken();
        if (! $token) {
            return false;
        }

        $fullSirvPath = $this->baseFolder.'/'.ltrim($remotePath, '/');

        $response = Http::withToken($token)
            ->withBody(is_resource($contents) ? stream_get_contents($contents) : (string) $contents, 'application/octet-stream')
            ->post('https://api.sirv.com/v2/files/upload?filename='.urlencode($fullSirvPath));

        if ($response->successful()) {
            return true;
        }

        Log::error('Sirv file upload failed', ['path' => $remotePath, 'error' => $response->body()]);

        return false;
    }

    public function deleteFile(string $remotePath): bool
    {
        $token = $this->getAccessToken();
        if (! $token) {
            return false;
        }

        $fullSirvPath = $this->baseFolder.'/'.ltrim($remotePath, '/');

        $response = Http::withToken($token)
            ->post('https://api.sirv.com/v2/files/delete?filename='.urlencode($fullSirvPath));

        return $response->successful();
    }

    public function fileExists(string $remotePath): bool
    {
        $token = $this->getAccessToken();
        if (! $token) {
            return false;
        }

        $fullSirvPath = $this->baseFolder.'/'.ltrim($remotePath, '/');

        $response = Http::withToken($token)
            ->get('https://api.sirv.com/v2/files/stat?filename='.urlencode($fullSirvPath));

        return $response->successful();
    }
}
