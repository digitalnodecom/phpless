<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('preview_environments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_id')->constrained()->cascadeOnDelete();
            $table->string('branch');
            $table->string('slug')->unique();
            $table->string('vm_id')->nullable();
            $table->string('vm_ip')->nullable();
            $table->string('vm_state')->default('pending');
            $table->string('commit_sha')->nullable();
            $table->text('commit_message')->nullable();
            $table->string('commit_author')->nullable();
            $table->timestamps();
            $table->timestamp('expires_at')->nullable();

            $table->index(['app_id', 'branch']);
        });

        Schema::table('apps', function (Blueprint $table) {
            $table->boolean('preview_enabled')->default(false)->after('cron_schedule');
            $table->unsignedInteger('preview_max')->default(3)->after('preview_enabled');
            $table->unsignedInteger('preview_ttl_hours')->default(72)->after('preview_max');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('preview_environments');

        Schema::table('apps', function (Blueprint $table) {
            $table->dropColumn(['preview_enabled', 'preview_max', 'preview_ttl_hours']);
        });
    }
};
