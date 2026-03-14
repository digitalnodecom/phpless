<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
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

class AppController extends Controller
{
    public function index(Request $request, VMManagerClient $vmManager): Response
    {
        $apps = $request->user()->currentTeam
            ->apps()
            ->latest()
            ->get();

        // Fetch VM stats (disk, memory, CPU) in one call and key by VM ID.
        $statsByVmId = [];
        try {
            $vms = $vmManager->listVMs();
            foreach ($vms as $vm) {
                $statsByVmId[$vm['id']] = [
                    'disk_used' => $vm['disk_used'] ?? null,
                    'disk_total' => $vm['disk_total'] ?? null,
                    'mem_used' => $vm['mem_used'] ?? null,
                    'cpu_pct' => $vm['cpu_pct'] ?? null,
                ];
            }
        } catch (\Throwable) {
            // Manager unreachable — stats will be omitted
        }

        $appsWithDisk = $apps->map(function (App $app) use ($statsByVmId) {
            $stats = $statsByVmId[$app->vm_id] ?? ['disk_used' => null, 'disk_total' => null, 'mem_used' => null, 'cpu_pct' => null];
            return array_merge($app->toArray(), $stats);
        });

        return Inertia::render('apps/index', [
            'apps' => $appsWithDisk,
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
            'mem_mib' => ['required', 'integer', 'in:256,512,1024'],
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
                $q->with('triggeredBy:id,name')->latest()->limit(10);
            }, 'domains']),
            'serverIp' => config('phpless.server_ip'),
        ]);
    }

    public function rename(Request $request, App $app, CaddyConfigManager $caddy): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'slug' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash', Rule::unique('apps', 'slug')->ignore($app->id)],
        ]);

        $oldSlug = $app->slug;
        $slugChanged = isset($validated['slug']) && $validated['slug'] !== $oldSlug;

        $app->update($validated);

        if ($slugChanged) {
            // Rename the build directory so deploys continue to work
            $oldBuildDir = base_path("../builds/{$oldSlug}");
            $newBuildDir = base_path("../builds/{$app->slug}");

            if (File::isDirectory($oldBuildDir) && ! File::isDirectory($newBuildDir)) {
                File::moveDirectory($oldBuildDir, $newBuildDir);
            }

            $caddy->regenerateAndReload();
        }

        return response()->json(['message' => 'App updated.', 'slug' => $app->slug]);
    }

    public function destroy(App $app, AppLifecycleService $lifecycle): RedirectResponse
    {
        Gate::authorize('delete', $app);

        $name = $app->name;
        $lifecycle->deleteApp($app);

        return redirect()->route('apps.index')
            ->with('success', "App '{$name}' deleted successfully.");
    }

    public function files(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        $subPath = ltrim(str_replace('..', '', $request->query('path', '')), '/');
        $fullPath = $subPath ? $baseDir . '/' . $subPath : $baseDir;

        if (! File::exists($baseDir)) {
            return response()->json(['items' => []]);
        }

        if (! File::exists($fullPath) || ! is_dir($fullPath)) {
            return response()->json(['items' => []]);
        }

        $persistentPaths = $app->persistent_paths ?? [];
        $items = [];

        // Directories first
        foreach (File::directories($fullPath) as $dir) {
            $name = basename($dir);
            $relPath = $subPath ? $subPath . '/' . $name : $name;
            $items[] = [
                'name' => $name,
                'path' => $relPath,
                'type' => 'dir',
                'size' => 0,
                'modified_at' => date('Y-m-d H:i:s', filemtime($dir)),
                'is_persistent' => in_array($relPath, $persistentPaths, true),
            ];
        }

        // Files
        foreach (File::files($fullPath) as $file) {
            $name = $file->getFilename();
            $relPath = $subPath ? $subPath . '/' . $name : $name;
            $items[] = [
                'name' => $name,
                'path' => $relPath,
                'type' => 'file',
                'size' => $file->getSize(),
                'modified_at' => date('Y-m-d H:i:s', $file->getMTime()),
                'is_persistent' => in_array($relPath, $persistentPaths, true),
            ];
        }

        usort($items, fn ($a, $b) => $a['type'] === $b['type']
            ? strcmp($a['name'], $b['name'])
            : ($a['type'] === 'dir' ? -1 : 1));

        return response()->json(['items' => $items]);
    }

    public function filesUpload(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $request->validate([
            'file' => ['required', 'file', 'max:51200'],
            'path' => ['nullable', 'string', 'max:500'],
        ]);

        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        File::ensureDirectoryExists($baseDir, 0755);

        $uploadedFile = $request->file('file');
        $relativePath = ltrim(str_replace('..', '', $request->input('path') ?: $uploadedFile->getClientOriginalName()), '/');
        $destination = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);
        $uploadedFile->move(dirname($destination), basename($destination));

        return response()->json(['message' => 'Uploaded.', 'path' => $relativePath]);
    }

    public function filesWrite(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $request->validate([
            'path'    => ['required', 'string', 'max:500'],
            'content' => ['present', 'nullable', 'string'],
        ]);

        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->input('path')), '/');
        $destination = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);
        File::put($destination, $request->input('content', ''));

        return response()->json(['message' => 'Saved.', 'path' => $relativePath]);
    }

    public function filesDelete(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->input('path')), '/');
        $target = $baseDir . '/' . $relativePath;

        if (File::exists($target) && str_starts_with(realpath($target), realpath($baseDir))) {
            if (is_dir($target)) {
                File::deleteDirectory($target);
            } else {
                File::delete($target);
            }
        }

        return response()->json(['message' => 'Deleted.']);
    }

    public function filesDownload(Request $request, App $app)
    {
        Gate::authorize('view', $app);

        $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->query('path')), '/');
        $target = $baseDir . '/' . $relativePath;

        if (! File::exists($target) || ! str_starts_with(realpath($target), realpath($baseDir))) {
            abort(404);
        }

        return response()->download($target, basename($target));
    }

    public function setPersistent(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $request->validate([
            'path'       => ['required', 'string', 'max:500'],
            'persistent' => ['required', 'boolean'],
        ]);

        $path = ltrim(str_replace('..', '', $request->input('path')), '/');
        $paths = $app->persistent_paths ?? [];

        if ($request->boolean('persistent')) {
            if (! in_array($path, $paths, true)) {
                $paths[] = $path;
            }
        } else {
            $paths = array_values(array_filter($paths, fn ($p) => $p !== $path));
        }

        $app->update(['persistent_paths' => $paths]);

        return response()->json(['message' => 'Updated.', 'persistent_paths' => $paths]);
    }

    public function deploy(App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): RedirectResponse
    {
        Gate::authorize('view', $app);

        if (! $app->vm_id) {
            return back()->withErrors(['deploy' => 'App has no VM assigned.']);
        }

        $buildDir = base_path("../builds/{$app->slug}");

        if (! File::isDirectory($buildDir) || count(File::allFiles($buildDir)) === 0) {
            return back()->withErrors(['deploy' => 'No code to deploy. Upload a tarball first.']);
        }

        try {
            $envContent = $envService->generateEnvContent($app);
            $caddyContent = (new CaddyfileGenerator)->generate($app);
            $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig);

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
            $app->refresh();

            // Update Caddy config with new VM IP
            $caddy->regenerateAndReload();

            // Reapply port forwarding rules with the new VM IP
            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings); } catch (\Throwable) {}
            }

            $app->deployments()->create([
                'triggered_by' => auth()->id(),
                'status' => 'succeeded',
                'commit_message' => 'In-browser deploy',
                'source' => 'web',
                'started_at' => now(),
                'completed_at' => now(),
            ]);

            return back()->with('success', 'Deployed successfully.');
        } catch (\RuntimeException $e) {
            return back()->withErrors(['deploy' => $e->getMessage()]);
        }
    }

    public function updateSettings(Request $request, App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'worker_mode' => 'boolean',
            'worker_script' => 'string|max:255',
            'worker_count' => 'integer|min:1|max:16',
            'mercure_enabled' => 'boolean',
            'vcpus' => 'nullable|integer|in:1,2',
            'mem_mib' => 'nullable|integer|in:256,512,1024',
            'web_root' => 'nullable|string|max:100',
        ]);

        $needsVMResize = $app->vm_id && (
            (isset($validated['vcpus']) && (int) $validated['vcpus'] !== (int) $app->vcpus) ||
            (isset($validated['mem_mib']) && (int) $validated['mem_mib'] !== (int) $app->mem_mib)
        );

        $app->update($validated);

        if (! $needsVMResize) {
            return response()->json(['message' => 'Settings updated. Redeploy to apply changes.']);
        }

        // Resize: destroy old VM, create new with updated specs, redeploy code
        try {
            $vmManager->destroyVM($app->vm_id);

            $vm = $vmManager->createVM($app->slug, $app->vcpus, $app->mem_mib);
            $newVmId = $vm['id'];
            $app->update(['vm_id' => $newVmId, 'vm_state' => 'starting']);

            // Redeploy code if it exists
            $buildDir = base_path("../builds/{$app->slug}");
            if (File::isDirectory($buildDir)) {
                $envContent = $envService->generateEnvContent($app);
                $caddyContent = (new CaddyfileGenerator)->generate($app);
                $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
                $result = $vmManager->deployCode($newVmId, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig);
                $newVmId = $result['vm_id'] ?? $newVmId;
            }

            $vm = $vmManager->waitForRunning($newVmId, 20);
            $app->update([
                'vm_id' => $newVmId,
                'vm_state' => $vm['state'] ?? 'running',
                'vm_ip' => $vm['ip'] ?? $app->vm_ip,
            ]);
            $app->refresh();

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings); } catch (\Throwable) {}
            }

            return response()->json(['message' => 'VM resized and redeployed successfully.', 'resized' => true]);
        } catch (\Throwable $e) {
            $app->update(['vm_state' => 'error']);
            return response()->json(['message' => 'Resize failed: ' . $e->getMessage()], 500);
        }
    }

    public function updatePortMappings(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'port_mappings' => ['present', 'array'],
            'port_mappings.*.external' => ['required', 'integer', 'min:1', 'max:65535'],
            'port_mappings.*.internal' => ['required', 'integer', 'min:1', 'max:65535'],
            'port_mappings.*.protocol' => ['required', 'string', 'in:tcp,udp'],
        ]);

        $reserved = [22, 80, 443, 7474, 9111];
        foreach ($validated['port_mappings'] as $mapping) {
            if (in_array($mapping['external'], $reserved, true)) {
                return response()->json([
                    'message' => "Port {$mapping['external']} is reserved and cannot be forwarded.",
                ], 422);
            }
        }

        // Check for conflicts with other apps
        $externalPorts = array_column($validated['port_mappings'], 'external');
        if (count($externalPorts) > 0) {
            $otherApps = App::where('id', '!=', $app->id)
                ->whereNotNull('port_mappings')
                ->get();

            foreach ($otherApps as $other) {
                foreach ($other->port_mappings ?? [] as $existing) {
                    if (in_array($existing['external'], $externalPorts, true)) {
                        return response()->json([
                            'message' => "Port {$existing['external']} is already used by app '{$other->name}'.",
                        ], 422);
                    }
                }
            }
        }

        $app->update(['port_mappings' => $validated['port_mappings']]);

        // Apply immediately if VM is running
        if ($app->vm_ip && $app->vm_state === 'running') {
            try {
                if (empty($validated['port_mappings'])) {
                    $vmManager->removePortMappings($app->vm_ip);
                } else {
                    $vmManager->applyPortMappings($app->vm_ip, $validated['port_mappings']);
                }
            } catch (\Throwable) {
                // Save succeeded, rules will be applied on next deploy
            }
        }

        return response()->json(['message' => 'Port mappings updated.']);
    }

    public function updateWorkers(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'workers' => ['present', 'array'],
            'workers.*.name' => ['required', 'string', 'max:50'],
            'workers.*.command' => ['required', 'string', 'max:500'],
            'workers.*.processes' => ['required', 'integer', 'min:1', 'max:8'],
        ]);

        $app->update(['workers' => $validated['workers']]);

        return response()->json(['message' => 'Workers updated. Redeploy to apply.']);
    }

    public function workerStatus(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['workers' => [], 'error' => 'VM not running']);
        }

        try {
            // Query the worker manager's HTTP API inside the VM via the host-side manager
            $response = $vmManager->getWorkerStatus($app->vm_ip);

            return response()->json(['workers' => $response]);
        } catch (\Throwable $e) {
            return response()->json(['workers' => [], 'error' => 'Could not reach worker manager']);
        }
    }

    public function workerLogs(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $name = $request->query('name', '');
        $index = (int) $request->query('index', 0);
        $lines = (int) $request->query('lines', 100);

        if (! $app->vm_ip || $app->vm_state !== 'running' || $name === '') {
            return response()->json(['lines' => []]);
        }

        try {
            $response = $vmManager->getWorkerLogs($app->vm_ip, $name, $index, $lines);

            return response()->json($response);
        } catch (\Throwable) {
            return response()->json(['lines' => []]);
        }
    }

    public function generateMercureKeys(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $publisherKey = Str::random(64);
        $subscriberKey = Str::random(64);

        foreach (['MERCURE_PUBLISHER_JWT_KEY' => $publisherKey, 'MERCURE_SUBSCRIBER_JWT_KEY' => $subscriberKey] as $key => $value) {
            \App\Models\EnvironmentVariable::updateOrCreate(
                ['app_id' => $app->id, 'key' => $key, 'team_id' => null],
                ['value' => $value, 'is_secret' => false],
            );
        }

        return response()->json(['message' => 'JWT keys generated. Redeploy to apply.']);
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

    public function logs(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        // Fetch VM console logs (FrankenPHP startup + PHP errors)
        $consoleLogs = [];
        if ($app->vm_id) {
            try {
                $consoleLogs = $vmManager->getVMLogs($app->vm_id);
            } catch (\Throwable) {
                // Manager unreachable or VM has no log yet
            }
        }

        $lines = [];

        $slug = $app->slug;
        $raw = [];
        exec('sudo /usr/local/bin/phpless-read-log ' . escapeshellarg($slug) . ' 200 2>/dev/null', $raw);

        foreach ($raw as $line) {
            $line = trim($line);
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
                'method'    => $request['method'] ?? '-',
                'path'      => $request['uri'] ?? '-',
                'status'    => $entry['status'] ?? 0,
                'duration'  => round(($entry['duration'] ?? 0) * 1000, 1),
                'client_ip' => $request['client_ip'] ?? ($request['remote_ip'] ?? '-'),
                'size'      => $entry['size'] ?? 0,
            ];
        }

        return response()->json(['logs' => $lines, 'console_logs' => $consoleLogs]);
    }

}
