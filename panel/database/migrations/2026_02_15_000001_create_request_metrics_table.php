<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('request_metrics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_id')->constrained()->cascadeOnDelete();
            $table->timestamp('period');
            $table->unsignedInteger('requests');
            $table->float('avg_duration');
            $table->unsignedInteger('status_2xx')->default(0);
            $table->unsignedInteger('status_3xx')->default(0);
            $table->unsignedInteger('status_4xx')->default(0);
            $table->unsignedInteger('status_5xx')->default(0);
            $table->unsignedBigInteger('bytes_sent')->default(0);
            $table->unique(['app_id', 'period']);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_metrics');
    }
};
