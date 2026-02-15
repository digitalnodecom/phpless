<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\EnvironmentVariableService;
use App\Services\VMManagerClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use SplFileObject;

class AppController extends Controller
{
    public function index(Request $request): Response
    {
        $apps = $request->user()->currentTeam
            ->apps()
            ->latest()
            ->get();

        return Inertia::render('apps/index', [
            'apps' => $apps,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('apps/create');
    }

    public function store(Request $request, AppLifecycleService $lifecycle): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('apps', 'slug')],
            'vcpus' => ['required', 'integer', 'in:1,2'],
            'mem_mib' => ['required', 'integer', 'in:128,256,512,1024'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $team = $request->user()->currentTeam;

        try {
            $app = $lifecycle->createApp($team, $validated);

            return redirect()->route('apps.show', $app)
                ->with('success', "App '{$app->name}' created successfully.");
        } catch (\RuntimeException $e) {
            return back()->withErrors(['name' => $e->getMessage()]);
        }
    }

    public function show(Request $request, App $app, VMManagerClient $vmManager): Response
    {
        Gate::authorize('view', $app);

        // Sync VM state
        if ($app->vm_id) {
            try {
                $vm = $vmManager->getVM($app->vm_id);
                $app->update([
                    'vm_state' => $vm['state'] ?? $app->vm_state,
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ]);
                $app->refresh();
            } catch (\Throwable) {
                // VM manager unreachable, use cached state
            }
        }

        return Inertia::render('apps/show', [
            'app' => $app->load(['deployments' => function ($q) {
                $q->latest()->limit(10);
            }, 'domains']),
        ]);
    }

    public function destroy(App $app, AppLifecycleService $lifecycle): RedirectResponse
    {
        Gate::authorize('delete', $app);

        $name = $app->name;
        $lifecycle->deleteApp($app);

        return redirect()->route('apps.index')
            ->with('success', "App '{$name}' deleted successfully.");
    }

    public function code(App $app): Response
    {
        Gate::authorize('view', $app);

        $buildPath = base_path("../builds/{$app->slug}/index.php");

        $code = File::exists($buildPath)
            ? File::get($buildPath)
            : "<?php\n\necho \"Hello from {$app->name}!\";\n";

        return Inertia::render('apps/code', [
            'app' => $app,
            'code' => $code,
        ]);
    }

    public function updateCode(Request $request, App $app): RedirectResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:1048576'],
        ]);

        $buildDir = base_path("../builds/{$app->slug}");
        File::ensureDirectoryExists($buildDir);
        File::put("{$buildDir}/index.php", $validated['code']);

        return back()->with('success', 'Code saved.');
    }

    public function deploy(App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): RedirectResponse
    {
        Gate::authorize('view', $app);

        if (! $app->vm_id) {
            return back()->withErrors(['deploy' => 'App has no VM assigned.']);
        }

        $buildDir = base_path("../builds/{$app->slug}");

        if (! File::exists("{$buildDir}/index.php")) {
            return back()->withErrors(['deploy' => 'No code to deploy. Save your code first.']);
        }

        try {
            $envContent = $envService->generateEnvContent($app);
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent);

            // Deploy restarts the VM — sync the new VM state
            $newVmId = $result['vm_id'] ?? $app->vm_id;
            try {
                $vm = $vmManager->waitForRunning($newVmId, 15);
                $app->update([
                    'vm_id' => $newVmId,
                    'vm_state' => $vm['state'] ?? 'running',
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ]);
            } catch (\Throwable) {
                $app->update(['vm_id' => $newVmId]);
            }

            // Update Caddy config with new VM IP
            $caddy->regenerateAndReload();

            $app->deployments()->create([
                'triggered_by' => auth()->id(),
                'status' => 'succeeded',
                'commit_message' => 'In-browser deploy',
                'started_at' => now(),
                'completed_at' => now(),
            ]);

            return back()->with('success', 'Deployed successfully.');
        } catch (\RuntimeException $e) {
            return back()->withErrors(['deploy' => $e->getMessage()]);
        }
    }

    public function analytics(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $metrics = $app->requestMetrics()
            ->where('period', '>=', now()->subDays(7))
            ->orderBy('period')
            ->get();

        $totalRequests = $metrics->sum('requests');
        $totalErrors = $metrics->sum('status_4xx') + $metrics->sum('status_5xx');

        return response()->json([
            'metrics' => $metrics,
            'summary' => [
                'total_requests' => $totalRequests,
                'avg_duration' => $totalRequests > 0
                    ? round($metrics->sum(fn ($m) => $m->avg_duration * $m->requests) / $totalRequests, 4)
                    : 0,
                'error_rate' => $totalRequests > 0
                    ? round($totalErrors / $totalRequests * 100, 1)
                    : 0,
                'total_bytes' => $metrics->sum('bytes_sent'),
            ],
        ]);
    }

    public function logs(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $logPath = config('phpless.log_dir') . '/' . $app->slug . '.log';

        if (! file_exists($logPath)) {
            return response()->json(['logs' => []]);
        }

        $lines = [];

        try {
            $file = new SplFileObject($logPath, 'r');
            $file->seek(PHP_INT_MAX);
            $totalLines = $file->key();

            $start = max(0, $totalLines - 100);
            $file->seek($start);

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

                $lines[] = [
                    'timestamp' => date('Y-m-d H:i:s', (int) $entry['ts']),
                    'method' => $request['method'] ?? '-',
                    'path' => $request['uri'] ?? '-',
                    'status' => $entry['status'] ?? 0,
                    'duration' => round(($entry['duration'] ?? 0) * 1000, 1),
                    'client_ip' => $request['client_ip'] ?? ($request['remote_ip'] ?? '-'),
                    'size' => $entry['size'] ?? 0,
                ];
            }
        } catch (\Throwable) {
            // Log file unreadable
        }

        return response()->json(['logs' => $lines]);
    }
}
