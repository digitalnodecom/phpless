<?php

namespace App\Policies;

use App\Models\App;
use App\Models\User;

class AppPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, App $app): bool
    {
        if ($user->current_team_id !== $app->team_id) {
            return false;
        }

        return $user->hasTeamRole($app->team, ['owner', 'admin', 'member', 'viewer']);
    }

    public function create(User $user): bool
    {
        $team = $user->currentTeam;

        return $team && $user->hasTeamRole($team, ['owner', 'admin']);
    }

    public function update(User $user, App $app): bool
    {
        if ($user->current_team_id !== $app->team_id) {
            return false;
        }

        return $user->hasTeamRole($app->team, ['owner', 'admin']);
    }

    public function deploy(User $user, App $app): bool
    {
        if ($user->current_team_id !== $app->team_id) {
            return false;
        }

        return $user->hasTeamRole($app->team, ['owner', 'admin', 'member']);
    }

    public function delete(User $user, App $app): bool
    {
        if ($user->current_team_id !== $app->team_id) {
            return false;
        }

        return $user->hasTeamRole($app->team, ['owner', 'admin']);
    }

    public function ssh(User $user, App $app): bool
    {
        if ($user->current_team_id !== $app->team_id) {
            return false;
        }

        return $user->hasTeamRole($app->team, ['owner', 'admin', 'member']);
    }
}
