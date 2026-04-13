<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite can't alter column defaults directly — recreate via Laravel's Schema builder.
        // The change() call on SQLite uses a rebuild-table strategy automatically.
        Schema::table('apps', function (Blueprint $table) {
            $table->string('web_root')->default('/')->change();
        });
    }

    public function down(): void
    {
        Schema::table('apps', function (Blueprint $table) {
            $table->string('web_root')->default('public')->change();
        });
    }
};
