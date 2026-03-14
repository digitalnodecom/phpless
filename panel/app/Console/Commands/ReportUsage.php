<?php

namespace App\Console\Commands;

use App\Models\RequestMetric;
use App\Models\Team;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ReportUsage extends Command
{
    protected $signature = 'billing:report-usage';

    protected $description = 'Report metered HTTP request usage to Stripe for all subscribed teams';

    public function handle(): int
    {
        // Only report metrics from completed periods (older than 1 hour) to avoid partial counts.
        $cutoff = Carbon::now()->subHour();

        // Load unreported metrics, grouped by team via their apps.
        $rows = RequestMetric::query()
            ->whereNull('stripe_reported_at')
            ->where('period', '<', $cutoff)
            ->join('apps', 'request_metrics.app_id', '=', 'apps.id')
            ->select('apps.team_id', DB::raw('SUM(request_metrics.requests) as total_requests'))
            ->selectRaw('GROUP_CONCAT(request_metrics.id) as metric_ids')
            ->groupBy('apps.team_id')
            ->get();

        if ($rows->isEmpty()) {
            $this->info('No unreported usage found.');
            return 0;
        }

        foreach ($rows as $row) {
            $team = Team::find($row->team_id);

            if (! $team || ! $team->subscribed('default')) {
                // Mark as reported anyway so we don't accumulate unbillable rows.
                $ids = explode(',', $row->metric_ids);
                RequestMetric::whereIn('id', $ids)->update(['stripe_reported_at' => now()]);
                continue;
            }

            $ids = explode(',', $row->metric_ids);
            $total = (int) $row->total_requests;

            try {
                $team->subscription('default')->reportUsage($total);
                RequestMetric::whereIn('id', $ids)->update(['stripe_reported_at' => now()]);
                $this->info("Team {$team->slug}: reported {$total} requests.");
            } catch (\Throwable $e) {
                $this->error("Team {$team->slug}: failed to report usage — {$e->getMessage()}");
            }
        }

        return 0;
    }
}
