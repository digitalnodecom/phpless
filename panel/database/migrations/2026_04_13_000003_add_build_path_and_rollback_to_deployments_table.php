<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deployments', function (Blueprint $table) {
            $table->string('build_path')->nullable()->after('build_output');
            $table->foreignId('rollback_of')->nullable()->after('build_path')->constrained('deployments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deployments', function (Blueprint $table) {
            $table->dropForeign(['rollback_of']);
            $table->dropColumn(['build_path', 'rollback_of']);
        });
    }
};
