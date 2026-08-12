<?php

use App\Models\OtpCode;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(function () {
    OtpCode::where('expires_at', '<', now())->delete();
})->everyMinute()->name('cleanup-expired-otps');

Schedule::command('cache:prune-expired')->daily();
Schedule::command('promotions:aggregate-daily')->dailyAt('03:00');
