<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Models\EnvironmentVariable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class EnvironmentVariableController extends Controller
{
    public function index(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $appVars = EnvironmentVariable::forApp($app->id)
            ->orderBy('key')
            ->get()
            ->map(fn ($v) => $this->formatVar($v, 'app'));

        $teamVars = EnvironmentVariable::forTeam($app->team_id)
            ->orderBy('key')
            ->get()
            ->map(fn ($v) => $this->formatVar($v, 'team'));

        return response()->json([
            'app_vars' => $appVars,
            'team_vars' => $teamVars,
        ]);
    }

    public function store(Request $request, App $app): JsonResponse
    {
        Gate::authorize('view', $app);

        $validated = $request->validate([
            'key' => ['required', 'string', 'max:255', 'regex:/^[A-Z_][A-Z0-9_]*$/'],
            'value' => ['required', 'string', 'max:10000'],
            'is_secret' => ['boolean'],
        ]);

        // Check uniqueness
        $exists = EnvironmentVariable::forApp($app->id)
            ->where('key', $validated['key'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'An environment variable with this key already exists.',
                'errors' => ['key' => ['This key already exists for this app.']],
            ], 422);
        }

        $var = EnvironmentVariable::create([
            'app_id' => $app->id,
            'key' => $validated['key'],
            'value' => $validated['value'],
            'is_secret' => $validated['is_secret'] ?? false,
        ]);

        return response()->json($this->formatVar($var, 'app'), 201);
    }

    public function update(Request $request, App $app, EnvironmentVariable $envVar): JsonResponse
    {
        Gate::authorize('view', $app);

        if ($envVar->app_id !== $app->id) {
            abort(404);
        }

        $validated = $request->validate([
            'value' => ['required', 'string', 'max:10000'],
            'is_secret' => ['boolean'],
        ]);

        $envVar->update($validated);

        return response()->json($this->formatVar($envVar, 'app'));
    }

    public function destroy(App $app, EnvironmentVariable $envVar): JsonResponse
    {
        Gate::authorize('view', $app);

        if ($envVar->app_id !== $app->id) {
            abort(404);
        }

        $envVar->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    private function formatVar(EnvironmentVariable $var, string $source): array
    {
        return [
            'id' => $var->id,
            'key' => $var->key,
            'value' => $var->is_secret ? '' : $var->value,
            'is_secret' => $var->is_secret,
            'source' => $source,
            'created_at' => $var->created_at,
            'updated_at' => $var->updated_at,
        ];
    }
}
