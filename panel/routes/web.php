<?php

use App\Http\Controllers\AppController;
use App\Http\Controllers\DashboardController;
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
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
