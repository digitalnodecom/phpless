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
        $this->enforcePlanLimits($team, $data);

        $slug = $data['slug'] ?? Str::slug($data['name']);

        $app = $team->apps()->create([
            'name' => $data['name'],
            'slug' => $slug,
            'vcpus' => $data['vcpus'] ?? min(1, $team->maxVcpus()),
            'mem_mib' => $data['mem_mib'] ?? min(256, $team->maxMemMib()),
        ]);
        $app->forceFill(['vm_state' => 'creating'])->save();

        try {
            $vm = $this->vmManager->createVM($slug, $app->vcpus, $app->mem_mib);
            $app->forceFill([
                'vm_id' => $vm['id'] ?? $slug,
                'vm_state' => 'starting',
            ])->save();

            $vm = $this->vmManager->waitForRunning($vm['id'] ?? $slug);
            $app->forceFill([
                'vm_ip' => $vm['ip'] ?? null,
                'vm_state' => 'running',
            ])->save();
        } catch (\Throwable $e) {
            $app->forceFill(['vm_state' => 'error'])->save();
        }

        // Always regenerate Caddy so the subdomain gets a TLS cert
        try {
            $this->caddyConfig->regenerateAndReload();
        } catch (\Throwable) {
            // Caddy reload failure shouldn't block app creation
        }

        return $app->fresh();
    }

    public function enforcePlanLimits(Team $team, array $data, ?App $existingApp = null): void
    {
        // Check app count limit (only for new apps)
        if (! $existingApp) {
            $currentCount = $team->apps()->count();
            $limit = $team->appLimit();
            if ($currentCount >= $limit) {
                $planLabel = $team->planConfig()['label'];
                throw new \RuntimeException(
                    "Your {$planLabel} plan allows {$limit} " . ($limit === 1 ? 'app' : 'apps') . ". Upgrade to create more."
                );
            }
        }

        // Check memory limit
        $memMib = (int) ($data['mem_mib'] ?? $existingApp?->mem_mib ?? 256);
        $maxMem = $team->maxMemMib();
        if ($memMib > $maxMem) {
            $planLabel = $team->planConfig()['label'];
            throw new \RuntimeException(
                "Your {$planLabel} plan allows up to {$maxMem} MB of memory. Upgrade for more resources."
            );
        }

        // Check vCPU limit
        $vcpus = (int) ($data['vcpus'] ?? $existingApp?->vcpus ?? 1);
        $maxVcpus = $team->maxVcpus();
        if ($vcpus > $maxVcpus) {
            $planLabel = $team->planConfig()['label'];
            throw new \RuntimeException(
                "Your {$planLabel} plan allows up to {$maxVcpus} " . ($maxVcpus === 1 ? 'vCPU' : 'vCPUs') . ". Upgrade for more resources."
            );
        }
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

        // Clean up port forwarding rules
        if ($app->vm_ip && ! empty($app->port_mappings)) {
            try {
                $this->vmManager->removePortMappings($app->vm_ip);
            } catch (\Throwable) {}
        }

        // Clean up preview environment VMs
        foreach ($app->previewEnvironments as $preview) {
            if ($preview->vm_id) {
                try {
                    $this->vmManager->destroyVM($preview->vm_id);
                } catch (\Throwable) {}
            }

            $previewBuildDir = base_path("../builds/previews/{$preview->slug}");
            if (File::isDirectory($previewBuildDir)) {
                File::deleteDirectory($previewBuildDir);
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
            $app->forceFill([
                'vm_state' => $vm['state'] ?? 'unknown',
                'vm_ip' => $vm['ip'] ?? $app->vm_ip,
            ])->save();
        } catch (\Throwable) {
            $app->forceFill(['vm_state' => 'unreachable'])->save();
        }

        return $app->fresh();
    }
}
