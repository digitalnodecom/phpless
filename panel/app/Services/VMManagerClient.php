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
        return Http::baseUrl('http://localhost')
            ->withOptions([
                'curl' => [
                    CURLOPT_UNIX_SOCKET_PATH => $this->socketPath,
                ],
            ])
            ->acceptJson()
            ->timeout(30);
    }

    public function health(): array
    {
        return $this->request()->get('/health')->json();
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

    public function deployCode(string $vmId, string $appDir, string $envContent = '', string $caddyfileContent = '', array $persistentPaths = [], string $workersConfig = ''): array
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

    public function applyPortMappings(string $vmIp, array $mappings): void
    {
        $response = $this->request()->post('/port-mappings', [
            'vm_ip' => $vmIp,
            'mappings' => $mappings,
        ]);

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

    public function createTerminalSession(string $vmIp): string
    {
        return $this->request()
            ->post('/terminal-sessions', ['vm_ip' => $vmIp])
            ->throw()
            ->json('session_id');
    }

}
