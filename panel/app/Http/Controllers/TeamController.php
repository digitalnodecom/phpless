<?php

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TeamController extends Controller
{
    public function edit(Request $request): Response
    {
        $user = $request->user();
        $team = $user->currentTeam->load(['users' => function ($q) {
            $q->select('users.id', 'users.name', 'users.email');
        }, 'owner:id,name,email']);

        $isOwner = $team->owner_id === $user->id;

        $members = $team->users->map(function (User $member) use ($team) {
            return [
                'id' => $member->id,
                'name' => $member->name,
                'email' => $member->email,
                'role' => $member->pivot->role,
                'is_owner' => $member->id === $team->owner_id,
            ];
        });

        $pendingInvitations = $isOwner
            ? $team->invitations()->pending()->latest()->get()->map(fn ($inv) => [
                'id' => $inv->id,
                'email' => $inv->email,
                'url' => $inv->url(),
                'expires_at' => $inv->expires_at,
                'created_at' => $inv->created_at,
            ])
            : collect();

        return Inertia::render('settings/team', [
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'owner_id' => $team->owner_id,
            ],
            'members' => $members,
            'pendingInvitations' => $pendingInvitations,
            'isOwner' => $isOwner,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $user = $request->user();
        $team = $user->currentTeam;

        if ($team->owner_id !== $user->id) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $team->update(['name' => $validated['name']]);

        return back()->with('success', 'Team name updated.');
    }

    public function removeMember(Request $request, User $user): RedirectResponse
    {
        $authUser = $request->user();
        $team = $authUser->currentTeam;

        if ($team->owner_id !== $authUser->id) {
            abort(403);
        }

        if ($user->id === $authUser->id) {
            return back()->withErrors(['member' => 'You cannot remove yourself. Transfer ownership first.']);
        }

        $team->users()->detach($user->id);

        // If removed user's current team was this one, switch them to another
        if ($user->current_team_id === $team->id) {
            $otherTeam = $user->teams()->where('team_id', '!=', $team->id)->first();
            $user->update(['current_team_id' => $otherTeam?->id]);
        }

        return back()->with('success', "{$user->name} has been removed from the team.");
    }

    public function leave(Request $request): RedirectResponse
    {
        $user = $request->user();
        $team = $user->currentTeam;

        if ($team->owner_id === $user->id) {
            return back()->withErrors(['leave' => 'Team owners cannot leave. Transfer ownership or delete the team first.']);
        }

        $team->users()->detach($user->id);

        $otherTeam = $user->teams()->where('team_id', '!=', $team->id)->first();
        $user->update(['current_team_id' => $otherTeam?->id]);

        return redirect()->route('dashboard')->with('success', 'You have left the team.');
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        // Generate a unique slug
        $baseSlug = \Illuminate\Support\Str::slug($validated['name']);
        $slug = $baseSlug;
        $counter = 1;
        while (Team::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$counter}";
            $counter++;
        }

        $team = Team::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'owner_id' => $user->id,
            'plan' => 'hobby',
        ]);

        $team->users()->attach($user->id, ['role' => 'owner']);
        $user->update(['current_team_id' => $team->id]);

        return redirect()->route('dashboard')->with('success', "Team '{$team->name}' created.");
    }

    public function switchTeam(Request $request, Team $team): RedirectResponse
    {
        $user = $request->user();

        if (! $user->teams->contains($team->id)) {
            abort(403);
        }

        $user->update(['current_team_id' => $team->id]);

        return redirect()->route('dashboard');
    }
}
