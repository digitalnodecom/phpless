<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('request_metrics', function (Blueprint $table) {
            $table->timestamp('stripe_reported_at')->nullable()->after('bytes_sent');
        });
    }

    public function down(): void
    {
        Schema::table('request_metrics', function (Blueprint $table) {
            $table->dropColumn('stripe_reported_at');
        });
    }
};
