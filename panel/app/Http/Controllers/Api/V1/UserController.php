<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Get current user
     *
     * Returns the authenticated user's profile and their current team.
     */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $team = $user->currentTeam;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'current_team' => $team ? [
                    'id' => $team->id,
                    'name' => $team->name,
                    'slug' => $team->slug,
                ] : null,
                'created_at' => $user->created_at,
            ],
        ]);
    }
}
