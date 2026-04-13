<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->foreignId('storage_endpoint_id')->nullable()->after('cron_schedule')
                ->constrained('storage_endpoints')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->dropConstrainedForeignId('storage_endpoint_id');
        });
    }
};
