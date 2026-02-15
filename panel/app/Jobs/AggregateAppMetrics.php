<?php

namespace App\Jobs;

use App\Models\App;
use App\Models\RequestMetric;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use SplFileObject;

class AggregateAppMetrics implements ShouldQueue
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
                $this->processAppLog($app, $logFile);
            } catch (\Throwable $e) {
                Log::warning("Failed to aggregate metrics for app {$app->slug}: {$e->getMessage()}");
            }
        }
    }

    private function processAppLog(App $app, string $logFile): void
    {
        $cacheKey = "metrics_cursor:{$app->id}";
        $cursor = Cache::get($cacheKey, 0);

        $fileSize = filesize($logFile);

        // File was rotated (smaller than cursor), reset
        if ($fileSize < $cursor) {
            $cursor = 0;
        }

        // Nothing new to read
        if ($fileSize <= $cursor) {
            return;
        }

        $file = new SplFileObject($logFile, 'r');
        $file->fseek($cursor);

        // Group entries by hour
        $hourly = [];

        while (! $file->eof()) {
            $line = trim($file->fgets());

            if ($line === '') {
                continue;
            }

            $entry = json_decode($line, true);

            if (! $entry || ! isset($entry['ts'])) {
                continue;
            }

            // Caddy JSON log format: ts is unix float, status in resp_headers
            $timestamp = (float) $entry['ts'];
            $period = date('Y-m-d H:00:00', (int) $timestamp);

            $status = $entry['status'] ?? 0;
            $duration = $entry['duration'] ?? 0;
            $size = $entry['size'] ?? 0;

            if (! isset($hourly[$period])) {
                $hourly[$period] = [
                    'requests' => 0,
                    'total_duration' => 0,
                    'status_2xx' => 0,
                    'status_3xx' => 0,
                    'status_4xx' => 0,
                    'status_5xx' => 0,
                    'bytes_sent' => 0,
                ];
            }

            $hourly[$period]['requests']++;
            $hourly[$period]['total_duration'] += $duration;
            $hourly[$period]['bytes_sent'] += $size;

            if ($status >= 200 && $status < 300) {
                $hourly[$period]['status_2xx']++;
            } elseif ($status >= 300 && $status < 400) {
                $hourly[$period]['status_3xx']++;
            } elseif ($status >= 400 && $status < 500) {
                $hourly[$period]['status_4xx']++;
            } elseif ($status >= 500) {
                $hourly[$period]['status_5xx']++;
            }
        }

        $newCursor = $file->ftell();

        // Upsert metrics for each hour
        foreach ($hourly as $period => $data) {
            $existing = RequestMetric::where('app_id', $app->id)
                ->where('period', $period)
                ->first();

            if ($existing) {
                $totalRequests = $existing->requests + $data['requests'];
                $avgDuration = (($existing->avg_duration * $existing->requests) + $data['total_duration']) / $totalRequests;

                $existing->update([
                    'requests' => $totalRequests,
                    'avg_duration' => $avgDuration,
                    'status_2xx' => $existing->status_2xx + $data['status_2xx'],
                    'status_3xx' => $existing->status_3xx + $data['status_3xx'],
                    'status_4xx' => $existing->status_4xx + $data['status_4xx'],
                    'status_5xx' => $existing->status_5xx + $data['status_5xx'],
                    'bytes_sent' => $existing->bytes_sent + $data['bytes_sent'],
                ]);
            } else {
                RequestMetric::create([
                    'app_id' => $app->id,
                    'period' => $period,
                    'requests' => $data['requests'],
                    'avg_duration' => $data['requests'] > 0
                        ? $data['total_duration'] / $data['requests']
                        : 0,
                    'status_2xx' => $data['status_2xx'],
                    'status_3xx' => $data['status_3xx'],
                    'status_4xx' => $data['status_4xx'],
                    'status_5xx' => $data['status_5xx'],
                    'bytes_sent' => $data['bytes_sent'],
                ]);
            }
        }

        Cache::put($cacheKey, $newCursor);
    }
}
