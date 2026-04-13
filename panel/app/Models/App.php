<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class App extends Model
{
    protected $fillable = [
        'team_id',
        'name',
        'slug',
        'vcpus',
        'mem_mib',
        'php_version',
        'github_repo',
        'github_branch',
        'build_command',
        'worker_mode',
        'worker_script',
        'worker_count',
        'mercure_enabled',
        'web_root',
        'detected_framework',
        'persistent_paths',
        'workers',
        'port_mappings',
        'ip_allowlist',
        'cron_enabled',
        'cron_schedule',
    ];

    protected function casts(): array
    {
        return [
            'vcpus' => 'integer',
            'mem_mib' => 'integer',
            'worker_mode' => 'boolean',
            'worker_count' => 'integer',
            'mercure_enabled' => 'boolean',
            'persistent_paths' => 'array',
            'workers' => 'array',
            'port_mappings' => 'array',
            'ip_allowlist' => 'array',
            'cron_enabled' => 'boolean',
            'cron_schedule' => 'array',
        ];
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function deployments(): HasMany
    {
        return $this->hasMany(Deployment::class);
    }

    public function domains(): HasMany
    {
        return $this->hasMany(Domain::class);
    }

    public function environmentVariables(): HasMany
    {
        return $this->hasMany(EnvironmentVariable::class);
    }

    public function requestMetrics(): HasMany
    {
        return $this->hasMany(RequestMetric::class);
    }

    public function url(): string
    {
        $domain = config('phpless.domain');

        return "https://{$this->slug}.{$domain}";
    }
}
