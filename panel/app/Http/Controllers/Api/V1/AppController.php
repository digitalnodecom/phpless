<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\App;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
use App\Services\EnvironmentVariableService;
use App\Services\VMManagerClient;
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
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'alpha_dash', Rule::unique('apps', 'slug')],
            'vcpus' => ['sometimes', 'integer', 'in:1,2'],
            'mem_mib' => ['sometimes', 'integer', 'in:256,512,1024'],
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
                $app->update([
                    'vm_state' => $vm['state'] ?? $app->vm_state,
                    'vm_ip' => $vm['ip'] ?? $app->vm_ip,
                ]);
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
     * Deploy code to the app's VM. Upload a .tar.gz tarball (max 50MB) containing your PHP application.
     * The tarball is extracted, environment variables are merged, and the code is synced to the VM.
     */
    public function deploy(Request $request, App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy, EnvironmentVariableService $envService): JsonResponse
    {
        Gate::authorize('view', $app);

        if (! $app->vm_id) {
            return response()->json(['message' => 'App has no VM assigned.'], 422);
        }

        $buildDir = base_path("../builds/{$app->slug}");

        // Handle tarball upload
        if ($request->hasFile('tarball')) {
            $request->validate([
                'tarball' => ['required', 'file', 'max:51200'], // 50MB max
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

        try {
            $envContent = $envService->generateEnvContent($app);
            $caddyContent = (new CaddyfileGenerator)->generate($app);
            $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
            $result = $vmManager->deployCode($app->vm_id, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig);

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

            $caddy->regenerateAndReload();

            if (! empty($app->port_mappings) && $app->vm_ip) {
                try { $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings); } catch (\Throwable) {}
            }

            $app->deployments()->create([
                'triggered_by' => $request->user()->id,
                'status' => 'succeeded',
                'commit_message' => 'API deploy',
                'source' => $request->input('source', 'api'),
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
     * List deployed files
     *
     * Browse the app's deployed file tree. Use the `path` query parameter to navigate subdirectories.
     */
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

        return response()->json(['items' => $items]);
    }

    /**
     * Upload a file
     *
     * Upload a single file to the app's build directory. Specify the destination path via the `path` field.
     */
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
        $destination  = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);
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
        Gate::authorize('view', $app);

        $request->validate([
            'path'    => ['required', 'string', 'max:500'],
            'content' => ['present', 'nullable', 'string'],
        ]);

        $baseDir      = config('phpless.builds_dir') . '/' . $app->slug;
        $relativePath = ltrim(str_replace('..', '', $request->input('path')), '/');
        $destination  = $baseDir . '/' . $relativePath;

        File::ensureDirectoryExists(dirname($destination), 0755);
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
        Gate::authorize('view', $app);

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

    /**
     * Execute command
     *
     * Execute a shell command inside the app's Firecracker microVM via SSH.
     * Returns stdout, stderr, and exit code. Commands are subject to a timeout (default 30s, max 300s).
     */
    public function exec(Request $request, App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('view', $app);

        if (! $app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'App is not running.'], 422);
        }

        $validated = $request->validate([
            'command' => ['required', 'string', 'max:10000'],
            'timeout' => ['sometimes', 'integer', 'min:1', 'max:300'],
        ]);

        try {
            $result = $vmManager->execCommand(
                $app->vm_ip,
                $validated['command'],
                $validated['timeout'] ?? 30,
            );

            return response()->json($result);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }
    }

    /**
     * @return array{slug: string, name: string, url: string, vm_state: string|null, vcpus: int, mem_mib: int, created_at: string, updated_at: string, vm_id: string|null, vm_ip: string|null, php_version: string|null, github_repo: string|null, github_branch: string|null, deployments: array|null, domains: array|null}
     */
    private function formatApp(App $app, bool $detailed = false): array
    {
        $data = [
            'slug' => $app->slug,
            'name' => $app->name,
            'url' => $app->url(),
            'vm_state' => $app->vm_state,
            'vcpus' => $app->vcpus,
            'mem_mib' => $app->mem_mib,
            'created_at' => $app->created_at,
            'updated_at' => $app->updated_at,
        ];

        if ($detailed) {
            $data['vm_id'] = $app->vm_id;
            $data['vm_ip'] = $app->vm_ip;
            $data['php_version'] = $app->php_version;
            $data['github_repo'] = $app->github_repo;
            $data['github_branch'] = $app->github_branch;
            $data['deployments'] = $app->deployments?->map(fn ($d) => [
                'id' => $d->id,
                'status' => $d->status,
                'commit_message' => $d->commit_message,
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
}
