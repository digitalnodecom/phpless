<?php

namespace App\Providers;

use App\Services\AppLifecycleService;
use App\Services\CaddyConfigManager;
use App\Services\VMManagerClient;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
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

        $this->configureRateLimiting();
    }

    protected function configureRateLimiting(): void
    {
        // General API reads: 60/min per user
        RateLimiter::for('api-reads', function (Request $request) {
            $key = $request->user()?->currentAccessToken()?->id ?? $request->user()?->id ?? $request->ip();

            return Limit::perMinute(60)->by('api-reads:' . $key)
                ->response(function () {
                    return response()->json(['message' => 'Too many requests. Please slow down.'], 429);
                });
        });

        // App creation: 5/hour per user
        RateLimiter::for('api-app-create', function (Request $request) {
            $key = $request->user()?->currentAccessToken()?->id ?? $request->user()?->id ?? $request->ip();

            return Limit::perHour(5)->by('api-app-create:' . $key)
                ->response(function () {
                    return response()->json(['message' => 'App creation limit reached. Try again later.'], 429);
                });
        });

        // Deploy: 10/hour per user
        RateLimiter::for('api-deploy', function (Request $request) {
            $key = $request->user()?->currentAccessToken()?->id ?? $request->user()?->id ?? $request->ip();

            return Limit::perHour(10)->by('api-deploy:' . $key)
                ->response(function () {
                    return response()->json(['message' => 'Deploy limit reached. Try again later.'], 429);
                });
        });

        // File upload/write: 30/hour per user
        RateLimiter::for('api-file-write', function (Request $request) {
            $key = $request->user()?->currentAccessToken()?->id ?? $request->user()?->id ?? $request->ip();

            return Limit::perHour(30)->by('api-file-write:' . $key)
                ->response(function () {
                    return response()->json(['message' => 'File write limit reached. Try again later.'], 429);
                });
        });

        // Env var mutations: 30/hour per user
        RateLimiter::for('api-env-mutate', function (Request $request) {
            $key = $request->user()?->currentAccessToken()?->id ?? $request->user()?->id ?? $request->ip();

            return Limit::perHour(30)->by('api-env-mutate:' . $key)
                ->response(function () {
                    return response()->json(['message' => 'Environment variable update limit reached. Try again later.'], 429);
                });
        });
    }
}
