<?php

namespace App\Console\Commands;

use App\Models\App;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
use Illuminate\Console\Command;

class RestoreVms extends Command
{
    protected $signature = 'app:restore-vms';

    protected $description = 'Recreate VMs for all apps after a server reboot';

    public function handle(VMManagerClient $vmManager, CaddyConfigManager $caddyConfig): int
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
                $this->restoreApp($app, $vmManager);
                $succeeded++;
                $this->info("  [{$app->slug}] restored (vm_id={$app->vm_id}, ip={$app->vm_ip})");
            } catch (\Throwable $e) {
                $failed++;
                $app->update(['vm_state' => 'error']);
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

    private function restoreApp(App $app, VMManagerClient $vmManager): void
    {
        $vm = $vmManager->createVM($app->slug, $app->vcpus, $app->mem_mib);
        $vmId = $vm['id'] ?? $app->slug;

        $app->update([
            'vm_id' => $vmId,
            'vm_state' => 'starting',
        ]);

        $vm = $vmManager->waitForRunning($vmId);

        $app->update([
            'vm_ip' => $vm['ip'] ?? null,
            'vm_state' => 'running',
        ]);

        // Redeploy code if a build exists
        $buildDir = config('phpless.builds_dir') . '/' . $app->slug;
        if (is_dir($buildDir)) {
            $vmManager->deployCode($vmId, $buildDir);
            $this->line("    deployed code from {$buildDir}");
        }
    }
}
