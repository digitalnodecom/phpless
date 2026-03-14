<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RequestMetric extends Model
{
    protected $fillable = [
        'app_id',
        'period',
        'requests',
        'avg_duration',
        'status_2xx',
        'status_3xx',
        'status_4xx',
        'status_5xx',
        'bytes_sent',
        'stripe_reported_at',
    ];

    protected function casts(): array
    {
        return [
            'period' => 'datetime',
            'requests' => 'integer',
            'avg_duration' => 'float',
            'status_2xx' => 'integer',
            'status_3xx' => 'integer',
            'status_4xx' => 'integer',
            'status_5xx' => 'integer',
            'bytes_sent' => 'integer',
            'stripe_reported_at' => 'datetime',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }
}
