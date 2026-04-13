<?php

namespace App\Console\Commands;

use App\Models\App;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
use App\Services\EnvironmentVariableService;
use App\Services\VMManagerClient;
use Illuminate\Console\Command;

class RestoreVms extends Command
{
    protected $signature = 'app:restore-vms';

    protected $description = 'Recreate VMs for all apps after a server reboot';

    public function handle(VMManagerClient $vmManager, CaddyConfigManager $caddyConfig, EnvironmentVariableService $envService): int
    {
        $this->info('Waiting for VM manager...');

        if (! $this->waitForManager($vmManager)) {
            $this->error('VM manager did not become ready within 15 seconds.');
            return self::FAILURE;
        }

        $this->info('VM manager is ready.');

        $apps = App::all();

        if ($apps->isEmpty()) {
            $this->info('No apps to restore.');
            return self::SUCCESS;
        }

        $this->info("Restoring {$apps->count()} app(s)...");

        $succeeded = 0;
        $failed = 0;

        foreach ($apps as $app) {
            try {
                $this->restoreApp($app, $vmManager, $envService);
                $succeeded++;
                $this->info("  [{$app->slug}] restored (vm_id={$app->vm_id}, ip={$app->vm_ip})");

                // Reapply port forwarding rules
                if (! empty($app->port_mappings) && $app->vm_ip) {
                    try {
                        $vmManager->applyPortMappings($app->vm_ip, $app->port_mappings, $app->ip_allowlist ?? []);
                        $this->info("  [{$app->slug}] port mappings applied");
                    } catch (\Throwable) {}
                }
            } catch (\Throwable $e) {
                $failed++;
                $app->forceFill(['vm_state' => 'error'])->save();
                $this->error("  [{$app->slug}] failed: {$e->getMessage()}");
            }
        }

        $this->info("Regenerating Caddy config...");
        try {
            $caddyConfig->regenerateAndReload();
            $this->info('Caddy config reloaded.');
        } catch (\Throwable $e) {
            $this->error("Caddy reload failed: {$e->getMessage()}");
        }

        $this->info("Done. {$succeeded} restored, {$failed} failed.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function waitForManager(VMManagerClient $vmManager): bool
    {
        $deadline = time() + 15;

        while (time() < $deadline) {
            try {
                $vmManager->health();
                return true;
            } catch (\Throwable) {
                usleep(500_000);
            }
        }

        return false;
    }

    private function restoreApp(App $app, VMManagerClient $vmManager, EnvironmentVariableService $envService): void
    {
        $vm = $vmManager->createVM($app->slug, $app->vcpus, $app->mem_mib, $app->vm_id ?: null);
        $vmId = $vm['id'] ?? $app->slug;

        $app->forceFill([
            'vm_id' => $vmId,
            'vm_state' => 'starting',
        ])->save();

        $vm = $vmManager->waitForRunning($vmId);

        $app->forceFill([
            'vm_ip' => $vm['ip'] ?? null,
            'vm_state' => 'running',
        ])->save();

        // Redeploy code if a build exists
        // Note: deployCode triggers Redeploy in the Go manager which destroys
        // the VM and recreates it with a new ID/IP, so we must update the DB.
        $buildDir = config('phpless.builds_dir') . '/' . $app->slug;
        if (is_dir($buildDir)) {
            $envContent = $envService->generateEnvContent($app);
            $caddyContent = (new CaddyfileGenerator)->generate($app);
            $workersConfig = ! empty($app->workers) ? json_encode($app->workers) : '';
            $result = $vmManager->deployCode($vmId, $buildDir, $envContent, $caddyContent, $app->persistent_paths ?? [], $workersConfig, null, null, $app->cron_enabled);
            $newVmId = $result['vm_id'] ?? $vmId;

            $vm = $vmManager->waitForRunning($newVmId);
            $app->forceFill([
                'vm_id' => $newVmId,
                'vm_ip' => $vm['ip'] ?? null,
                'vm_state' => 'running',
            ])->save();
            $app->refresh();

            $this->line("    deployed code from {$buildDir}");
        }
    }
}
