<?php

namespace App\Services;

use App\Models\App;
use App\Models\Team;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class AppLifecycleService
{
    public function __construct(
        private VMManagerClient $vmManager,
        private CaddyConfigManager $caddyConfig,
    ) {}

    public function createApp(Team $team, array $data): App
    {
        $slug = $data['slug'] ?? Str::slug($data['name']);

        $app = $team->apps()->create([
            'name' => $data['name'],
            'slug' => $slug,
            'vcpus' => $data['vcpus'] ?? 1,
            'mem_mib' => $data['mem_mib'] ?? 256,
            'vm_state' => 'creating',
        ]);

        try {
            $vm = $this->vmManager->createVM($slug, $app->vcpus, $app->mem_mib);
            $app->update([
                'vm_id' => $vm['id'] ?? $slug,
                'vm_state' => 'starting',
            ]);

            $vm = $this->vmManager->waitForRunning($vm['id'] ?? $slug);
            $app->update([
                'vm_ip' => $vm['ip'] ?? null,
                'vm_state' => 'running',
            ]);
        } catch (\Throwable $e) {
            $app->update(['vm_state' => 'error']);
        }

        // Always regenerate Caddy so the subdomain gets a TLS cert
        try {
            $this->caddyConfig->regenerateAndReload();
        } catch (\Throwable) {
            // Caddy reload failure shouldn't block app creation
        }

        return $app->fresh();
    }

    public function deleteApp(App $app): void
    {
        if ($app->vm_id) {
            try {
                $this->vmManager->destroyVM($app->vm_id);
            } catch (\Throwable) {
                // VM may already be gone
            }
        }

        // Clean up the build directory
        $buildDir = base_path("../builds/{$app->slug}");
        if (File::isDirectory($buildDir)) {
            File::deleteDirectory($buildDir);
        }

        $app->delete();

        $this->caddyConfig->regenerateAndReload();
    }

    public function syncVMState(App $app): App
    {
        if (! $app->vm_id) {
            return $app;
        }

        try {
            $vm = $this->vmManager->getVM($app->vm_id);
            $app->update([
                'vm_state' => $vm['state'] ?? 'unknown',
                'vm_ip' => $vm['ip'] ?? $app->vm_ip,
            ]);
        } catch (\Throwable) {
            $app->update(['vm_state' => 'unreachable']);
        }

        return $app->fresh();
    }
}
