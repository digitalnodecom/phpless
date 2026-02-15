<?php

namespace App\Http\Middleware;

use App\Models\Team;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class EnsureHasTeam
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        if (! $user->current_team_id) {
            $team = $user->ownedTeams()->first();

            if (! $team) {
                $slug = Str::slug($user->name) ?: 'personal';
                $slug = $this->uniqueSlug($slug);

                $team = Team::create([
                    'name' => $user->name . "'s Team",
                    'slug' => $slug,
                    'owner_id' => $user->id,
                ]);

                $team->users()->attach($user->id, ['role' => 'owner']);
            }

            $user->update(['current_team_id' => $team->id]);
        }

        return $next($request);
    }

    private function uniqueSlug(string $slug): string
    {
        $original = $slug;
        $counter = 1;

        while (Team::where('slug', $slug)->exists()) {
            $slug = "{$original}-{$counter}";
            $counter++;
        }

        return $slug;
    }
}
