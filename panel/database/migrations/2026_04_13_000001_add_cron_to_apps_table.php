<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->boolean('cron_enabled')->default(false)->after('ip_allowlist');
            $table->json('cron_schedule')->nullable()->after('cron_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->dropColumn(['cron_enabled', 'cron_schedule']);
        });
    }
};
