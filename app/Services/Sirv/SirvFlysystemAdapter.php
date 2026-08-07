<?php

namespace App\Services\Sirv;

use League\Flysystem\ChecksumAlgoIsNotSupported;
use League\Flysystem\Config;
use League\Flysystem\FileAttributes;
use League\Flysystem\FilesystemAdapter;

class SirvFlysystemAdapter implements FilesystemAdapter
{
    public function __construct(protected SirvClientService $client)
    {
    }

    public function fileExists(string $path): bool
    {
        return $this->client->fileExists($path);
    }

    public function directoryExists(string $path): bool
    {
        return true;
    }

    public function write(string $path, string $contents, Config $config): void
    {
        $this->client->uploadFile($path, $contents);
    }

    public function writeStream(string $path, $contents, Config $config): void
    {
        $this->client->uploadFile($path, $contents);
    }

    public function read(string $path): string
    {
        return '';
    }

    /**
     * @return resource
     */
    public function readStream(string $path)
    {
        $stream = fopen('php://temp', 'r+');
        if ($stream === false) {
            throw new \RuntimeException('Failed to open temporary stream.');
        }
        return $stream;
    }

    public function delete(string $path): void
    {
        $this->client->deleteFile($path);
    }

    public function deleteDirectory(string $path): void
    {
    }

    public function createDirectory(string $path, Config $config): void
    {
    }

    public function setVisibility(string $path, string $visibility): void
    {
    }

    public function visibility(string $path): FileAttributes
    {
        return new FileAttributes($path, null, 'public');
    }

    public function mimeType(string $path): FileAttributes
    {
        return new FileAttributes($path);
    }

    public function lastModified(string $path): FileAttributes
    {
        return new FileAttributes($path);
    }

    public function fileSize(string $path): FileAttributes
    {
        return new FileAttributes($path);
    }

    public function listContents(string $path, bool $deep): iterable
    {
        return [];
    }

    public function move(string $source, string $destination, Config $config): void
    {
    }

    public function copy(string $source, string $destination, Config $config): void
    {
    }

    public function publicUrl(string $path): string
    {
        return $this->client->getUrl($path);
    }

    public function getUrl(string $path): string
    {
        return $this->client->getUrl($path);
    }
}
