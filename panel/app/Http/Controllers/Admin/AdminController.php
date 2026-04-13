<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\App;
use App\Models\RequestMetric;
use App\Models\Team;
use App\Models\User;
use App\Services\VMManagerClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    public function index(VMManagerClient $vmManager): Response
    {
        $periodStart = now()->startOfMonth();

        // Host-wide stats from the manager (RAM, CPU, disk, load)
        $host = $vmManager->hostStats();

        // VM stats from the manager — aggregate memory/cpu/disk across all VMs
        $vms = [];
        try {
            $vms = $vmManager->listVMs();
        } catch (\Throwable) {}

        $runningVms = 0;
        $totalVmMemAllocated = 0;
        $totalVmMemUsed = 0;
        $totalVmDiskUsed = 0;
        $totalVmDiskTotal = 0;
        $totalVmCpuPct = 0.0;

        foreach ($vms as $vm) {
            if (($vm['state'] ?? null) === 'running') {
                $runningVms++;
                $totalVmCpuPct += $vm['cpu_pct'] ?? 0;
            }
            $totalVmMemAllocated += ($vm['mem_mib'] ?? 0) * 1024 * 1024;
            $totalVmMemUsed += $vm['mem_used'] ?? 0;
            $totalVmDiskUsed += $vm['disk_used'] ?? 0;
            $totalVmDiskTotal += $vm['disk_total'] ?? 0;
        }

        // Global counts
        $totalApps = App::count();
        $totalUsers = User::count();
        $totalTeams = Team::count();
        $totalRequestsThisMonth = (int) RequestMetric::where('period', '>=', $periodStart)->sum('requests');

        // Get request counts per team for this month.
        $usageByTeam = RequestMetric::query()
            ->join('apps', 'request_metrics.app_id', '=', 'apps.id')
            ->where('request_metrics.period', '>=', $periodStart)
            ->select('apps.team_id', DB::raw('SUM(request_metrics.requests) as total_requests'))
            ->groupBy('apps.team_id')
            ->pluck('total_requests', 'apps.team_id')
            ->map(fn ($v) => (int) $v);

        $teams = Team::with('owner')->get()->map(function (Team $team) use ($usageByTeam) {
            $subscription = $team->subscription('default');

            return [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'owner_name' => $team->owner->name ?? '—',
                'owner_email' => $team->owner->email ?? '—',
                'stripe_id' => $team->stripe_id,
                'subscription_status' => $subscription?->stripe_status,
                'requests_this_month' => $usageByTeam->get($team->id, 0),
                'app_count' => $team->apps()->count(),
                'created_at' => $team->created_at->toDateString(),
            ];
        });

        return Inertia::render('admin/index', [
            'teams' => $teams,
            'stats' => [
                'host' => $host,
                'vms' => [
                    'total' => count($vms),
                    'running' => $runningVms,
                    'mem_allocated' => $totalVmMemAllocated,
                    'mem_used' => $totalVmMemUsed,
                    'disk_used' => $totalVmDiskUsed,
                    'disk_total' => $totalVmDiskTotal,
                    'cpu_pct_sum' => round($totalVmCpuPct, 1),
                ],
                'total_apps' => $totalApps,
                'total_users' => $totalUsers,
                'total_teams' => $totalTeams,
                'total_requests_this_month' => $totalRequestsThisMonth,
            ],
        ]);
    }

    public function showTeam(Team $team): Response
    {
        $subscription = $team->subscription('default');

        // Daily request counts for the current month.
        $dailyUsage = RequestMetric::query()
            ->join('apps', 'request_metrics.app_id', '=', 'apps.id')
            ->where('apps.team_id', $team->id)
            ->where('request_metrics.period', '>=', now()->startOfMonth())
            ->select(
                DB::raw("strftime('%Y-%m-%d', request_metrics.period) as day"),
                DB::raw('SUM(request_metrics.requests) as requests')
            )
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $invoices = [];
        if ($team->hasStripeId()) {
            try {
                $invoices = $team->invoices()->map(fn ($inv) => [
                    'id' => $inv->id,
                    'date' => $inv->date()->toDateString(),
                    'total' => $inv->total(),
                    'status' => $inv->status,
                ])->take(12)->values()->all();
            } catch (\Throwable) {}
        }

        return Inertia::render('admin/team', [
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'stripe_id' => $team->stripe_id,
                'pm_type' => $team->pm_type,
                'pm_last_four' => $team->pm_last_four,
                'created_at' => $team->created_at->toDateString(),
            ],
            'members' => $team->users->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'role' => $u->pivot->role,
            ]),
            'subscription' => $subscription ? [
                'status' => $subscription->stripe_status,
                'trial_ends_at' => $subscription->trial_ends_at?->toDateString(),
                'ends_at' => $subscription->ends_at?->toDateString(),
                'stripe_id' => $subscription->stripe_id,
            ] : null,
            'daily_usage' => $dailyUsage,
            'invoices' => $invoices,
            'app_count' => $team->apps()->count(),
        ]);
    }
}
