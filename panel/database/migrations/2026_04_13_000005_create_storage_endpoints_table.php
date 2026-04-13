<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('storage_endpoints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('provider');
            $table->string('endpoint_url')->nullable();
            $table->string('bucket');
            $table->string('region')->default('us-east-1');
            $table->string('access_key_id');
            $table->text('secret_access_key');
            $table->string('path_prefix')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('storage_endpoints');
    }
};
