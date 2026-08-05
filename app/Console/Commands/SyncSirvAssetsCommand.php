<?php

namespace App\Console\Commands;

use App\Services\Sirv\SirvClientService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class SyncSirvAssetsCommand extends Command
{
    protected $signature = 'sirv:sync';
    protected $description = 'Upload local static assets (logo, banner, QR) to Sirv CDN';

    public function handle(SirvClientService $sirvClient): int
    {
        $this->info('Starting Sirv CDN asset synchronization...');

        $directories = [
            public_path('logo') => 'logo',
            public_path('banner') => 'banner',
            public_path('QR_chuyen_khoan') => 'QR_chuyen_khoan',
            storage_path('app/public/products') => 'products',
            storage_path('app/public/menu') => 'products',
        ];

        $filesToUpload = [];

        foreach ($directories as $localDir => $targetPrefix) {
            if (!File::exists($localDir)) {
                continue;
            }

            $files = File::allFiles($localDir);
            foreach ($files as $file) {
                $relativePath = $targetPrefix . '/' . $file->getRelativePathname();
                $filesToUpload[] = [
                    'full_path' => $file->getRealPath(),
                    'sirv_path' => str_replace('\\', '/', $relativePath),
                ];
            }
        }

        if (empty($filesToUpload)) {
            $this->warn('No local asset files found to upload.');
            return Command::SUCCESS;
        }

        $bar = $this->output->createProgressBar(count($filesToUpload));
        $bar->start();

        $successCount = 0;
        $failCount = 0;

        foreach ($filesToUpload as $item) {
            $contents = file_get_contents($item['full_path']);
            $success = $sirvClient->uploadFile($item['sirv_path'], $contents);

            if ($success) {
                $successCount++;
            } else {
                $failCount++;
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        $this->info("Asset files upload finished: {$successCount} uploaded, {$failCount} failed.");

        // Sync MenuItem records in Database with local image paths
        $this->info('Updating MenuItem image records in Database...');
        $localProducts = \App\Models\MenuItem::whereNotNull('image')
            ->where(function ($q) {
                $q->where('image', 'like', '/storage/%')
                  ->orWhere('image', 'like', 'storage/%');
            })->get();

        $dbUpdatedCount = 0;
        foreach ($localProducts as $product) {
            $relativePath = str_replace(['/storage/', 'storage/'], '', $product->image);
            $localFullPath = storage_path('app/public/' . $relativePath);

            if (File::exists($localFullPath)) {
                $filename = basename($relativePath);
                $sirvPath = 'products/' . $filename;
                $contents = file_get_contents($localFullPath);

                if ($sirvClient->uploadFile($sirvPath, $contents)) {
                    $cdnUrl = $sirvClient->getUrl($sirvPath);
                    $product->forceFill(['image' => $cdnUrl])->save();
                    $dbUpdatedCount++;
                }
            }
        }

        $this->info("Updated {$dbUpdatedCount} MenuItem image URLs in database to Sirv CDN.");

        return Command::SUCCESS;
    }
}
