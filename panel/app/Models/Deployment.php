<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\File;

class Deployment extends Model
{
    protected $appends = ['has_build'];

    protected $hidden = ['build_path'];

    protected $fillable = [
        'app_id',
        'triggered_by',
        'commit_sha',
        'commit_message',
        'commit_author',
        'branch',
        'status',
        'log',
        'build_output',
        'build_path',
        'rollback_of',
        'source',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(App::class);
    }

    public function triggeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }

    public function originalDeployment(): BelongsTo
    {
        return $this->belongsTo(self::class, 'rollback_of');
    }

    protected function hasBuild(): Attribute
    {
        return Attribute::get(fn () => $this->build_path && File::isDirectory($this->build_path));
    }
}
