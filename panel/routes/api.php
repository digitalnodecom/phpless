<?php

use App\Http\Controllers\Api\V1\AppController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\EnvController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WebhookController;
use App\Http\Middleware\EnsureApiTeam;
use Illuminate\Support\Facades\Route;

// Public: exchange credentials for token
Route::post('v1/auth/token', [AuthController::class, 'token']);

// Public: GitHub webhook (verified by signature, not auth token)
Route::post('v1/webhooks/github/{app:slug}', [WebhookController::class, 'github']);

// Authenticated API routes
Route::middleware(['auth:sanctum', EnsureApiTeam::class])->prefix('v1')->group(function () {
    // User & Team — general reads
    Route::middleware('throttle:api-reads')->group(function () {
        Route::get('user', [UserController::class, 'show']);
        Route::get('team', [TeamController::class, 'show']);
        Route::get('team/env', [TeamController::class, 'envIndex']);

        // Apps — read endpoints
        Route::get('apps', [AppController::class, 'index']);
        Route::get('apps/{app:slug}', [AppController::class, 'show']);
        Route::get('apps/{app:slug}/download', [AppController::class, 'download']);
        Route::get('apps/{app:slug}/logs', [AppController::class, 'logs']);
        Route::get('apps/{app:slug}/files', [AppController::class, 'files']);
        Route::get('apps/{app:slug}/files/download', [AppController::class, 'filesDownload']);
        Route::get('apps/{app:slug}/env', [EnvController::class, 'index']);
    });

    // App creation — 5/hour
    Route::middleware('throttle:api-app-create')->group(function () {
        Route::post('apps', [AppController::class, 'store']);
    });

    // Deploy & rollback — 10/hour
    Route::middleware('throttle:api-deploy')->group(function () {
        Route::post('apps/{app:slug}/deploy', [AppController::class, 'deploy']);
        Route::post('apps/{app:slug}/rollback/{deployment}', [AppController::class, 'rollback']);
        Route::post('apps/{app:slug}/logs/stream', [AppController::class, 'logSession']);
    });

    // File upload/write — 30/hour
    Route::middleware('throttle:api-file-write')->group(function () {
        Route::post('apps/{app:slug}/files/upload', [AppController::class, 'filesUpload']);
        Route::post('apps/{app:slug}/files/write', [AppController::class, 'filesWrite']);
        Route::delete('apps/{app:slug}/files', [AppController::class, 'filesDelete']);
        Route::post('apps/{app:slug}/files/persistent', [AppController::class, 'setPersistent']);
    });

    // Env var mutations — 30/hour
    Route::middleware('throttle:api-env-mutate')->group(function () {
        Route::put('team/env', [TeamController::class, 'envSet']);
        Route::delete('team/env/{key}', [TeamController::class, 'envDestroy']);
        Route::put('apps/{app:slug}/env', [EnvController::class, 'set']);
        Route::delete('apps/{app:slug}/env/{key}', [EnvController::class, 'destroy']);
    });

    // App delete — general reads limiter (infrequent operation)
    Route::delete('apps/{app:slug}', [AppController::class, 'destroy']);

    // SSH proxy verification
    Route::post('ssh/verify', [AppController::class, 'sshVerify']);
});
