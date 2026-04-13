<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Cashier\Billable;

class Team extends Model
{
    use Billable;
    protected $fillable = [
        'name',
        'slug',
        'owner_id',
        'plan',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('role')->withTimestamps();
    }

    public function apps(): HasMany
    {
        return $this->hasMany(App::class);
    }

    public function environmentVariables(): HasMany
    {
        return $this->hasMany(EnvironmentVariable::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(TeamInvitation::class);
    }

    public function planConfig(): array
    {
        return config('phpless.plans.' . $this->plan, config('phpless.plans.sandbox'));
    }

    public function appLimit(): int
    {
        return $this->planConfig()['app_limit'];
    }

    public function maxMemMib(): int
    {
        return $this->planConfig()['max_mem_mib'];
    }

    public function maxVcpus(): int
    {
        return $this->planConfig()['max_vcpus'];
    }

    public function allowsCustomDomains(): bool
    {
        return $this->planConfig()['custom_domains'] ?? false;
    }

    public function isSandbox(): bool
    {
        return $this->plan === 'sandbox';
    }
}
