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

        $this->info("Synchronization finished: {$successCount} uploaded successfully, {$failCount} failed.");

        return Command::SUCCESS;
    }
}
