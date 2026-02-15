<?php

namespace App\Providers;

use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(VMManagerClient::class);
        $this->app->singleton(CaddyConfigManager::class);
        $this->app->singleton(AppLifecycleService::class);
    }

    public function boot(): void
    {
        //
    }
}
