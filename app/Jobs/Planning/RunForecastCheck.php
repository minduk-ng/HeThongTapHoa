<?php

namespace App\Jobs\Planning;

use App\Models\ForecastCheck;
use App\Services\Forecasting\ForecastCheckService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Throwable;

class RunForecastCheck implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 120;

    public int $tries = 3;

    public function __construct(public int $checkId) {}

    public function handle(ForecastCheckService $service): void
    {
        $lock = Cache::lock("forecast-check-{$this->checkId}", 180);
        $acquired = $lock->block(5);
        if (! $acquired) {
            $this->release(10);

            return;
        }

        try {
            $check = ForecastCheck::find($this->checkId);
            if (! $check || $check->status === 'completed') {
                return;
            }

            // Version guard: verify snapshot versions match current code
            $snapshotVersions = (array) ($check->input_snapshot['versions'] ?? []);
            foreach (ForecastCheck::VERSIONS as $k => $expectedVer) {
                if (($snapshotVersions[$k] ?? null) !== $expectedVer) {
                    $check->update([
                        'status' => 'failed',
                        'error_message' => "Không khớp phiên bản mã nguồn ({$k}). Vui lòng tạo lượt kiểm tra mới.",
                    ]);

                    return;
                }
            }

            $check->update([
                'status' => 'running',
                'attempts' => $check->attempts + 1,
                'started_at' => now(),
            ]);

            try {
                $result = $service->calculate($check->input_snapshot);

                $check->update([
                    'status' => 'completed',
                    'result' => $result,
                    'completed_at' => now(),
                    'error_message' => null,
                ]);
            } catch (Throwable $e) {
                $check->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                ]);
            }
        } finally {
            optional($lock)->release();
        }
    }
}
