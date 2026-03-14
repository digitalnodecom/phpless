<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EnvironmentVariable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TeamController extends Controller
{
    /**
     * Get current team
     *
     * Returns the authenticated user's current team info, including plan and app count.
     */
    public function show(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        return response()->json([
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'plan' => $team->plan,
                'app_count' => $team->apps()->count(),
                'created_at' => $team->created_at,
            ],
        ]);
    }

    /**
     * List team environment variables
     *
     * Returns all environment variables scoped to the current team. Secret values are masked.
     */
    public function envIndex(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        $vars = EnvironmentVariable::forTeam($team->id)
            ->orderBy('key')
            ->get()
            ->map(fn (EnvironmentVariable $v) => [
                'key' => $v->key,
                'value' => $v->is_secret ? '********' : $v->value,
                'is_secret' => $v->is_secret,
                'created_at' => $v->created_at,
                'updated_at' => $v->updated_at,
            ]);

        return response()->json(['vars' => $vars]);
    }

    /**
     * Set team environment variables
     *
     * Batch upsert team-level environment variables. Only the team owner can perform this action.
     * Keys must match `[A-Z_][A-Z0-9_]*`.
     */
    public function envSet(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($team->owner_id !== $request->user()->id) {
            return response()->json(['message' => 'Only the team owner can manage team environment variables.'], 403);
        }

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
                ['team_id' => $team->id, 'key' => $key, 'app_id' => null],
                ['value' => $value],
            );
        }

        return response()->json(['message' => 'Team environment variables updated.']);
    }

    /**
     * Delete team environment variable
     *
     * Remove a single team-level environment variable by key. Only the team owner can perform this action.
     */
    public function envDestroy(Request $request, string $key): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($team->owner_id !== $request->user()->id) {
            return response()->json(['message' => 'Only the team owner can manage team environment variables.'], 403);
        }

        $var = EnvironmentVariable::forTeam($team->id)->where('key', $key)->first();

        if (! $var) {
            return response()->json(['message' => 'Variable not found.'], 404);
        }

        $var->delete();

        return response()->json(['message' => 'Deleted.']);
    }
}
