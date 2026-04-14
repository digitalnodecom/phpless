<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_id')->constrained()->cascadeOnDelete();
            $table->timestamp('logged_at');
            $table->string('method', 10);
            $table->string('path', 2048);
            $table->smallInteger('status_code')->unsigned();
            $table->integer('duration_ms')->unsigned();
            $table->string('ip', 45);
            $table->string('user_agent', 500)->default('');
            $table->integer('response_size')->unsigned()->default(0);
            $table->text('raw_json')->nullable();

            $table->index(['app_id', 'logged_at']);
            $table->index(['app_id', 'status_code']);
        });

        Schema::table('apps', function (Blueprint $table) {
            $table->timestamp('last_log_ingested_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_logs');

        Schema::table('apps', function (Blueprint $table) {
            $table->dropColumn('last_log_ingested_at');
        });
    }
};
