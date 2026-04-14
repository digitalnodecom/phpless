<?php

namespace App\Jobs;

use App\Models\PreviewEnvironment;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class CleanupExpiredPreviewsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(VMManagerClient $vmManager, CaddyConfigManager $caddy): void
    {
        $expired = PreviewEnvironment::where('expires_at', '<', now())->get();

        if ($expired->isEmpty()) {
            return;
        }

        $needsCaddyReload = false;

        foreach ($expired as $preview) {
            try {
                // Destroy the VM
                if ($preview->vm_id) {
                    try {
                        $vmManager->destroyVM($preview->vm_id);
                    } catch (\Throwable) {
                        // VM may already be gone
                    }
                }

                // Clean up the build directory
                $buildDir = base_path("../builds/previews/{$preview->slug}");
                if (File::isDirectory($buildDir)) {
                    File::deleteDirectory($buildDir);
                }

                $preview->delete();
                $needsCaddyReload = true;
            } catch (\Throwable $e) {
                Log::error("Failed to clean up preview {$preview->slug}: {$e->getMessage()}");
            }
        }

        if ($needsCaddyReload) {
            try {
                $caddy->regenerateAndReload();
            } catch (\Throwable $e) {
                Log::error("Failed to reload Caddy after preview cleanup: {$e->getMessage()}");
            }
        }
    }
}
