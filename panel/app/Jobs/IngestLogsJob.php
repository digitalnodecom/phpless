<?php

namespace App\Jobs;

use App\Models\App;
use App\Models\AppLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use SplFileObject;

class IngestLogsJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        $logDir = config('phpless.log_dir');

        if (! is_dir($logDir)) {
            return;
        }

        $apps = App::all();

        foreach ($apps as $app) {
            $logFile = "{$logDir}/{$app->slug}.log";

            if (! file_exists($logFile)) {
                continue;
            }

            try {
                $this->ingestAppLogs($app, $logFile);
            } catch (\Throwable $e) {
                Log::warning("Failed to ingest logs for app {$app->slug}: {$e->getMessage()}");
            }
        }
    }

    private function ingestAppLogs(App $app, string $logFile): void
    {
        $cacheKey = "log_ingest_cursor:{$app->id}";
        $cursor = Cache::get($cacheKey, 0);

        $fileSize = filesize($logFile);

        // File was rotated (smaller than cursor), reset
        if ($fileSize < $cursor) {
            $cursor = 0;
        }

        if ($fileSize <= $cursor) {
            return;
        }

        $file = new SplFileObject($logFile, 'r');
        $file->fseek($cursor);

        $batch = [];
        $count = 0;

        while (! $file->eof()) {
            $line = trim($file->fgets());

            if ($line === '') {
                continue;
            }

            $entry = json_decode($line, true);

            if (! $entry || ! isset($entry['ts'])) {
                continue;
            }

            $request = $entry['request'] ?? [];
            $headers = $request['headers'] ?? [];
            $userAgent = '';
            if (isset($headers['User-Agent'])) {
                $ua = $headers['User-Agent'];
                $userAgent = is_array($ua) ? ($ua[0] ?? '') : $ua;
            }

            $batch[] = [
                'app_id' => $app->id,
                'logged_at' => date('Y-m-d H:i:s', (int) $entry['ts']),
                'method' => $request['method'] ?? '-',
                'path' => substr($request['uri'] ?? '-', 0, 2048),
                'status_code' => $entry['status'] ?? 0,
                'duration_ms' => (int) round(($entry['duration'] ?? 0) * 1000),
                'ip' => substr($request['client_ip'] ?? ($request['remote_ip'] ?? '-'), 0, 45),
                'user_agent' => substr($userAgent, 0, 500),
                'response_size' => $entry['size'] ?? 0,
                'raw_json' => $line,
            ];

            $count++;

            // Insert in batches of 500
            if ($count % 500 === 0) {
                AppLog::insert($batch);
                $batch = [];
            }
        }

        if (! empty($batch)) {
            AppLog::insert($batch);
        }

        $newCursor = $file->ftell();
        Cache::put($cacheKey, $newCursor);

        $app->update(['last_log_ingested_at' => now()]);
    }
}
