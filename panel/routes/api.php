<?php

use App\Http\Controllers\Api\V1\AppController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\EnvController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Middleware\EnsureApiTeam;
use Illuminate\Support\Facades\Route;

// Public: exchange credentials for token
Route::post('v1/auth/token', [AuthController::class, 'token']);

// Authenticated API routes
Route::middleware(['auth:sanctum', EnsureApiTeam::class])->prefix('v1')->group(function () {
    // User
    Route::get('user', [UserController::class, 'show']);

    // Team
    Route::get('team', [TeamController::class, 'show']);
    Route::get('team/env', [TeamController::class, 'envIndex']);
    Route::put('team/env', [TeamController::class, 'envSet']);
    Route::delete('team/env/{key}', [TeamController::class, 'envDestroy']);

    // Apps — {app:slug} resolves App by slug column (CLI-friendly)
    Route::get('apps', [AppController::class, 'index']);
    Route::post('apps', [AppController::class, 'store']);
    Route::get('apps/{app:slug}', [AppController::class, 'show']);
    Route::delete('apps/{app:slug}', [AppController::class, 'destroy']);

    // App deploy, download & logs
    Route::post('apps/{app:slug}/deploy', [AppController::class, 'deploy']);
    Route::get('apps/{app:slug}/download', [AppController::class, 'download']);
    Route::get('apps/{app:slug}/logs', [AppController::class, 'logs']);
    Route::get('apps/{app:slug}/files', [AppController::class, 'files']);

    // App env vars
    Route::get('apps/{app:slug}/env', [EnvController::class, 'index']);
    Route::put('apps/{app:slug}/env', [EnvController::class, 'set']);
    Route::delete('apps/{app:slug}/env/{key}', [EnvController::class, 'destroy']);
});
