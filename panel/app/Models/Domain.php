<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Domain extends Model
{
    protected $fillable = [
        'app_id',
        'domain',
        'type',
        'dns_verified',
        'ssl_active',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'dns_verified' => 'boolean',
            'ssl_active' => 'boolean',
            'verified_at' => 'datetime',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }
}
