<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Update existing teams with 'hobby' plan to 'sandbox'
        DB::table('teams')->where('plan', 'hobby')->update(['plan' => 'sandbox']);
    }

    public function down(): void
    {
        DB::table('teams')->where('plan', 'sandbox')->update(['plan' => 'hobby']);
    }
};
