<?php

namespace App\Jobs;

use App\Models\App;
use App\Models\Deployment;
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

class GitDeployJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;

    public function __construct(
        public App $app,
        public ?string $commitSha = null,
        public ?string $commitMessage = null,
        public ?string $commitAuthor = null,
    ) {}

    public function handle(
        VMManagerClient $vmManager,
        CaddyConfigManager $caddy,
        EnvironmentVariableService $envService,
    ): void {
        $deployment = $this->app->deployments()->create([
            'status' => 'building',
            'source' => 'git',
            'branch' => $this->app->github_branch ?? 'main',
            'commit_sha' => $this->commitSha,
            'commit_message' => $this->commitMessage,
            'commit_author' => $this->commitAuthor,
            'started_at' => now(),
        ]);

        $tempDir = sys_get_temp_dir() . '/phpless-git-' . $this->app->slug . '-' . uniqid();

        try {
            $this->cloneRepo($tempDir);

            // If commit info wasn't provided (manual trigger), read it from the cloned repo
            if (! $this->commitSha) {
                $this->extractCommitInfo($tempDir, $deployment);
            }

            // Copy cloned files to the build directory
            $buildDir = base_path("../builds/{$this->app->slug}");
            if (File::exists($buildDir)) {
                File::deleteDirectory($buildDir);
            }
            File::copyDirectory($tempDir, $buildDir);

            // Remove .git directory from build
            $gitDir = $buildDir . '/.git';
            if (File::isDirectory($gitDir)) {
                File::deleteDirectory($gitDir);
            }

            // Deploy to VM
            if (! $this->app->vm_id) {
                $deployment->update([
                    'status' => 'failed',
                    'log' => 'App has no VM assigned.',
                    'completed_at' => now(),
                ]);
                return;
            }

            $envContent = $envService->generateEnvContent($this->app);
            $caddyContent = (new CaddyfileGenerator)->generate($this->app);
            $workersConfig = ! empty($this->app->workers) ? json_encode($this->app->workers) : '';
            $result = $vmManager->deployCode(
                $this->app->vm_id,
                $buildDir,
                $envContent,
                $caddyContent,
                $this->app->persistent_paths ?? [],
                $workersConfig,
                null,
                null,
                $this->app->cron_enabled,
            );

            $newVmId = $result['vm_id'] ?? $this->app->vm_id;
            try {
                $vm = $vmManager->waitForRunning($newVmId, 15);
                $this->app->forceFill([
                    'vm_id' => $newVmId,
                    'vm_state' => $vm['state'] ?? 'running',
                    'vm_ip' => $vm['ip'] ?? $this->app->vm_ip,
                ])->save();
            } catch (\Throwable) {
                $this->app->forceFill(['vm_id' => $newVmId])->save();
            }
            $this->app->refresh();

            // Run build command inside the VM if configured
            if ($this->app->build_command && $this->app->vm_ip) {
                try {
                    $buildResult = $vmManager->execBuildCommand($this->app->vm_ip, $this->app->build_command, 120);
                    $deployment->update(['build_output' => $buildResult['output']]);

                    if ($buildResult['exit_code'] !== 0) {
                        $deployment->update([
                            'status' => 'failed',
                            'log' => 'Build command failed with exit code ' . $buildResult['exit_code'],
                            'completed_at' => now(),
                        ]);

                        return;
                    }
                } catch (\Throwable $e) {
                    $deployment->update([
                        'status' => 'failed',
                        'build_output' => $e->getMessage(),
                        'log' => 'Build command failed.',
                        'completed_at' => now(),
                    ]);

                    return;
                }
            }

            $caddy->regenerateAndReload();

            if (! empty($this->app->port_mappings) && $this->app->vm_ip) {
                try {
                    $vmManager->applyPortMappings($this->app->vm_ip, $this->app->port_mappings, $this->app->ip_allowlist ?? []);
                } catch (\Throwable) {}
            }

            $deployment->update([
                'status' => 'succeeded',
                'completed_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $deployment->update([
                'status' => 'failed',
                'log' => $e->getMessage(),
                'completed_at' => now(),
            ]);
        } finally {
            // Clean up temp directory
            if (File::isDirectory($tempDir)) {
                File::deleteDirectory($tempDir);
            }
        }
    }

    private function cloneRepo(string $targetDir): void
    {
        $repo = $this->app->github_repo;
        $branch = $this->app->github_branch ?? 'main';

        if (! $repo) {
            throw new \RuntimeException('No GitHub repository configured.');
        }

        // Ensure the URL is an HTTPS clone URL
        $cloneUrl = $this->normalizeRepoUrl($repo);

        $result = Process::timeout(120)->run([
            'git', 'clone',
            '--depth', '1',
            '--single-branch',
            '--branch', $branch,
            $cloneUrl,
            $targetDir,
        ]);

        if (! $result->successful()) {
            throw new \RuntimeException('Git clone failed: ' . $result->errorOutput());
        }
    }

    private function normalizeRepoUrl(string $repo): string
    {
        // Accept GitHub URLs in various formats and normalize to HTTPS
        $repo = trim($repo);

        // Already an HTTPS URL
        if (str_starts_with($repo, 'https://')) {
            return rtrim($repo, '/') . '.git';
        }

        // SSH format: git@github.com:user/repo.git
        if (preg_match('#^git@github\.com:(.+?)(?:\.git)?$#', $repo, $matches)) {
            return 'https://github.com/' . $matches[1] . '.git';
        }

        // Short format: user/repo
        if (preg_match('#^[\w.-]+/[\w.-]+$#', $repo)) {
            return 'https://github.com/' . $repo . '.git';
        }

        return $repo;
    }

    private function extractCommitInfo(string $repoDir, Deployment $deployment): void
    {
        $result = Process::path($repoDir)->run([
            'git', 'log', '-1', '--format=%H%n%s%n%an',
        ]);

        if ($result->successful()) {
            $lines = explode("\n", trim($result->output()));
            $deployment->update([
                'commit_sha' => $lines[0] ?? null,
                'commit_message' => $lines[1] ?? null,
                'commit_author' => $lines[2] ?? null,
            ]);
        }
    }
}
