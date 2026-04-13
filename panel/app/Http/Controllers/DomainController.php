<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Models\Domain;
use App\Services\CaddyConfigManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DomainController extends Controller
{
    public function index(App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        return response()->json([
            'domains' => $app->domains()->latest()->get(),
        ]);
    }

    public function store(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $validated = $request->validate([
            'domain' => [
                'required',
                'string',
                'max:255',
                'regex:/^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/',
                'unique:domains,domain',
            ],
        ]);

        $domain = $app->domains()->create([
            'domain' => strtolower($validated['domain']),
            'type' => 'custom',
            'dns_verified' => false,
            'ssl_active' => false,
        ]);

        return response()->json(['domain' => $domain], 201);
    }

    public function verify(App $app, Domain $domain, CaddyConfigManager $caddy): JsonResponse
    {
        Gate::authorize('view', $app);

        if ($domain->app_id !== $app->id) {
            abort(404);
        }

        $serverIp = config('phpless.server_ip');
        $verified = false;

        // Check A records
        $aRecords = dns_get_record($domain->domain, DNS_A);
        if ($aRecords) {
            foreach ($aRecords as $record) {
                if (($record['ip'] ?? '') === $serverIp) {
                    $verified = true;
                    break;
                }
            }
        }

        // Check CNAME records
        if (! $verified) {
            $cnameRecords = dns_get_record($domain->domain, DNS_CNAME);
            if ($cnameRecords) {
                $expectedTarget = config('phpless.domain');
                foreach ($cnameRecords as $record) {
                    $target = rtrim($record['target'] ?? '', '.');
                    if (str_ends_with($target, $expectedTarget)) {
                        $verified = true;
                        break;
                    }
                }
            }
        }

        if (! $verified) {
            return response()->json([
                'message' => "DNS verification failed. Please add an A record pointing to {$serverIp} or a CNAME record pointing to {$app->slug}." . config('phpless.domain'),
                'verified' => false,
            ], 422);
        }

        $domain->update([
            'dns_verified' => true,
            'ssl_active' => true,
            'verified_at' => now(),
        ]);

        $caddy->regenerateAndReload();

        return response()->json([
            'domain' => $domain->fresh(),
            'verified' => true,
            'message' => 'Domain verified successfully. SSL certificate will be provisioned automatically.',
        ]);
    }

    public function destroy(App $app, Domain $domain, CaddyConfigManager $caddy): JsonResponse
    {
        Gate::authorize('view', $app);

        if ($domain->app_id !== $app->id) {
            abort(404);
        }

        $domain->delete();

        $caddy->regenerateAndReload();

        return response()->json(null, 204);
    }
}
