<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreviewEnvironment extends Model
{
    protected $fillable = [
        'app_id',
        'branch',
        'slug',
        'vm_id',
        'vm_ip',
        'vm_state',
        'commit_sha',
        'commit_message',
        'commit_author',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }

    public function url(): string
    {
        $domain = config('phpless.domain');

        return "https://{$this->slug}.{$domain}";
    }

    public function isExpired(): bool
    {
        return $this->expires_at && $this->expires_at->isPast();
    }
}
