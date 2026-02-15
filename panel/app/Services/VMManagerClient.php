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

    public function createVM(string $slug, int $vcpus = 1, int $memMib = 128): array
    {
        $response = $this->request()->post('/vms', [
            'slug' => $slug,
            'vcpus' => $vcpus,
            'mem_mib' => $memMib,
        ]);

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

    public function deployCode(string $vmId, string $appDir): array
    {
        $response = $this->request()->timeout(60)->post("/vms/{$vmId}/deploy", [
            'app_dir' => $appDir,
        ]);

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
}
