<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uptime_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_id')->constrained()->cascadeOnDelete();
            $table->integer('status_code');
            $table->integer('response_time_ms');
            $table->boolean('is_up');
            $table->timestamp('checked_at');
            $table->index(['app_id', 'checked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uptime_checks');
    }
};
