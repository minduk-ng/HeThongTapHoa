<?php

namespace App\Providers;

use App\Services\Sirv\SirvClientService;
use App\Services\Sirv\SirvFlysystemAdapter;
use Illuminate\Filesystem\FilesystemAdapter as LaravelFilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;
use League\Flysystem\Filesystem;

class SirvStorageServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SirvClientService::class, function () {
            return new SirvClientService();
        });
    }

    public function boot(): void
    {
        Storage::extend('sirv', function ($app, $config) {
            $client = $app->make(SirvClientService::class);
            $adapter = new SirvFlysystemAdapter($client);
            $filesystem = new Filesystem($adapter);

            return new LaravelFilesystemAdapter($filesystem, $adapter, $config);
        });
    }
}
