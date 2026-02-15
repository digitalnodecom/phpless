<?php

namespace App\Http\Controllers;

use App\Services\VMManagerClient;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request, VMManagerClient $vmManager): Response
    {
        $team = $request->user()->currentTeam;

        $totalApps = $team->apps()->count();
        $runningApps = $team->apps()->where('vm_state', 'running')->count();
        $appLimit = $team->appLimit();

        try {
            $health = $vmManager->health();
            $engineStatus = 'healthy';
        } catch (\Throwable) {
            $health = null;
            $engineStatus = 'unreachable';
        }

        return Inertia::render('dashboard', [
            'stats' => [
                'totalApps' => $totalApps,
                'runningApps' => $runningApps,
                'appLimit' => $appLimit,
                'engineStatus' => $engineStatus,
                'engineHealth' => $health,
            ],
        ]);
    }
}
