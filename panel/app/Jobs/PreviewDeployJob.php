<?php

namespace App\Jobs;

use App\Models\App;
use App\Models\PreviewEnvironment;
use App\Services\CaddyConfigManager;
use App\Services\CaddyfileGenerator;
use App\Services\EnvironmentVariableService;
use App\Services\VMManagerClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

class PreviewDeployJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;

    public function __construct(
        public App $app,
        public PreviewEnvironment $preview,
        public ?string $commitSha = null,
        public ?string $commitMessage = null,
        public ?string $commitAuthor = null,
    ) {}

    public function handle(
        VMManagerClient $vmManager,
        CaddyConfigManager $caddy,
        EnvironmentVariableService $envService,
    ): void {
        $tempDir = sys_get_temp_dir() . '/phpless-preview-' . $this->preview->slug . '-' . uniqid();

        try {
            $this->preview->update(['vm_state' => 'building']);

            $this->cloneRepo($tempDir);

            // Extract commit info from the clone if not provided
            if (! $this->commitSha) {
                $this->extractCommitInfo($tempDir);
            } else {
                $this->preview->update([
                    'commit_sha' => $this->commitSha,
                    'commit_message' => $this->commitMessage,
                    'commit_author' => $this->commitAuthor,
                ]);
            }

            // Copy cloned files to a build directory
            $buildDir = base_path("../builds/previews/{$this->preview->slug}");
            if (File::exists($buildDir)) {
                File::deleteDirectory($buildDir);
            }
            File::copyDirectory($tempDir, $buildDir);

            // Remove .git directory from build
            $gitDir = $buildDir . '/.git';
            if (File::isDirectory($gitDir)) {
                File::deleteDirectory($gitDir);
            }

            // Create or reuse VM
            if ($this->preview->vm_id) {
                // Redeploy to existing VM
                $vmId = $this->preview->vm_id;
            } else {
                // Create a new VM with smaller resources for previews
                $vm = $vmManager->createVM($this->preview->slug, 1, 128);
                $vmId = $vm['id'] ?? $this->preview->slug;
                $this->preview->update(['vm_id' => $vmId]);
            }

            // Deploy code to the VM
            $envContent = $envService->generateEnvContent($this->app);
            $caddyContent = (new CaddyfileGenerator)->generate($this->app);

            $vmManager->deployCode(
                $vmId,
                $buildDir,
                $envContent,
                $caddyContent,
            );

            // Wait for the VM to be running
            $newVmId = $vmId;
            try {
                $vm = $vmManager->waitForRunning($newVmId, 15);
                $this->preview->update([
                    'vm_id' => $newVmId,
                    'vm_state' => $vm['state'] ?? 'running',
                    'vm_ip' => $vm['ip'] ?? null,
                ]);
            } catch (\Throwable) {
                $this->preview->update(['vm_id' => $newVmId, 'vm_state' => 'error']);
            }

            // Run build command inside the VM if configured
            if ($this->app->build_command && $this->preview->vm_ip) {
                try {
                    $vmManager->execBuildCommand($this->preview->vm_ip, $this->app->build_command, 120);
                } catch (\Throwable) {
                    // Build command failure is non-fatal for previews
                }
            }

            // Regenerate Caddy config to include the preview route
            $caddy->regenerateAndReload();

            // Set expiry
            $ttl = $this->app->preview_ttl_hours ?? 72;
            $this->preview->update(['expires_at' => now()->addHours($ttl)]);
        } catch (\Throwable $e) {
            $this->preview->update([
                'vm_state' => 'error',
                'commit_message' => $this->preview->commit_message ?? $e->getMessage(),
            ]);
        } finally {
            if (File::isDirectory($tempDir)) {
                File::deleteDirectory($tempDir);
            }
        }
    }

    private function cloneRepo(string $targetDir): void
    {
        $repo = $this->app->github_repo;

        if (! $repo) {
            throw new \RuntimeException('No GitHub repository configured.');
        }

        $cloneUrl = $this->normalizeRepoUrl($repo);

        $result = Process::timeout(120)->run([
            'git', 'clone',
            '--depth', '1',
            '--single-branch',
            '--branch', $this->preview->branch,
            $cloneUrl,
            $targetDir,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Git clone failed: ' . $result->errorOutput());
        }
    }

    private function normalizeRepoUrl(string $repo): string
    {
        $repo = trim($repo);

        if (str_starts_with($repo, 'https://')) {
            return rtrim($repo, '/') . '.git';
        }

        if (preg_match('#^git@github\.com:(.+?)(?:\.git)?$#', $repo, $matches)) {
            return 'https://github.com/' . $matches[1] . '.git';
        }

        if (preg_match('#^[\w.-]+/[\w.-]+$#', $repo)) {
            return 'https://github.com/' . $repo . '.git';
        }

        return $repo;
    }

    private function extractCommitInfo(string $repoDir): void
    {
        $result = Process::path($repoDir)->run([
            'git', 'log', '-1', '--format=%H%n%s%n%an',
        ]);

        if ($result->successful()) {
            $lines = explode("\n", trim($result->output()));
            $this->preview->update([
                'commit_sha' => $lines[0] ?? null,
                'commit_message' => $lines[1] ?? null,
                'commit_author' => $lines[2] ?? null,
            ]);
        }
    }
}
