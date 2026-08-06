<?php

namespace App\Http\Controllers\Staff\Concerns;

use Illuminate\Support\Facades\Log;

trait DispatchesSafely
{
    protected function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
}
