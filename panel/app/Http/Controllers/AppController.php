<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
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

    public function deploy(App $app, VMManagerClient $vmManager, CaddyConfigManager $caddy): RedirectResponse
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
            $result = $vmManager->deployCode($app->vm_id, $buildDir);

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
}
