<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UptimeCheck extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'app_id',
        'status_code',
        'response_time_ms',
        'is_up',
        'checked_at',
    ];

    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
            'response_time_ms' => 'integer',
            'is_up' => 'boolean',
            'checked_at' => 'datetime',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }
}
