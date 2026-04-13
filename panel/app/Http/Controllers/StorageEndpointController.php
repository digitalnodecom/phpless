<?php

namespace App\Http\Controllers;

use App\Models\StorageEndpoint;
use Aws\S3\S3Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class StorageEndpointController extends Controller
{
    public function index(Request $request): JsonResponse|\Inertia\Response
    {
        $team = $request->user()->currentTeam;

        $endpoints = $team->storageEndpoints()->orderBy('name')->get();

        if ($request->wantsJson()) {
            return response()->json(['endpoints' => $endpoints]);
        }

        return Inertia::render('settings/team-storage', [
            'endpoints' => $endpoints,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        $validated = $request->validate($this->rules());

        $endpoint = $team->storageEndpoints()->create($validated);

        if ($endpoint->is_default) {
            $team->storageEndpoints()->where('id', '!=', $endpoint->id)->update(['is_default' => false]);
        }

        return response()->json(['endpoint' => $endpoint], 201);
    }

    public function update(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            abort(404);
        }

        $rules = $this->rules();
        $rules['secret_access_key'] = ['nullable', 'string', 'max:255'];

        $validated = $request->validate($rules);

        // Keep existing secret if not provided
        if (empty($validated['secret_access_key'])) {
            unset($validated['secret_access_key']);
        }

        $endpoint->update($validated);

        if ($endpoint->is_default) {
            $team->storageEndpoints()->where('id', '!=', $endpoint->id)->update(['is_default' => false]);
        }

        return response()->json(['endpoint' => $endpoint->fresh()]);
    }

    public function destroy(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            abort(404);
        }

        $endpoint->delete();

        return response()->json(['message' => 'Storage endpoint deleted.']);
    }

    public function test(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            abort(404);
        }

        try {
            $config = [
                'region' => $endpoint->region,
                'version' => 'latest',
                'credentials' => [
                    'key' => $endpoint->access_key_id,
                    'secret' => $endpoint->secret_access_key,
                ],
                'use_path_style_endpoint' => true,
            ];

            if ($endpoint->endpoint_url) {
                $config['endpoint'] = $endpoint->endpoint_url;
            }

            $client = new S3Client($config);
            $client->listObjectsV2([
                'Bucket' => $endpoint->bucket,
                'MaxKeys' => 1,
                'Prefix' => $endpoint->path_prefix ?? '',
            ]);

            return response()->json(['success' => true, 'message' => 'Connection successful.']);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Connection failed: ' . $e->getMessage(),
            ], 422);
        }
    }

    public function setDefault(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            abort(404);
        }

        $team->storageEndpoints()->update(['is_default' => false]);
        $endpoint->update(['is_default' => true]);

        return response()->json(['endpoint' => $endpoint->fresh()]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'provider' => ['required', Rule::in(['s3', 'r2', 'do-spaces', 'backblaze', 'minio', 'custom'])],
            'endpoint_url' => ['required_unless:provider,s3', 'nullable', 'string', 'max:2048'],
            'bucket' => ['required', 'string', 'max:255'],
            'region' => ['required', 'string', 'max:50'],
            'access_key_id' => ['required', 'string', 'max:255'],
            'secret_access_key' => ['required', 'string', 'max:255'],
            'path_prefix' => ['nullable', 'string', 'max:255'],
            'is_default' => ['boolean'],
        ];
    }
}
