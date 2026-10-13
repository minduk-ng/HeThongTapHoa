<?php

use App\Models\OtpCode;
use Illuminate\Support\Facades\Schedule;

Schedule::call(function () {
    OtpCode::where('expires_at', '<', now())->delete();
})->everyMinute()->name('cleanup-expired-otps');

Schedule::command('cache:prune-expired')->daily();
Schedule::command('idempotency:prune')->daily();
Schedule::command('promotions:aggregate-daily')->dailyAt('03:00');

Schedule::command('planning:aggregate-demand')->dailyAt('00:10')->withoutOverlapping();
Schedule::command('planning:forecast')->dailyAt('00:15')->withoutOverlapping();
Schedule::command('planning:evaluate-models')->weeklyOn(0, '01:00')->withoutOverlapping();
