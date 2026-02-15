<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('environment_variables', function (Blueprint $table) {
            $table->foreignId('team_id')->nullable()->after('id')->constrained()->cascadeOnDelete();

            // Make app_id nullable (a row has either app_id OR team_id)
            $table->foreignId('app_id')->nullable()->change();

            $table->unique(['team_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::table('environment_variables', function (Blueprint $table) {
            $table->dropUnique(['team_id', 'key']);
            $table->dropConstrainedForeignId('team_id');
            $table->foreignId('app_id')->nullable(false)->change();
        });
    }
};
