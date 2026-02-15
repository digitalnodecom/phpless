<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class CreateApiToken extends Command
{
    protected $signature = 'api:token {email} {name?}';

    protected $description = 'Create a personal access token for a user';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();

        if (! $user) {
            $this->error("User not found: {$this->argument('email')}");

            return self::FAILURE;
        }

        $name = $this->argument('name') ?? 'cli';
        $token = $user->createToken($name);

        $this->line($token->plainTextToken);

        return self::SUCCESS;
    }
}
