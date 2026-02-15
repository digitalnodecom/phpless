<?php

namespace App\Http\Controllers;

use App\Models\EnvironmentVariable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TeamEnvironmentVariableController extends Controller
{
    public function index(Request $request): JsonResponse|Response
    {
        $team = $request->user()->currentTeam;

        $vars = EnvironmentVariable::forTeam($team->id)
            ->orderBy('key')
            ->get()
            ->map(fn ($v) => $this->formatVar($v));

        if ($request->wantsJson()) {
            return response()->json(['vars' => $vars]);
        }

        return Inertia::render('teams/env', [
            'vars' => $vars,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($team->owner_id !== $request->user()->id) {
            abort(403, 'Only the team owner can manage team environment variables.');
        }

        $validated = $request->validate([
            'key' => ['required', 'string', 'max:255', 'regex:/^[A-Z_][A-Z0-9_]*$/'],
            'value' => ['required', 'string', 'max:10000'],
            'is_secret' => ['boolean'],
        ]);

        $exists = EnvironmentVariable::forTeam($team->id)
            ->where('key', $validated['key'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'An environment variable with this key already exists.',
                'errors' => ['key' => ['This key already exists for this team.']],
            ], 422);
        }

        $var = EnvironmentVariable::create([
            'team_id' => $team->id,
            'key' => $validated['key'],
            'value' => $validated['value'],
            'is_secret' => $validated['is_secret'] ?? false,
        ]);

        return response()->json($this->formatVar($var), 201);
    }

    public function update(Request $request, EnvironmentVariable $envVar): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($team->owner_id !== $request->user()->id) {
            abort(403, 'Only the team owner can manage team environment variables.');
        }

        if ($envVar->team_id !== $team->id) {
            abort(404);
        }

        $validated = $request->validate([
            'value' => ['required', 'string', 'max:10000'],
            'is_secret' => ['boolean'],
        ]);

        $envVar->update($validated);

        return response()->json($this->formatVar($envVar));
    }

    public function destroy(Request $request, EnvironmentVariable $envVar): JsonResponse
    {
        $team = $request->user()->currentTeam;

        if ($team->owner_id !== $request->user()->id) {
            abort(403, 'Only the team owner can manage team environment variables.');
        }

        if ($envVar->team_id !== $team->id) {
            abort(404);
        }

        $envVar->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    private function formatVar(EnvironmentVariable $var): array
    {
        return [
            'id' => $var->id,
            'key' => $var->key,
            'value' => $var->is_secret ? '' : $var->value,
            'is_secret' => $var->is_secret,
            'created_at' => $var->created_at,
            'updated_at' => $var->updated_at,
        ];
    }
}
