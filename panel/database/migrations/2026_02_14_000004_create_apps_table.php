<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('apps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('vm_id')->nullable();
            $table->string('vm_ip')->nullable();
            $table->string('vm_state')->default('stopped');
            $table->unsignedTinyInteger('vcpus')->default(1);
            $table->unsignedInteger('mem_mib')->default(256);
            $table->string('php_version')->default('8.4');
            $table->string('github_repo')->nullable();
            $table->string('github_branch')->default('main');
            $table->string('github_webhook_secret')->nullable();
            $table->string('build_command')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('apps');
    }
};
