<?php

namespace App\Http\Controllers;

use App\Jobs\GitDeployJob;
use App\Models\App;
use App\Models\Deployment;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
use App\Services\EnvironmentVariableService;
use App\Services\FrameworkDetector;
use App\Services\SqliteDetector;
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

        $team = $request->user()->currentTeam;

        return Inertia::render('apps/index', [
            'apps' => $appsWithDisk,
            'plan' => $team->plan,
            'planLabel' => $team->planConfig()['label'],
        ]);
    }

    public function create(Request $request): Response
    {
        $team = $request->user()->currentTeam;
        $planConfig = $team->planConfig();

        return Inertia::render('apps/create', [
            'plan' => [
                'name' => $team->plan,
                'label' => $planConfig['label'],
                'app_limit' => $team->appLimit(),
                'max_mem_mib' => $team->maxMemMib(),
                'max_vcpus' => $team->maxVcpus(),
            ],
            'app_count' => $team->apps()->count(),
        ]);
    }

    public function store(Request $request, AppLifecycleService $lifecycle): RedirectResponse
    {
        Gate::authorize('create', App::class);

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
                $app->forceFill([
                    'vm_state' => $vm['state'] ?? $app->vm_state,
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ])->save();
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
        Gate::authorize('update', $app);

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

    public function files(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $subPath = ltrim(str_replace('..', '', $request->query('path', '')), '/');

        // If VM is running, read from live filesystem
        if ($app->vm_ip && $app->vm_state === 'running') {
            try {
                return $this->filesFromVM($app, $vmManager, $subPath);
            } catch (\Throwable) {
                // Fall back to build dir
            }
        }

        // Fallback: read from build directory
        return $this->filesFromBuildDir($app, $subPath);
    }

    private function filesFromVM(App $app, VMManagerClient $vmManager, string $subPath): JsonResponse
    {
        $vmPath = $subPath ? "/app/{$subPath}" : '/app';

        $output = $vmManager->execInVM(
            $app->vm_ip,
            'php /usr/local/lib/phpless-ls.php ' . escapeshellarg($vmPath),
        );

        $vmItems = json_decode($output, true) ?? [];
        $persistentPaths = $app->persistent_paths ?? [];
        $items = [];

        foreach ($vmItems as $item) {
            $relPath = $subPath ? $subPath . '/' . $item['name'] : $item['name'];
            $items[] = [
                'name' => $item['name'],
                'path' => $relPath,
                'type' => $item['type'],
                'size' => $item['size'],
                'modified_at' => date('Y-m-d H:i:s', $item['mtime']),
                'is_persistent' => in_array($relPath, $persistentPaths, true),
            ];
        }

        usort($items, fn ($a, $b) => $a['type'] === $b['type']
            ? strcmp($a['name'], $b['name'])
            : ($a['type'] === 'dir' ? -1 : 1));

        return response()->json(['items' => $items, 'source' => 'vm']);
    }

    private function filesFromBuildDir(App $app, string $subPath): JsonResponse
    {
        $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
        $fullPath = $subPath ? $baseDir . '/' . $subPath : $baseDir;

        if (! File::exists($baseDir) || ! File::exists($fullPath) || ! is_dir($fullPath)) {
            return response()->json(['items' => [], 'source' => 'build']);
        }

        $persistentPaths = $app->persistent_paths ?? [];
        $items = [];

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

        return response()->json(['items' => $items, 'source' => 'build']);
    }

    public function filesUpload(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $request->validate([
            'file' => ['required', 'file', 'max:1048576'],
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
        Gate::authorize('update', $app);

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
        Gate::authorize('update', $app);

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
        Gate::authorize('update', $app);

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
        Gate::authorize('deploy', $app);

        if (! $app->vm_id) {
            return back()->withErrors(['deploy' => 'App has no VM assigned.']);
        }

        $buildDir = base_path("../builds/{$app->slug}");

        if (! File::isDirectory($buildDir) || count(File::allFiles($buildDir)) === 0) {
            return back()->withErrors(['deploy' => 'No code to deploy. Upload a tarball first.']);
        }

        // Run framework detection
        $detected = FrameworkDetector::detect($buildDir);
        $app->update(['detected_framework' => $detected['framework']]);

        if ((! $app->web_root || $app->web_root === '/') && $detected['web_root'] !== '/') {
            $app->update(['web_root' => $detected['web_root']]);
        }
        if (! $app->build_command && $detected['build_command']) {
            $app->update(['build_command' => $detected['build_command']]);
        }

        // Detect SQLite databases and auto-persist them
        $detectedDbs = SqliteDetector::detect($buildDir, $app);
        if (! empty($detectedDbs)) {
            $merged = SqliteDetector::mergeDetections($app->sqlite_databases ?? [], $detectedDbs);
            $app->update(['sqlite_databases' => $merged]);

            $persistentPaths = $app->persistent_paths ?? [];
            foreach ($merged as $db) {
                if (! empty($db['persistent']) && ! in_array($db['path'], $persistentPaths, true)) {
                    $persistentPaths[] = $db['path'];
                }
            }
            $app->update(['persistent_paths' => $persistentPaths]);
        }

        try {
            $envContent = $envService->generateEnvContent($app);
            $caddyContent = (new CaddyfileGenerator)->generate($app);
            $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, null, null, $app->cron_enabled, $app->sqlite_databases ?? []);

            // Deploy restarts the VM — sync the new VM state
            $newVmId = $result['vm_id'] ?? $app->vm_id;
            try {
                $vm = $vmManager->waitForRunning($newVmId, 15);
                $app->forceFill([
                    'vm_id' => $newVmId,
                    'vm_state' => $vm['state'] ?? 'running',
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ])->save();
            } catch (\Throwable) {
                $app->forceFill(['vm_id' => $newVmId])->save();
            }
            $app->refresh();

            // Run build command inside the VM if configured
            $buildOutput = null;
            $buildFailed = false;

            if ($app->build_command && $app->vm_ip) {
                try {
                    $buildResult = $vmManager->execBuildCommand($app->vm_ip, $app->build_command, 120);
                    $buildOutput = $buildResult['output'];
                    if ($buildResult['exit_code'] !== 0) {
                        $buildFailed = true;
                    }
                } catch (\Throwable $e) {
                    $buildOutput = $e->getMessage();
                    $buildFailed = true;
                }
            }

            if ($buildFailed) {
                $app->deployments()->create([
                    'triggered_by' => auth()->id(),
                    'status' => 'failed',
                    'commit_message' => 'In-browser deploy',
                    'source' => 'web',
                    'build_output' => $buildOutput,
                    'build_path' => $buildDir,
                    'log' => 'Build command failed.',
                    'started_at' => now(),
                    'completed_at' => now(),
                ]);

                return back()->withErrors(['deploy' => 'Build command failed. Check deployment history for details.']);
            }

            // Update Caddy config with new VM IP
            $caddy->regenerateAndReload();

            // Reapply port forwarding rules with the new VM IP
            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []); } catch (\Throwable) {}
            }

            // Snapshot build into versioned directory
            $versionedPath = $this->snapshotBuild($app, $buildDir);

            $app->deployments()->create([
                'triggered_by' => auth()->id(),
                'status' => 'succeeded',
                'commit_message' => 'In-browser deploy',
                'source' => 'web',
                'build_output' => $buildOutput,
                'build_path' => $versionedPath,
                'started_at' => now(),
                'completed_at' => now(),
            ]);

            return back()->with('success', 'Deployed successfully.');
        } catch (\RuntimeException $e) {
            return back()->withErrors(['deploy' => $e->getMessage()]);
        }
    }

    public function rollback(Request $request, App $app, Deployment $deployment, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): JsonResponse
    {
        Gate::authorize('deploy', $app);

        if ($deployment->app_id !== $app->id) {
            return response()->json(['message' => 'Deployment does not belong to this app.'], 422);
        }

        if ($deployment->status !== 'succeeded') {
            return response()->json(['message' => 'Can only rollback to a successful deployment.'], 422);
        }

        if (! $app->vm_id) {
            return response()->json(['message' => 'App has no VM assigned.'], 422);
        }

        $buildDir = $deployment->build_path;

        if (! $buildDir || ! File::isDirectory($buildDir)) {
            $buildDir = base_path("../builds/{$app->slug}");
        }

        if (! File::isDirectory($buildDir) || count(File::allFiles($buildDir)) === 0) {
            return response()->json(['message' => 'Build directory for this deployment no longer exists.'], 422);
        }

        try {
            $envContent = $envService->generateEnvContent($app);
            $caddyContent = (new CaddyfileGenerator)->generate($app);
            $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, null, null, $app->cron_enabled, $app->sqlite_databases ?? []);

            $newVmId = $result['vm_id'] ?? $app->vm_id;
            try {
                $vm = $vmManager->waitForRunning($newVmId, 15);
                $app->forceFill([
                    'vm_id' => $newVmId,
                    'vm_state' => $vm['state'] ?? 'running',
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ])->save();
            } catch (\Throwable) {
                $app->forceFill(['vm_id' => $newVmId])->save();
            }
            $app->refresh();

            $buildOutput = null;
            $buildFailed = false;

            if ($app->build_command && $app->vm_ip) {
                try {
                    $buildResult = $vmManager->execBuildCommand($app->vm_ip, $app->build_command, 120);
                    $buildOutput = $buildResult['output'];
                    if ($buildResult['exit_code'] !== 0) {
                        $buildFailed = true;
                    }
                } catch (\Throwable $e) {
                    $buildOutput = $e->getMessage();
                    $buildFailed = true;
                }
            }

            if ($buildFailed) {
                $app->deployments()->create([
                    'triggered_by' => auth()->id(),
                    'status' => 'failed',
                    'source' => 'rollback',
                    'rollback_of' => $deployment->id,
                    'commit_message' => "Rollback to deployment #{$deployment->id}",
                    'build_output' => $buildOutput,
                    'build_path' => $buildDir,
                    'log' => 'Build command failed during rollback.',
                    'started_at' => now(),
                    'completed_at' => now(),
                ]);

                return response()->json(['message' => 'Build command failed during rollback.'], 422);
            }

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []); } catch (\Throwable) {}
            }

            $currentBuildDir = base_path("../builds/{$app->slug}");
            if ($buildDir !== $currentBuildDir) {
                if (File::exists($currentBuildDir)) {
                    File::deleteDirectory($currentBuildDir);
                }
                File::copyDirectory($buildDir, $currentBuildDir);
            }

            $app->deployments()->create([
                'triggered_by' => auth()->id(),
                'status' => 'succeeded',
                'source' => 'rollback',
                'rollback_of' => $deployment->id,
                'commit_sha' => $deployment->commit_sha,
                'commit_message' => "Rollback to deployment #{$deployment->id}",
                'commit_author' => $deployment->commit_author,
                'branch' => $deployment->branch,
                'build_output' => $buildOutput,
                'build_path' => $buildDir,
                'started_at' => now(),
                'completed_at' => now(),
            ]);

            return response()->json(['message' => "Rolled back to deployment #{$deployment->id}."]);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Copy the current build into a versioned snapshot directory and prune old snapshots.
     */
    private function snapshotBuild(App $app, string $buildDir): string
    {
        $versionsBase = base_path("../builds/{$app->slug}/versions");
        File::ensureDirectoryExists($versionsBase);

        $timestamp = now()->format('Ymd_His');
        $versionedPath = $versionsBase . '/' . $timestamp;

        File::ensureDirectoryExists($versionedPath);
        $exitCode = 0;
        exec(
            'rsync -a --exclude=versions ' . escapeshellarg($buildDir . '/') . ' ' . escapeshellarg($versionedPath . '/') . ' 2>&1',
            $output,
            $exitCode,
        );

        // Prune old snapshots — keep the 5 most recent
        $dirs = collect(File::directories($versionsBase))->sort()->values();
        if ($dirs->count() > 5) {
            foreach ($dirs->slice(0, $dirs->count() - 5) as $old) {
                File::deleteDirectory($old);
            }
        }

        return $versionedPath;
    }

    public function updateSettings(Request $request, App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService, AppLifecycleService $lifecycle): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'worker_mode' => 'boolean',
            'worker_script' => 'string|max:255',
            'worker_count' => 'integer|min:1|max:16',
            'mercure_enabled' => 'boolean',
            'vcpus' => 'nullable|integer|in:1,2',
            'mem_mib' => 'nullable|integer|in:128,256,512,1024',
            'web_root' => 'nullable|string|max:100',
            'build_command' => 'nullable|string|max:1000',
            'cron_enabled' => 'boolean',
        ]);

        try {
            $lifecycle->enforcePlanLimits($request->user()->currentTeam, $validated, $app);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $needsVMResize = $app->vm_id && (
            (isset($validated['vcpus']) && (int) $validated['vcpus'] !== (int) $app->vcpus) ||
            (isset($validated['mem_mib']) && (int) $validated['mem_mib'] !== (int) $app->mem_mib)
        );

        $app->update($validated);

        if (! $needsVMResize) {
            return response()->json(['message' => 'Settings updated. Redeploy to apply changes.']);
        }

        // Resize via Redeploy: stops VM, preserves rootfs (and persistent files), restarts with new specs
        try {
            $buildDir = base_path("../builds/{$app->slug}");
            $hasBuild = File::isDirectory($buildDir) && count(File::allFiles($buildDir)) > 0;

            if ($hasBuild) {
                $envContent = $envService->generateEnvContent($app);
                $caddyContent = (new CaddyfileGenerator)->generate($app);
                $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
                $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, $app->vcpus, $app->mem_mib, $app->cron_enabled, $app->sqlite_databases ?? []);
            } else {
                // Resize-only (no code to deploy) — pass empty app_dir with new specs
                $result = $vmManager->deployCode($app->vm_id, '', '', '', [], '', $app->vcpus, $app->mem_mib, $app->cron_enabled);
            }

            $newVmId = $result['vm_id'] ?? $app->vm_id;
            $vm = $vmManager->waitForRunning($newVmId, 20);
            $app->forceFill([
                'vm_id' => $newVmId,
                'vm_state' => $vm['state'] ?? 'running',
                'vm_ip' => $vm['ip'] ?? $app->vm_ip,
            ])->save();
            $app->refresh();

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []); } catch (\Throwable) {}
            }

            return response()->json(['message' => 'VM resized and redeployed successfully.', 'resized' => true]);
        } catch (\Throwable $e) {
            $app->forceFill(['vm_state' => 'error'])->save();
            return response()->json(['message' => 'Resize failed: ' . $e->getMessage()], 500);
        }
    }

    public function updateIpAllowlist(Request $request, App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'ip_allowlist' => ['present', 'array'],
            'ip_allowlist.*' => ['required', 'string', 'max:45'],
        ]);

        // Validate each entry is a valid IP or CIDR
        foreach ($validated['ip_allowlist'] as $entry) {
            if (! filter_var($entry, FILTER_VALIDATE_IP) && ! preg_match('#^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$#', $entry)) {
                return response()->json(['message' => "Invalid IP or CIDR: {$entry}"], 422);
            }
        }

        $app->update(['ip_allowlist' => $validated['ip_allowlist'] ?: null]);

        // Immediately update Caddy config (HTTP filtering)
        try {
            $caddy->regenerateAndReload();
        } catch (\Throwable) {}

        // Immediately update iptables rules (port-forwarded traffic filtering)
        if (! empty($app->port_mappings) && $app->vm_ip && $app->vm_state === 'running') {
            try {
                $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []);
            } catch (\Throwable) {}
        }

        return response()->json(['message' => 'IP allowlist updated.']);
    }

    public function updatePortMappings(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('update', $app);

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
                    $vmManager->applyPortMappings($app->vm_ip, $validated['port_mappings'], $app->ip_allowlist ?? []);
                }
            } catch (\Throwable) {
                // Save succeeded, rules will be applied on next deploy
            }
        }

        return response()->json(['message' => 'Port mappings updated.']);
    }

    public function updateWorkers(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

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
        Gate::authorize('update', $app);

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

    public function logSession(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        try {
            $sessionId = $vmManager->createLogSession($app->slug);
        } catch (\Throwable) {
            return response()->json(['message' => 'Could not create log session.'], 500);
        }

        return response()->json(['session_id' => $sessionId]);
    }

    public function githubConnect(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'github_repo' => ['required', 'string', 'max:255'],
            'github_branch' => ['sometimes', 'string', 'max:255'],
        ]);

        $secret = Str::random(40);

        $app->fill([
            'github_repo' => $validated['github_repo'],
            'github_branch' => $validated['github_branch'] ?? 'main',
        ]);
        $app->github_webhook_secret = $secret;
        $app->save();

        return response()->json([
            'message' => 'GitHub connected.',
            'webhook_url' => url("/api/v1/webhooks/github/{$app->slug}"),
            'webhook_secret' => $secret,
        ]);
    }

    public function githubDisconnect(App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $app->fill([
            'github_repo' => null,
            'github_branch' => 'main',
        ]);
        $app->github_webhook_secret = null;
        $app->save();

        return response()->json(['message' => 'GitHub disconnected.']);
    }

    public function githubDeploy(App $app): JsonResponse
    {
        Gate::authorize('deploy', $app);

        if (! $app->github_repo) {
            return response()->json(['message' => 'No GitHub repository configured.'], 422);
        }

        GitDeployJob::dispatch($app);

        return response()->json(['message' => 'Deploy from GitHub queued.']);
    }

    public function scanDatabases(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        if ($app->vm_state !== 'running' || ! $app->vm_ip) {
            return response()->json(['message' => 'VM is not running.', 'databases' => []], 422);
        }

        try {
            // Find all .sqlite, .sqlite3, .db files inside the VM's /app directory
            $result = $vmManager->execBuildCommand($app->vm_ip, 'find /app -type f \( -name "*.sqlite" -o -name "*.sqlite3" -o -name "*.db" \) 2>/dev/null | head -50', 10);
            $paths = array_filter(array_map('trim', explode("\n", $result['output'])));

            // Convert to relative paths and verify they're actual SQLite files
            $detected = [];
            foreach ($paths as $fullPath) {
                if (str_starts_with($fullPath, '/app/')) {
                    $relativePath = substr($fullPath, 5); // Remove /app/ prefix
                    if ($relativePath) {
                        $detected[] = $relativePath;
                    }
                }
            }

            // Merge with existing config
            $merged = SqliteDetector::mergeDetections($app->sqlite_databases ?? [], $detected);
            $app->update(['sqlite_databases' => $merged]);

            // Sync persistent_paths
            $persistentPaths = $app->persistent_paths ?? [];
            foreach ($merged as $db) {
                if ($db['persistent'] && ! in_array($db['path'], $persistentPaths, true)) {
                    $persistentPaths[] = $db['path'];
                }
            }
            $app->update(['persistent_paths' => $persistentPaths]);

            return response()->json([
                'message' => count($detected) > 0
                    ? 'Found ' . count($detected) . ' SQLite database(s) in the running VM.'
                    : 'No SQLite databases found in the running VM.',
                'databases' => $merged,
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to scan VM: ' . $e->getMessage(), 'databases' => []], 500);
        }
    }

    public function updateDatabases(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'databases' => ['present', 'array'],
            'databases.*.path' => ['required', 'string', 'max:500'],
            'databases.*.persistent' => ['required', 'boolean'],
            'databases.*.backup_enabled' => ['required', 'boolean'],
        ]);

        $existing = collect($app->sqlite_databases ?? []);

        $updated = collect($validated['databases'])->map(function ($entry) use ($existing) {
            $match = $existing->firstWhere('path', $entry['path']);

            // If backup is enabled, force persistent
            if ($entry['backup_enabled']) {
                $entry['persistent'] = true;
            }

            return [
                'path' => $entry['path'],
                'persistent' => $entry['persistent'],
                'backup_enabled' => $entry['backup_enabled'],
                'detected_at' => $match['detected_at'] ?? now()->toIso8601String(),
            ];
        })->toArray();

        $app->update(['sqlite_databases' => $updated]);

        // Sync persistent_paths to include persistent databases
        $persistentPaths = $app->persistent_paths ?? [];
        foreach ($updated as $db) {
            if ($db['persistent'] && ! in_array($db['path'], $persistentPaths, true)) {
                $persistentPaths[] = $db['path'];
            } elseif (! $db['persistent']) {
                $persistentPaths = array_values(array_filter($persistentPaths, fn ($p) => $p !== $db['path']));
            }
        }
        $app->update(['persistent_paths' => $persistentPaths]);

        return response()->json(['message' => 'Database settings saved.']);
    }

    public function backupDatabase(Request $request, App $app, VMManagerClient $vmManager): mixed
    {
        Gate::authorize('view', $app);

        $path = ltrim(str_replace('..', '', $request->query('path', '')), '/');
        if (! $path) {
            return response()->json(['message' => 'Path is required.'], 422);
        }

        $db = collect($app->sqlite_databases ?? [])->firstWhere('path', $path);
        if (! $db || empty($db['backup_enabled'])) {
            return response()->json(['message' => 'Backups not enabled for this database.'], 422);
        }

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'VM is not running.'], 422);
        }

        try {
            $output = $vmManager->execInVM($app->vm_ip, 'cat /app/' . escapeshellarg($path));

            return response($output, 200, [
                'Content-Type' => 'application/octet-stream',
                'Content-Disposition' => 'attachment; filename="' . basename($path) . '"',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed to download database: ' . $e->getMessage()], 500);
        }
    }

    public function restoreDatabase(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'path' => ['required', 'string', 'max:500'],
        ]);

        $path = ltrim(str_replace('..', '', $validated['path']), '/');

        $db = collect($app->sqlite_databases ?? [])->firstWhere('path', $path);
        if (! $db || empty($db['backup_enabled'])) {
            return response()->json(['message' => 'Backups not enabled for this database.'], 422);
        }

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'VM is not running.'], 422);
        }

        try {
            $vmManager->execInVM($app->vm_ip, 'litestream restore -o /app/' . escapeshellarg($path) . ' /app/' . escapeshellarg($path));

            return response()->json(['message' => 'Database restored from backup.']);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Restore failed: ' . $e->getMessage()], 500);
        }
    }

}
