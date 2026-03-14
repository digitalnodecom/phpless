<?php

namespace App\Http\Controllers;

use App\Models\TeamInvitation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class TeamInvitationController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $team = $user->currentTeam;

        if ($team->owner_id !== $user->id) {
            abort(403);
        }

        $validated = $request->validate([
            'email' => ['nullable', 'string', 'max:255'],
        ]);

        $invitation = $team->invitations()->create([
            'email' => $validated['email'] ?: null,
            'token' => Str::random(32),
            'expires_at' => now()->addDays(7),
        ]);

        return back()->with('inviteUrl', $invitation->url());
    }

    public function show(string $token): Response|RedirectResponse
    {
        $invitation = TeamInvitation::where('token', $token)->with('team')->firstOrFail();

        $user = auth()->user();
        $alreadyMember = $user && $user->teams->contains($invitation->team_id);

        return Inertia::render('invitations/show', [
            'invitation' => [
                'id' => $invitation->id,
                'token' => $invitation->token,
                'team' => [
                    'name' => $invitation->team->name,
                ],
                'email' => $invitation->email,
                'expires_at' => $invitation->expires_at,
                'is_expired' => $invitation->isExpired(),
                'is_accepted' => ! is_null($invitation->accepted_at),
            ],
            'alreadyMember' => $alreadyMember,
        ]);
    }

    public function accept(Request $request, string $token): RedirectResponse
    {
        $invitation = TeamInvitation::where('token', $token)->with('team')->firstOrFail();

        if ($invitation->isExpired()) {
            return back()->withErrors(['invitation' => 'This invitation has expired.']);
        }

        if (! is_null($invitation->accepted_at)) {
            return redirect()->route('dashboard')->with('success', 'You have already accepted this invitation.');
        }

        $user = $request->user();

        if ($user->teams->contains($invitation->team_id)) {
            // Already a member — just switch to this team
            $user->update(['current_team_id' => $invitation->team_id]);
            return redirect()->route('dashboard')->with('success', "You are already a member of {$invitation->team->name}.");
        }

        $invitation->team->users()->attach($user->id, ['role' => 'member']);
        $invitation->update(['accepted_at' => now()]);
        $user->update(['current_team_id' => $invitation->team_id]);

        return redirect()->route('dashboard')->with('success', "You have joined {$invitation->team->name}!");
    }

    public function destroy(Request $request, TeamInvitation $invitation): RedirectResponse
    {
        $user = $request->user();
        $team = $user->currentTeam;

        if ($team->owner_id !== $user->id || $invitation->team_id !== $team->id) {
            abort(403);
        }

        $invitation->delete();

        return back()->with('success', 'Invitation revoked.');
    }
}
