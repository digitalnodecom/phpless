<?php

use App\Http\Controllers\ApiTokenController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\Settings\PasswordController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\TeamInvitationController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware('auth')->group(function () {
    Route::redirect('settings', 'settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/password', [PasswordController::class, 'edit'])->name('password.edit');
    Route::put('settings/password', [PasswordController::class, 'update'])->name('password.update');

    Route::get('settings/appearance', function () {
        return Inertia::render('settings/appearance');
    })->name('appearance');

    Route::get('settings/api-tokens', [ApiTokenController::class, 'index'])->name('api-tokens.index');
    Route::post('settings/api-tokens', [ApiTokenController::class, 'store'])->name('api-tokens.store');
    Route::delete('settings/api-tokens/{token}', [ApiTokenController::class, 'destroy'])->name('api-tokens.destroy');

    Route::get('settings/billing', [BillingController::class, 'index'])->name('settings.billing');
    Route::post('settings/billing/checkout', [BillingController::class, 'checkout'])->name('billing.checkout');
    Route::post('settings/billing/portal', [BillingController::class, 'portal'])->name('billing.portal');
    Route::get('settings/billing/usage', [BillingController::class, 'usage'])->name('billing.usage');

    Route::get('settings/team', [TeamController::class, 'edit'])->name('settings.team');
    Route::put('settings/team', [TeamController::class, 'update'])->name('settings.team.update');
    Route::delete('settings/team/members/{user}', [TeamController::class, 'removeMember'])->name('settings.team.remove');
    Route::post('settings/team/leave', [TeamController::class, 'leave'])->name('settings.team.leave');
    Route::post('settings/team/invitations', [TeamInvitationController::class, 'store'])->name('settings.team.invitations.store');
    Route::delete('settings/team/invitations/{invitation}', [TeamInvitationController::class, 'destroy'])->name('settings.team.invitations.destroy');
});
