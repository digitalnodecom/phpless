<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->boolean('health_check_enabled')->default(false);
            $table->string('health_check_path')->default('/');
            $table->integer('health_check_interval')->default(60);
            $table->string('alert_email')->nullable();
            $table->string('alert_webhook_url')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->dropColumn([
                'health_check_enabled',
                'health_check_path',
                'health_check_interval',
                'alert_email',
                'alert_webhook_url',
            ]);
        });
    }
};
