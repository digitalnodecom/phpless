<?php

namespace App\Jobs;

use App\Models\App;
use App\Models\AppLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class CleanupLogsJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        $plans = config('phpless.plans');

        // Group apps by plan for efficient deletion
        $apps = App::with('team')->get();

        foreach ($apps as $app) {
            $plan = $app->team->plan ?? 'sandbox';
            $retentionDays = $plans[$plan]['log_retention_days'] ?? 7;

            $cutoff = now()->subDays($retentionDays);

            try {
                $deleted = AppLog::where('app_id', $app->id)
                    ->where('logged_at', '<', $cutoff)
                    ->delete();

                if ($deleted > 0) {
                    Log::info("Cleaned up {$deleted} log entries for app {$app->slug} (retention: {$retentionDays}d)");
                }
            } catch (\Throwable $e) {
                Log::warning("Failed to cleanup logs for app {$app->slug}: {$e->getMessage()}");
            }
        }
    }
}
