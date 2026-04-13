<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StorageEndpoint extends Model
{
    protected $fillable = [
        'team_id',
        'name',
        'provider',
        'endpoint_url',
        'bucket',
        'region',
        'access_key_id',
        'secret_access_key',
        'path_prefix',
        'is_default',
    ];

    protected $hidden = [
        'secret_access_key',
    ];

    protected function casts(): array
    {
        return [
            'secret_access_key' => 'encrypted',
            'is_default' => 'boolean',
        ];
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function getMaskedSecretAttribute(): string
    {
        $raw = $this->secret_access_key;

        if (! $raw || strlen($raw) < 4) {
            return '****';
        }

        return '****' . substr($raw, -4);
    }

    public function toArray(): array
    {
        $array = parent::toArray();
        $array['masked_secret'] = $this->masked_secret;

        return $array;
    }
}
