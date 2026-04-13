<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\StorageEndpoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StorageEndpointController extends Controller
{
    /**
     * List storage endpoints
     *
     * Returns all S3-compatible storage endpoints configured for the current team.
     */
    public function index(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        return response()->json([
            'endpoints' => $team->storageEndpoints()->orderBy('name')->get(),
        ]);
    }

    /**
     * Create storage endpoint
     *
     * Add a new S3-compatible storage endpoint to the current team.
     */
    public function store(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if (! $request->user()->hasTeamRole($team, ['owner', 'admin'])) {
            return response()->json(['message' => 'Only team owners and admins can manage storage endpoints.'], 403);
        }

        $validated = $request->validate($this->rules());

        $endpoint = $team->storageEndpoints()->create($validated);

        if ($endpoint->is_default) {
            $team->storageEndpoints()->where('id', '!=', $endpoint->id)->update(['is_default' => false]);
        }

        return response()->json(['endpoint' => $endpoint], 201);
    }

    /**
     * Update storage endpoint
     *
     * Update an existing S3-compatible storage endpoint. Omit secret_access_key to keep the existing value.
     */
    public function update(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (! $request->user()->hasTeamRole($team, ['owner', 'admin'])) {
            return response()->json(['message' => 'Only team owners and admins can manage storage endpoints.'], 403);
        }

        $rules = $this->rules();
        $rules['secret_access_key'] = ['nullable', 'string', 'max:255'];

        $validated = $request->validate($rules);

        if (empty($validated['secret_access_key'])) {
            unset($validated['secret_access_key']);
        }

        $endpoint->update($validated);

        if ($endpoint->is_default) {
            $team->storageEndpoints()->where('id', '!=', $endpoint->id)->update(['is_default' => false]);
        }

        return response()->json(['endpoint' => $endpoint->fresh()]);
    }

    /**
     * Delete storage endpoint
     *
     * Remove an S3-compatible storage endpoint from the current team.
     */
    public function destroy(Request $request, StorageEndpoint $endpoint): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($endpoint->team_id !== $team->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if (! $request->user()->hasTeamRole($team, ['owner', 'admin'])) {
            return response()->json(['message' => 'Only team owners and admins can manage storage endpoints.'], 403);
        }

        $endpoint->delete();

        return response()->json(['message' => 'Storage endpoint deleted.']);
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
