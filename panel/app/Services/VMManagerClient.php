<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class VMManagerClient
{
    private string $socketPath;

    public function __construct()
    {
        $this->socketPath = config('phpless.manager_socket');
    }

    private function request(): PendingRequest
    {
        $request = Http::baseUrl('http://localhost')
            ->withOptions([
                'curl' => [
                    CURLOPT_UNIX_SOCKET_PATH => $this->socketPath,
                ],
            ])
            ->acceptJson()
            ->timeout(30);

        $secret = config('phpless.manager_secret');
        if ($secret) {
            $request->withHeaders(['X-Manager-Secret' => $secret]);
        }

        return $request;
    }

    public function health(): array
    {
        return $this->request()->get('/health')->json();
    }

    public function hostStats(): array
    {
        try {
            return $this->request()->get('/host-stats')->json() ?? [];
        } catch (\Throwable) {
            return [];
        }
    }

    public function listVMs(): array
    {
        return $this->request()->get('/vms')->json();
    }

    public function getVM(string $id): array
    {
        return $this->request()->get("/vms/{$id}")->json();
    }

    public function createVM(string $slug, int $vcpus = 1, int $memMib = 256, ?string $id = null): array
    {
        $payload = ['slug' => $slug, 'vcpus' => $vcpus, 'mem_mib' => $memMib];

        if ($id !== null) {
            $payload['id'] = $id;
        }

        $response = $this->request()->post('/vms', $payload);

        if ($response->failed()) {
            throw new RuntimeException("Failed to create VM: {$response->body()}");
        }

        return $response->json();
    }

    public function destroyVM(string $id): void
    {
        $response = $this->request()->delete("/vms/{$id}");

        if ($response->failed()) {
            throw new RuntimeException("Failed to destroy VM: {$response->body()}");
        }
    }

    public function deployCode(string $vmId, string $appDir, string $envContent = '', string $caddyfileContent = '', array $persistentPaths = [], string $workersConfig = '', ?int $vcpus = null, ?int $memMib = null, bool $cronEnabled = false, array $sqliteDatabases = []): array
    {
        $payload = [
            'app_dir' => $appDir,
            'persistent_paths' => $persistentPaths,
        ];

        if ($envContent !== '') {
            $payload['env_content'] = $envContent;
        }

        if ($caddyfileContent !== '') {
            $payload['caddyfile_content'] = $caddyfileContent;
        }

        if ($workersConfig !== '') {
            $payload['workers_config'] = $workersConfig;
        }

        if ($vcpus !== null) {
            $payload['vcpus'] = $vcpus;
        }

        if ($memMib !== null) {
            $payload['mem_mib'] = $memMib;
        }

        if ($cronEnabled) {
            $payload['cron_enabled'] = true;
        }

        if (! empty($sqliteDatabases)) {
            $payload['sqlite_databases'] = $sqliteDatabases;
        }

        $response = $this->request()->timeout(60)->post("/vms/{$vmId}/deploy", $payload);

        if ($response->failed()) {
            throw new RuntimeException("Failed to deploy code: {$response->body()}");
        }

        return $response->json();
    }

    public function waitForRunning(string $vmId, int $timeout = 30): array
    {
        $start = time();

        while (time() - $start < $timeout) {
            $vm = $this->getVM($vmId);

            if (($vm['state'] ?? null) === 'running') {
                return $vm;
            }

            usleep(500_000); // 500ms
        }

        throw new RuntimeException("VM {$vmId} did not reach running state within {$timeout}s");
    }

    public function getVMLogs(string $vmId): array
    {
        $response = $this->request()->get("/vms/{$vmId}/logs");

        if ($response->failed()) {
            return [];
        }

        return $response->json('lines', []);
    }

    public function applyPortMappings(string $vmIp, array $mappings, array $allowedIPs = []): void
    {
        $payload = [
            'vm_ip' => $vmIp,
            'mappings' => $mappings,
        ];

        if (! empty($allowedIPs)) {
            $payload['allowed_ips'] = $allowedIPs;
        }

        $response = $this->request()->post('/port-mappings', $payload);

        if ($response->failed()) {
            throw new RuntimeException("Failed to apply port mappings: {$response->body()}");
        }
    }

    public function removePortMappings(string $vmIp): void
    {
        $this->request()->delete('/port-mappings', [
            'vm_ip' => $vmIp,
        ]);
    }

    public function getWorkerStatus(string $vmIp): array
    {
        $response = $this->request()->timeout(5)->get("/workers/status", ['vm_ip' => $vmIp]);

        if ($response->failed()) {
            return [];
        }

        return $response->json() ?? [];
    }

    public function getWorkerLogs(string $vmIp, string $name, int $index = 0, int $lines = 100): array
    {
        $response = $this->request()->timeout(5)->get("/workers/logs/{$name}", [
            'vm_ip' => $vmIp,
            'index' => $index,
            'lines' => $lines,
        ]);

        if ($response->failed()) {
            return ['lines' => []];
        }

        return $response->json() ?? ['lines' => []];
    }

    /**
     * Execute a command inside a VM and return stdout as a string.
     */
    public function execInVM(string $vmIp, string $command, int $timeout = 10): string
    {
        $response = $this->request()
            ->timeout($timeout + 5)
            ->post('/exec', [
                'vm_ip' => $vmIp,
                'command' => $command,
                'timeout_seconds' => $timeout,
            ]);

        if ($response->failed()) {
            throw new RuntimeException("Exec failed: {$response->body()}");
        }

        // Parse NDJSON response — collect stdout
        $stdout = '';
        foreach (explode("\n", trim($response->body())) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $entry = json_decode($line, true);
            if ($entry && ($entry['stream'] ?? '') === 'stdout') {
                $stdout .= $entry['data'] ?? '';
            }
        }

        return $stdout;
    }

    /**
     * Execute a build command inside a VM and return the combined output and exit code.
     *
     * @return array{output: string, exit_code: int}
     */
    public function execBuildCommand(string $vmIp, string $command, int $timeout = 120): array
    {
        $response = $this->request()
            ->timeout($timeout + 10)
            ->post('/exec', [
                'vm_ip' => $vmIp,
                'command' => $command,
                'timeout_seconds' => $timeout,
            ]);

        if ($response->failed()) {
            throw new RuntimeException("Build exec failed: {$response->body()}");
        }

        $output = '';
        $exitCode = 0;

        foreach (explode("\n", trim($response->body())) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $entry = json_decode($line, true);
            if (! $entry) {
                continue;
            }

            $stream = $entry['stream'] ?? '';
            if ($stream === 'stdout' || $stream === 'stderr') {
                $output .= $entry['data'] ?? '';
            } elseif ($stream === 'exit') {
                $exitCode = $entry['exit_code'] ?? 0;
            }
        }

        return ['output' => $output, 'exit_code' => $exitCode];
    }

    public function createTerminalSession(string $vmIp): string
    {
        return $this->request()
            ->post('/terminal-sessions', ['vm_ip' => $vmIp])
            ->throw()
            ->json('session_id');
    }

    public function createLogSession(string $slug): string
    {
        return $this->request()
            ->post('/log-sessions', ['slug' => $slug])
            ->throw()
            ->json('session_id');
    }

}
