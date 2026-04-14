<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'app_id',
        'logged_at',
        'method',
        'path',
        'status_code',
        'duration_ms',
        'ip',
        'user_agent',
        'response_size',
        'raw_json',
    ];

    protected function casts(): array
    {
        return [
            'logged_at' => 'datetime',
            'status_code' => 'integer',
            'duration_ms' => 'integer',
            'response_size' => 'integer',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }
}
