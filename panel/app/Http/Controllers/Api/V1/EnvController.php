<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\App;
use App\Models\EnvironmentVariable;
use App\Services\EnvironmentVariableService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class EnvController extends Controller
{
    /**
     * List app environment variables
     *
     * Returns merged environment variables for the app (team + app scope). App-level vars override team-level vars when keys collide. Secret values are masked.
     */
    public function index(App $app, EnvironmentVariableService $envService): JsonResponse
    {
        Gate::authorize('view', $app);

        $merged = $envService->getMergedVariables($app);

        $vars = $merged->map(fn (EnvironmentVariable $v) => [
            'key' => $v->key,
            'value' => $v->is_secret ? '********' : $v->value,
            'is_secret' => $v->is_secret,
            'source' => $v->source,
        ]);

        return response()->json(['vars' => $vars->values()]);
    }

    /**
     * Set app environment variables
     *
     * Batch upsert app-level environment variables. Keys must match `[A-Z_][A-Z0-9_]*`.
     */
    public function set(Request $request, App $app): JsonResponse
    {
        Gate::authorize('update', $app);

        $request->validate([
            'vars' => ['required', 'array'],
            'vars.*' => ['required', 'string', 'max:10000'],
        ]);

        foreach ($request->input('vars') as $key => $value) {
            if (! preg_match('/^[A-Z_][A-Z0-9_]*$/', $key)) {
                return response()->json([
                    'message' => "Invalid key format: {$key}. Keys must match /^[A-Z_][A-Z0-9_]*$/.",
                ], 422);
            }

            EnvironmentVariable::updateOrCreate(
                ['app_id' => $app->id, 'key' => $key, 'team_id' => null],
                ['value' => $value],
            );
        }

        return response()->json(['message' => 'Environment variables updated.']);
    }

    /**
     * Delete app environment variable
     *
     * Remove a single app-level environment variable by key.
     */
    public function destroy(App $app, string $key): JsonResponse
    {
        Gate::authorize('update', $app);

        $var = EnvironmentVariable::forApp($app->id)->where('key', $key)->first();

        if (! $var) {
            return response()->json(['message' => 'Variable not found.'], 404);
        }

        $var->delete();

        return response()->json(['message' => 'Deleted.']);
    }
}
