<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->boolean('worker_mode')->default(false);
            $table->string('worker_script')->default('public/index.php');
            $table->unsignedInteger('worker_count')->default(2);
            $table->boolean('mercure_enabled')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->dropColumn(['worker_mode', 'worker_script', 'worker_count', 'mercure_enabled']);
        });
    }
};
