<?php

namespace App\Providers;

use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
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
        Scramble::configure()
            ->withDocumentTransformers(function (OpenApi $openApi) {
                $openApi->secure(SecurityScheme::http('bearer', 'bearer'));
            });
    }
}
