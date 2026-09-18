<?php

use App\Models\OtpCode;
use Illuminate\Support\Facades\Schedule;

Schedule::call(function () {
    OtpCode::where('expires_at', '<', now())->delete();
})->everyMinute()->name('cleanup-expired-otps');

Schedule::command('cache:prune-expired')->daily();
Schedule::command('idempotency:prune')->daily();
Schedule::command('promotions:aggregate-daily')->dailyAt('03:00');
