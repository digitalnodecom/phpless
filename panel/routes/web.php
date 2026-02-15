<?php

use App\Http\Controllers\AppController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EnvironmentVariableController;
use App\Http\Controllers\TeamEnvironmentVariableController;
use App\Http\Middleware\EnsureHasTeam;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth', EnsureHasTeam::class])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::resource('apps', AppController::class)->only([
        'index', 'create', 'store', 'show', 'destroy',
    ]);

    Route::get('apps/{app}/code', [AppController::class, 'code'])->name('apps.code');
    Route::put('apps/{app}/code', [AppController::class, 'updateCode'])->name('apps.code.update');
    Route::post('apps/{app}/deploy', [AppController::class, 'deploy'])->name('apps.deploy');
    Route::get('apps/{app}/analytics', [AppController::class, 'analytics'])->name('apps.analytics');
    Route::get('apps/{app}/logs', [AppController::class, 'logs'])->name('apps.logs');

    // App env vars
    Route::get('apps/{app}/env', [EnvironmentVariableController::class, 'index'])->name('apps.env.index');
    Route::post('apps/{app}/env', [EnvironmentVariableController::class, 'store'])->name('apps.env.store');
    Route::put('apps/{app}/env/{envVar}', [EnvironmentVariableController::class, 'update'])->name('apps.env.update');
    Route::delete('apps/{app}/env/{envVar}', [EnvironmentVariableController::class, 'destroy'])->name('apps.env.destroy');

    // Team env vars
    Route::get('team/env', [TeamEnvironmentVariableController::class, 'index'])->name('team.env.index');
    Route::post('team/env', [TeamEnvironmentVariableController::class, 'store'])->name('team.env.store');
    Route::put('team/env/{envVar}', [TeamEnvironmentVariableController::class, 'update'])->name('team.env.update');
    Route::delete('team/env/{envVar}', [TeamEnvironmentVariableController::class, 'destroy'])->name('team.env.destroy');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
