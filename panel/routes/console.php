<?php

use App\Jobs\AggregateAppMetrics;
use App\Jobs\CleanupExpiredPreviewsJob;
use App\Jobs\CleanupLogsJob;
use App\Jobs\IngestLogsJob;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new AggregateAppMetrics)->everyFiveMinutes();
Schedule::job(new IngestLogsJob)->everyFiveMinutes();
Schedule::job(new CleanupLogsJob)->daily();
Schedule::job(new CleanupExpiredPreviewsJob)->hourly();
Schedule::command('billing:report-usage')->hourly();
