<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\App;
use App\Models\AppLog;
use App\Models\Deployment;
use App\Models\UptimeCheck;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
use App\Services\EnvironmentVariableService;
use App\Services\FrameworkDetector;
use App\Services\SqliteDetector;
use App\Services\VMManagerClient;
use App\Services\WordPressSqliteConfigurator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AppController extends Controller
{
    /**
     * List apps
     *
     * Returns all apps belonging to the authenticated user's current team.
     */
    public function index(Request $request): JsonResponse
    {
        $apps = $request->user()->currentTeam
            ->apps()
            ->latest()
            ->get()
            ->map(fn (App $app) => $this->formatApp($app));

        return response()->json(['apps' => $apps]);
    }

    /**
     * Create app
     *
     * Create a new app in the current team. A Firecracker microVM is provisioned automatically.
     */
    public function store(Request $request, AppLifecycleService $lifecycle): JsonResponse
    {
        Gate::authorize('create', App::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('apps', 'slug')],
            'vcpus' => ['sometimes', 'integer', 'in:1,2'],
            'mem_mib' => ['sometimes', 'integer', 'in:128,256,512,1024'],
            'github_repo' => ['sometimes', 'nullable', 'string', 'max:255'],
            'github_branch' => ['sometimes', 'string', 'max:255'],
            'build_command' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'cron_enabled' => ['sometimes', 'boolean'],
            'preview_enabled' => ['sometimes', 'boolean'],
        ]);

        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $team = $request->user()->currentTeam;

        try {
            $app = $lifecycle->createApp($team, $validated);

            return response()->json(['app' => $this->formatApp($app)], 201);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * Get app details
     *
     * Returns detailed app info including VM state, recent deployments, and configured domains.
     */
    public function show(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

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

        $app->load(['deployments' => function ($q) {
            $q->latest()->limit(10);
        }, 'domains']);

        return response()->json(['app' => $this->formatApp($app, true)]);
    }

    /**
     * Delete app
     *
     * Permanently delete an app and destroy its Firecracker microVM.
     */
    public function destroy(App $app, AppLifecycleService $lifecycle): JsonResponse
    {
        Gate::authorize('delete', $app);

        $lifecycle->deleteApp($app);

        return response()->json(['message' => 'App deleted.']);
    }

    /**
     * Deploy app
     *
     * Deploy code to the app's VM. Upload a .tar.gz tarball (max 1GB) containing your PHP application.
     * The tarball is extracted, environment variables are merged, and the code is synced to the VM.
     */
    public function deploy(Request $request, App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): JsonResponse
    {
        Gate::authorize('deploy', $app);

        if (! $app->vm_id) {
            return response()->json(['message' => 'App has no VM assigned.'], 422);
        }

        $buildDir = base_path("../builds/{$app->slug}");

        // Handle tarball upload
        if ($request->hasFile('tarball')) {
            $request->validate([
                'tarball' => ['required', 'file', 'max:1048576'], // 1GB max
            ]);

            // Clear existing build dir so deleted files don't persist
            if (File::exists($buildDir)) {
                File::deleteDirectory($buildDir);
            }
            File::ensureDirectoryExists($buildDir);

            $tarball = $request->file('tarball');
            $fullTarPath = $tarball->getRealPath();

            // Extract tarball
            $exitCode = 0;
            $output = [];
            exec("tar -xzf " . escapeshellarg($fullTarPath) . " -C " . escapeshellarg($buildDir) . " 2>&1", $output, $exitCode);

            if ($exitCode !== 0) {
                return response()->json(['message' => 'Failed to extract tarball: ' . implode("\n", $output)], 422);
            }
        }

        if (! File::exists($buildDir) || count(File::files($buildDir, true)) === 0) {
            return response()->json(['message' => 'No code to deploy. Upload a tarball or save code first.'], 422);
        }

        // Run framework detection
        $detected = FrameworkDetector::detect($buildDir);
        $app->update(['detected_framework' => $detected['framework']]);

        // Apply detected defaults if not explicitly set
        if ((! $app->web_root || $app->web_root === '/') && $detected['web_root'] !== '/') {
            $app->update(['web_root' => $detected['web_root']]);
        }
        if (! $app->build_command && $detected['build_command']) {
            $app->update(['build_command' => $detected['build_command']]);
        }

        // WordPress SQLite auto-configuration
        $wpConfigActions = [];
        if ($detected['framework'] === 'wordpress') {
            $wpConfigActions = WordPressSqliteConfigurator::configure($buildDir);

            // Auto-add WordPress persistent paths
            $persistentPaths = $app->persistent_paths ?? [];
            foreach (['wp-content/database/', 'wp-content/uploads/'] as $wpPath) {
                if (! in_array($wpPath, $persistentPaths, true)) {
                    $persistentPaths[] = $wpPath;
                }
            }
            $app->update(['persistent_paths' => $persistentPaths]);
        }

        // Detect SQLite databases and auto-persist them
        $detectedDbs = SqliteDetector::detect($buildDir, $app);
        // Also register WordPress SQLite default path
        if ($detected['framework'] === 'wordpress') {
            $wpDbPath = 'wp-content/database/.ht.sqlite';
            if (! in_array($wpDbPath, $detectedDbs, true)) {
                $detectedDbs[] = $wpDbPath;
            }
        }
        if (! empty($detectedDbs)) {
            $merged = SqliteDetector::mergeDetections($app->sqlite_databases ?? [], $detectedDbs);
            $app->update(['sqlite_databases' => $merged]);

            // Auto-add persistent SQLite paths to persistent_paths
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
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, null, null, $app->cron_enabled, $app->sqlite_databases ?? [], $app->slug, $app->effectiveStorageEndpoint());

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
                    'triggered_by' => $request->user()->id,
                    'status' => 'failed',
                    'commit_message' => 'API deploy',
                    'source' => $request->input('source', 'api'),
                    'build_output' => $buildOutput,
                    'build_path' => $buildDir,
                    'log' => 'Build command failed.',
                    'started_at' => now(),
                    'completed_at' => now(),
                ]);

                return response()->json(['message' => 'Build command failed.', 'build_output' => $buildOutput], 422);
            }

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []); } catch (\Throwable) {}
            }

            // Push health check config to manager
            if ($app->health_check_enabled && $app->vm_id) {
                try {
                    $vmManager->setHealthConfig($app->vm_id, [
                        'enabled' => true,
                        'path' => $app->health_check_path ?? '/',
                        'interval' => $app->health_check_interval ?? 60,
                    ]);
                } catch (\Throwable) {}
            }

            // Snapshot build into versioned directory
            $versionedPath = $this->snapshotBuild($app, $buildDir);

            $deployLog = null;
            if (! empty($wpConfigActions)) {
                $deployLog = 'WordPress SQLite configured: ' . implode(', ', $wpConfigActions);
            }

            $app->deployments()->create([
                'triggered_by' => $request->user()->id,
                'status' => 'succeeded',
                'commit_message' => 'API deploy',
                'source' => $request->input('source', 'api'),
                'build_output' => $buildOutput,
                'build_path' => $versionedPath,
                'log' => $deployLog,
                'started_at' => now(),
                'completed_at' => now(),
            ]);

            return response()->json([
                'message' => 'Deployed successfully.',
                'app' => $this->formatApp($app->fresh()),
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Rollback to a previous deployment
     *
     * Re-deploy a previous build to the app's VM. Creates a new deployment record with source 'rollback'.
     * The target deployment must belong to this app and its build directory must still exist.
     */
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

        // Determine the build directory for the target deployment
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
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, null, null, $app->cron_enabled, $app->sqlite_databases ?? [], $app->slug, $app->effectiveStorageEndpoint());

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
                    'triggered_by' => $request->user()->id,
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

                return response()->json(['message' => 'Build command failed during rollback.', 'build_output' => $buildOutput], 422);
            }

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []); } catch (\Throwable) {}
            }

            // Update the current build dir to point to the rollback build
            $currentBuildDir = base_path("../builds/{$app->slug}");
            if ($buildDir !== $currentBuildDir) {
                if (File::exists($currentBuildDir)) {
                    File::deleteDirectory($currentBuildDir);
                }
                File::copyDirectory($buildDir, $currentBuildDir);
            }

            $rollbackDeployment = $app->deployments()->create([
                'triggered_by' => $request->user()->id,
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

            return response()->json([
                'message' => "Rolled back to deployment #{$deployment->id}.",
                'deployment' => $rollbackDeployment,
                'app' => $this->formatApp($app->fresh()),
            ]);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Download app code
     *
     * Download the app's deployed code as a .tar.gz archive.
     *
     * @response 200 scenario="Success" Binary .tar.gz file download.
     */
    public function download(App $app): StreamedResponse|JsonResponse
    {
        Gate::authorize('view', $app);

        $buildDir = base_path("../builds/{$app->slug}");

        if (! File::exists($buildDir) || count(File::allFiles($buildDir)) === 0) {
            return response()->json(['message' => 'No code deployed for this app.'], 404);
        }

        return new StreamedResponse(function () use ($buildDir) {
            $process = proc_open(
                ['tar', '-czf', '-', '-C', $buildDir, '.'],
                [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes
            );

            if (is_resource($process)) {
                fpassthru($pipes[1]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                proc_close($process);
            }
        }, 200, [
            'Content-Type' => 'application/gzip',
            'Content-Disposition' => "attachment; filename=\"{$app->slug}.tar.gz\"",
        ]);
    }

    /**
     * Get app logs
     *
     * Returns the last 200 access log entries for the app, including method, path, status, duration, and client IP.
     */
    public function logs(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

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

        return response()->json(['logs' => $lines]);
    }

    /**
     * Search app logs
     *
     * Search and filter persisted access logs. Supports text search on path,
     * status code filtering (exact or range like "5xx"), method filter, and date range.
     */
    public function logSearch(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:500'],
            'status' => ['sometimes', 'nullable', 'string', 'max:10'],
            'method' => ['sometimes', 'nullable', 'string', 'max:10'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $perPage = $validated['per_page'] ?? 50;

        $query = AppLog::where('app_id', $app->id)->orderByDesc('logged_at');

        if (! empty($validated['q'])) {
            $query->where('path', 'like', '%' . $validated['q'] . '%');
        }

        if (! empty($validated['status'])) {
            $status = $validated['status'];
            if (preg_match('/^(\d)xx$/i', $status, $m)) {
                $base = (int) $m[1] * 100;
                $query->whereBetween('status_code', [$base, $base + 99]);
            } else {
                $query->where('status_code', (int) $status);
            }
        }

        if (! empty($validated['method'])) {
            $query->where('method', strtoupper($validated['method']));
        }

        if (! empty($validated['from'])) {
            $query->where('logged_at', '>=', $validated['from']);
        }

        if (! empty($validated['to'])) {
            $query->where('logged_at', '<=', $validated['to']);
        }

        $paginator = $query->paginate($perPage);

        $plan = $app->team->plan ?? 'sandbox';
        $retentionDays = config("phpless.plans.{$plan}.log_retention_days", 7);

        return response()->json([
            'logs' => collect($paginator->items())->map(fn (AppLog $log) => [
                'id' => $log->id,
                'logged_at' => $log->logged_at->toIso8601String(),
                'method' => $log->method,
                'path' => $log->path,
                'status_code' => $log->status_code,
                'duration_ms' => $log->duration_ms,
                'ip' => $log->ip,
                'user_agent' => $log->user_agent,
                'response_size' => $log->response_size,
            ]),
            'total' => $paginator->total(),
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'last_page' => $paginator->lastPage(),
            'retention_days' => $retentionDays,
        ]);
    }

    /**
     * Export app logs as CSV
     *
     * Downloads filtered logs as a CSV file.
     */
    public function logExport(Request $request, App $app): StreamedResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:500'],
            'status' => ['sometimes', 'nullable', 'string', 'max:10'],
            'method' => ['sometimes', 'nullable', 'string', 'max:10'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
        ]);

        $query = AppLog::where('app_id', $app->id)->orderByDesc('logged_at');

        if (! empty($validated['q'])) {
            $query->where('path', 'like', '%' . $validated['q'] . '%');
        }

        if (! empty($validated['status'])) {
            $status = $validated['status'];
            if (preg_match('/^(\d)xx$/i', $status, $m)) {
                $base = (int) $m[1] * 100;
                $query->whereBetween('status_code', [$base, $base + 99]);
            } else {
                $query->where('status_code', (int) $status);
            }
        }

        if (! empty($validated['method'])) {
            $query->where('method', strtoupper($validated['method']));
        }

        if (! empty($validated['from'])) {
            $query->where('logged_at', '>=', $validated['from']);
        }

        if (! empty($validated['to'])) {
            $query->where('logged_at', '<=', $validated['to']);
        }

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Timestamp', 'Method', 'Path', 'Status', 'Duration (ms)', 'IP', 'User Agent', 'Size']);

            $query->chunk(500, function ($logs) use ($handle) {
                foreach ($logs as $log) {
                    fputcsv($handle, [
                        $log->logged_at->toIso8601String(),
                        $log->method,
                        $log->path,
                        $log->status_code,
                        $log->duration_ms,
                        $log->ip,
                        $log->user_agent,
                        $log->response_size,
                    ]);
                }
            });

            fclose($handle);
        }, "{$app->slug}-logs.csv", ['Content-Type' => 'text/csv']);
    }

    /**
     * Create log stream session
     *
     * Creates a one-time WebSocket session for streaming real-time access logs.
     * Connect to `wss://{host}/ws/logs/{session_id}` within 60 seconds.
     */
    public function logSession(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $sessionId = $vmManager->createLogSession($app->slug);

        return response()->json(['session_id' => $sessionId]);
    }

    /**
     * List deployed files
     *
     * Browse the app's deployed file tree. Use the `path` query parameter to navigate subdirectories.
     */
    public function files(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $subPath = ltrim(str_replace('..', '', $request->query('path', '')), '/');
        $persistentPaths = $app->persistent_paths ?? [];
        $items = [];
        $source = 'build';

        // If VM is running, read from live filesystem
        if ($app->vm_ip && $app->vm_state === 'running') {
            try {
                $vmPath = $subPath ? "/app/{$subPath}" : '/app';
                $output = $vmManager->execInVM($app->vm_ip, 'php /usr/local/lib/phpless-ls.php ' . escapeshellarg($vmPath));
                $vmItems = json_decode($output, true) ?? [];
                $source = 'vm';

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
            } catch (\Throwable) {
                $items = [];
                // Fall through to build dir
            }
        }

        // Fallback: read from build directory
        if (empty($items) && $source !== 'vm') {
            $baseDir = config('phpless.builds_dir') . '/' . $app->slug;
            $fullPath = $subPath ? $baseDir . '/' . $subPath : $baseDir;

            if (File::exists($fullPath) && is_dir($fullPath)) {
                foreach (File::directories($fullPath) as $dir) {
                    $name = basename($dir);
                    $relPath = $subPath ? $subPath . '/' . $name : $name;
                    $items[] = ['name' => $name, 'path' => $relPath, 'type' => 'dir', 'size' => 0, 'modified_at' => date('Y-m-d H:i:s', filemtime($dir)), 'is_persistent' => in_array($relPath, $persistentPaths, true)];
                }
                foreach (File::files($fullPath) as $file) {
                    $name = $file->getFilename();
                    $relPath = $subPath ? $subPath . '/' . $name : $name;
                    $items[] = ['name' => $name, 'path' => $relPath, 'type' => 'file', 'size' => $file->getSize(), 'modified_at' => date('Y-m-d H:i:s', $file->getMTime()), 'is_persistent' => in_array($relPath, $persistentPaths, true)];
                }
            }
        }

        usort($items, fn ($a, $b) => $a['type'] === $b['type']
            ? strcmp($a['name'], $b['name'])
            : ($a['type'] === 'dir' ? -1 : 1));

        return response()->json(['items' => $items]);
    }

    /**
     * Upload a file
     *
     * Upload a single file to the app's build directory. Specify the destination path via the `path` field.
     */
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
        $destination  = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);

        $realParent = realpath(dirname($destination));
        $realBase   = realpath($baseDir);
        if (! $realParent || ! $realBase || ! str_starts_with($realParent, $realBase)) {
            return response()->json(['message' => 'Invalid path.'], 422);
        }

        $uploadedFile->move(dirname($destination), basename($destination));

        return response()->json(['message' => 'Uploaded.', 'path' => $relativePath]);
    }

    /**
     * Write file content
     *
     * Write content to a file in the app's build directory. Creates the file if it doesn't exist.
     */
    public function filesWrite(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $request->validate([
            'path'    => ['required', 'string', 'max:500'],
            'content' => ['present', 'nullable', 'string'],
        ]);

        $baseDir      = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->input('path')), '/');
        $destination  = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);

        $realParent = realpath(dirname($destination));
        $realBase   = realpath($baseDir) ?: $baseDir;
        if (! $realParent || ! str_starts_with($realParent, $realBase)) {
            return response()->json(['message' => 'Invalid path.'], 422);
        }

        File::put($destination, $request->input('content', ''));

        return response()->json(['message' => 'Saved.', 'path' => $relativePath]);
    }

    /**
     * Delete a file
     *
     * Delete a file or directory from the app's build directory.
     */
    public function filesDelete(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $request->validate(['path' => ['required', 'string', 'max:500']]);

        $baseDir      = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->input('path')), '/');
        $target       = $baseDir . '/' . $relativePath;

        if (File::exists($target) && str_starts_with(realpath($target), realpath($baseDir))) {
            if (is_dir($target)) {
                File::deleteDirectory($target);
            } else {
                File::delete($target);
            }
        }

        return response()->json(['message' => 'Deleted.']);
    }

    /**
     * Download a file
     *
     * Download a single file from the app's build directory.
     *
     * @response 200 scenario="Success" Binary file download.
     */
    public function filesDownload(Request $request, App $app)
    {
        Gate::authorize('view', $app);

        $request->validate(['path' => ['required', 'string', 'max:500']]);

        $baseDir      = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->query('path')), '/');
        $target       = $baseDir . '/' . $relativePath;

        if (! File::exists($target) || ! str_starts_with(realpath($target), realpath($baseDir))) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return response()->download($target, basename($target));
    }

    /**
     * Set file persistence
     *
     * Mark or unmark a file path as persistent. Persistent files survive redeployments.
     */
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

    /**
     * Verify SSH access
     *
     * Verify that the authenticated user has access to an app and return the VM IP.
     * Used internally by the SSH proxy server.
     */
    public function sshVerify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slug' => ['required', 'string'],
        ]);

        $app = App::where('slug', $validated['slug'])->first();

        if (! $app) {
            return response()->json(['message' => 'App not found.'], 404);
        }

        Gate::authorize('ssh', $app);

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'App is not running.'], 422);
        }

        return response()->json([
            'vm_ip' => $app->vm_ip,
            'slug' => $app->slug,
        ]);
    }

    /**
     * List SQLite databases
     *
     * Returns the app's detected and configured SQLite databases with size info when the VM is running.
     */
    public function databases(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        $databases = $app->sqlite_databases ?? [];

        // Try to get size info from the running VM
        if ($app->vm_ip && $app->vm_state === 'running' && ! empty($databases)) {
            foreach ($databases as &$db) {
                try {
                    $output = $vmManager->execInVM($app->vm_ip, 'stat -c%s ' . escapeshellarg('/app/' . $db['path']) . ' 2>/dev/null || echo 0');
                    $db['size'] = (int) trim($output);
                } catch (\Throwable) {
                    $db['size'] = null;
                }
            }
            unset($db);
        }

        return response()->json(['databases' => $databases]);
    }

    /**
     * Update SQLite databases config
     *
     * Update the SQLite database configuration for the app. If backup_enabled is true, persistent is forced to true.
     */
    public function databasesUpdate(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'databases' => ['required', 'array'],
            'databases.*.path' => ['required', 'string', 'max:500'],
            'databases.*.persistent' => ['required', 'boolean'],
            'databases.*.backup_enabled' => ['required', 'boolean'],
        ]);

        $databases = $validated['databases'];

        // If backup_enabled, force persistent
        foreach ($databases as &$db) {
            if ($db['backup_enabled']) {
                $db['persistent'] = true;
            }
        }
        unset($db);

        $app->update(['sqlite_databases' => $databases]);

        // Sync persistent_paths
        $persistentPaths = $app->persistent_paths ?? [];
        foreach ($databases as $db) {
            if ($db['persistent'] && ! in_array($db['path'], $persistentPaths, true)) {
                $persistentPaths[] = $db['path'];
            }
        }
        $app->update(['persistent_paths' => $persistentPaths]);

        return response()->json(['databases' => $app->fresh()->sqlite_databases]);
    }

    /**
     * Download database backup
     *
     * Download a backup of a SQLite database from the app's VM. Streams the database file as a download.
     *
     * @response 200 scenario="Success" Binary SQLite database file download.
     */
    public function databaseBackup(Request $request, App $app, VMManagerClient $vmManager): StreamedResponse|JsonResponse
    {
        Gate::authorize('view', $app);

        $request->validate(['path' => ['required', 'string', 'max:500']]);

        $path = $request->query('path');
        $databases = $app->sqlite_databases ?? [];

        // Verify path is in the configured databases
        $found = false;
        foreach ($databases as $db) {
            if ($db['path'] === $path) {
                $found = true;
                break;
            }
        }

        if (! $found) {
            return response()->json(['message' => 'Database path not found in app config.'], 404);
        }

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'App is not running.'], 422);
        }

        // Copy the database to a temp file inside VM (to get a consistent snapshot),
        // then cat it out through the exec endpoint
        try {
            $vmManager->execInVM($app->vm_ip, 'cp ' . escapeshellarg('/app/' . $path) . ' /tmp/db_backup.sqlite 2>&1');
            $output = $vmManager->execInVM($app->vm_ip, 'base64 /tmp/db_backup.sqlite');
            $vmManager->execInVM($app->vm_ip, 'rm -f /tmp/db_backup.sqlite');

            $data = base64_decode($output);
            $filename = basename($path);

            return response()->streamDownload(function () use ($data) {
                echo $data;
            }, $filename, [
                'Content-Type' => 'application/x-sqlite3',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed to backup database: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Restore database from backup
     *
     * Restore a SQLite database by uploading a backup file or triggering a Litestream restore.
     */
    public function databaseRestore(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'path' => ['required', 'string', 'max:500'],
            'timestamp' => ['nullable', 'string'],
        ]);

        $path = $validated['path'];
        $databases = $app->sqlite_databases ?? [];

        // Verify path is in the configured databases
        $found = false;
        foreach ($databases as $db) {
            if ($db['path'] === $path) {
                $found = true;
                break;
            }
        }

        if (! $found) {
            return response()->json(['message' => 'Database path not found in app config.'], 404);
        }

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'App is not running.'], 422);
        }

        try {
            $cmd = 'litestream restore -o ' . escapeshellarg('/app/' . $path);
            if (! empty($validated['timestamp'])) {
                $cmd .= ' -timestamp ' . escapeshellarg($validated['timestamp']);
            }
            $cmd .= ' ' . escapeshellarg('/app/' . $path);

            $output = $vmManager->execInVM($app->vm_ip, $cmd . ' 2>&1', 60);

            return response()->json([
                'message' => 'Database restored successfully.',
                'output' => $output,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Failed to restore database: ' . $e->getMessage()], 500);
        }
    }

    /**
     * List preview environments
     *
     * Returns all active preview environments for an app.
     */
    public function previews(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $previews = $app->previewEnvironments()
            ->latest()
            ->get()
            ->map(fn ($p) => $this->formatPreview($p));

        return response()->json(['previews' => $previews]);
    }

    /**
     * Destroy preview environment
     *
     * Destroys a preview environment, its VM, and removes its Caddy route.
     */
    public function destroyPreview(App $app, int $previewId, VMManagerClient $vmManager, CaddyConfigManager $caddy): JsonResponse
    {
        Gate::authorize('update', $app);

        $preview = $app->previewEnvironments()->findOrFail($previewId);

        if ($preview->vm_id) {
            try {
                $vmManager->destroyVM($preview->vm_id);
            } catch (\Throwable) {
                // VM may already be gone
            }
        }

        // Clean up build directory
        $buildDir = base_path("../builds/previews/{$preview->slug}");
        if (File::isDirectory($buildDir)) {
            File::deleteDirectory($buildDir);
        }

        $preview->delete();

        try {
            $caddy->regenerateAndReload();
        } catch (\Throwable) {}

        return response()->json(['message' => 'Preview environment destroyed.']);
    }

    /**
     * @return array{id: int, branch: string, slug: string, url: string, vm_state: string, commit_sha: string|null, commit_message: string|null, commit_author: string|null, created_at: string, expires_at: string|null}
     */
    private function formatPreview(\App\Models\PreviewEnvironment $preview): array
    {
        return [
            'id' => $preview->id,
            'branch' => $preview->branch,
            'slug' => $preview->slug,
            'url' => $preview->url(),
            'vm_state' => $preview->vm_state,
            'commit_sha' => $preview->commit_sha,
            'commit_message' => $preview->commit_message,
            'commit_author' => $preview->commit_author,
            'created_at' => $preview->created_at,
            'expires_at' => $preview->expires_at,
        ];
    }

    /**
     * Get uptime stats
     *
     * Returns uptime statistics and recent health checks for the app.
     */
    public function uptime(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $now = now();

        $checks24h = UptimeCheck::where('app_id', $app->id)
            ->where('checked_at', '>=', $now->copy()->subDay())
            ->get();

        $checks7d = UptimeCheck::where('app_id', $app->id)
            ->where('checked_at', '>=', $now->copy()->subDays(7))
            ->get();

        $checks30d = UptimeCheck::where('app_id', $app->id)
            ->where('checked_at', '>=', $now->copy()->subDays(30))
            ->get();

        $recentChecks = UptimeCheck::where('app_id', $app->id)
            ->orderByDesc('checked_at')
            ->limit(50)
            ->get();

        $uptimePct = fn ($checks) => $checks->count() > 0
            ? round($checks->where('is_up', true)->count() / $checks->count() * 100, 2)
            : null;

        $avgResponseTime = fn ($checks) => $checks->count() > 0
            ? round($checks->avg('response_time_ms'))
            : null;

        $lastCheck = $recentChecks->first();

        return response()->json([
            'health_check_enabled' => $app->health_check_enabled,
            'is_up' => $lastCheck?->is_up,
            'last_check' => $lastCheck ? [
                'status_code' => $lastCheck->status_code,
                'response_time_ms' => $lastCheck->response_time_ms,
                'is_up' => $lastCheck->is_up,
                'checked_at' => $lastCheck->checked_at,
            ] : null,
            'uptime_24h' => $uptimePct($checks24h),
            'uptime_7d' => $uptimePct($checks7d),
            'uptime_30d' => $uptimePct($checks30d),
            'avg_response_time_24h' => $avgResponseTime($checks24h),
            'avg_response_time_7d' => $avgResponseTime($checks7d),
            'recent_checks' => $recentChecks->map(fn ($c) => [
                'status_code' => $c->status_code,
                'response_time_ms' => $c->response_time_ms,
                'is_up' => $c->is_up,
                'checked_at' => $c->checked_at,
            ]),
        ]);
    }

    /**
     * Update health check settings
     *
     * Configure health check monitoring for the app. When enabled, the VM manager
     * will periodically check the app's health endpoint and alert on state changes.
     */
    public function updateHealthSettings(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'health_check_enabled' => ['required', 'boolean'],
            'health_check_path' => ['sometimes', 'string', 'max:255'],
            'health_check_interval' => ['sometimes', 'integer', 'in:30,60,300'],
            'alert_email' => ['nullable', 'email', 'max:255'],
            'alert_webhook_url' => ['nullable', 'url', 'max:500'],
        ]);

        $app->update($validated);

        // Push config to manager if VM is running
        if ($app->vm_id && $app->vm_ip) {
            try {
                $vmManager->setHealthConfig($app->vm_id, [
                    'enabled' => $app->health_check_enabled,
                    'path' => $app->health_check_path ?? '/',
                    'interval' => $app->health_check_interval ?? 60,
                ]);
            } catch (\Throwable) {
                // Manager unreachable — config will be applied on next deploy
            }
        }

        return response()->json([
            'message' => 'Health check settings updated.',
            'health_check_enabled' => $app->health_check_enabled,
            'health_check_path' => $app->health_check_path,
            'health_check_interval' => $app->health_check_interval,
            'alert_email' => $app->alert_email,
            'alert_webhook_url' => $app->alert_webhook_url,
        ]);
    }

    /**
     * @return array{slug: string, name: string, url: string, vm_state: string|null, vcpus: int, mem_mib: int, created_at: string, updated_at: string, vm_id: string|null, vm_ip: string|null, php_version: string|null, github_repo: string|null, github_branch: string|null, deployments: array|null, domains: array|null}
     */
    private function formatApp(App $app, bool $detailed = false): array
    {
        // Get latest uptime status
        $lastCheck = $app->uptimeChecks()->orderByDesc('checked_at')->first();

        $data = [
            'slug' => $app->slug,
            'name' => $app->name,
            'url' => $app->url(),
            'vm_state' => $app->vm_state,
            'vcpus' => $app->vcpus,
            'mem_mib' => $app->mem_mib,
            'detected_framework' => $app->detected_framework,
            'build_command' => $app->build_command,
            'health_check_enabled' => $app->health_check_enabled,
            'is_up' => $lastCheck?->is_up,
            'created_at' => $app->created_at,
            'updated_at' => $app->updated_at,
        ];

        if ($detailed) {
            $data['sqlite_databases'] = $app->sqlite_databases ?? [];
            $data['vm_id'] = $app->vm_id;
            $data['vm_ip'] = $app->vm_ip;
            $data['php_version'] = $app->php_version;
            $data['github_repo'] = $app->github_repo;
            $data['github_branch'] = $app->github_branch;
            $data['cron_enabled'] = $app->cron_enabled;
            $data['health_check_path'] = $app->health_check_path;
            $data['health_check_interval'] = $app->health_check_interval;
            $data['alert_email'] = $app->alert_email;
            $data['alert_webhook_url'] = $app->alert_webhook_url;
            $data['preview_enabled'] = $app->preview_enabled;
            $data['preview_max'] = $app->preview_max;
            $data['preview_ttl_hours'] = $app->preview_ttl_hours;
            $data['preview_count'] = $app->previewEnvironments()->count();
            $data['deployments'] = $app->deployments?->map(fn ($d) => [
                'id' => $d->id,
                'status' => $d->status,
                'source' => $d->source,
                'commit_sha' => $d->commit_sha,
                'commit_message' => $d->commit_message,
                'commit_author' => $d->commit_author,
                'branch' => $d->branch,
                'build_output' => $d->build_output,
                'rollback_of' => $d->rollback_of,
                'has_build' => $d->build_path && File::isDirectory($d->build_path),
                'created_at' => $d->created_at,
            ]);
            $data['domains'] = $app->domains?->map(fn ($d) => [
                'domain' => $d->domain,
                'type' => $d->type,
                'ssl_active' => $d->ssl_active,
            ]);
        }

        return $data;
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

        // Copy current build (excluding the versions dir itself) into the snapshot
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
}
