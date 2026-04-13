<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class CliAuthController extends Controller
{
    /**
     * Show the CLI login page. Stores callback params in session.
     */
    public function create(Request $request): Response|RedirectResponse
    {
        $request->validate([
            'port' => ['required', 'integer', 'min:1024', 'max:65535'],
            'state' => ['required', 'string', 'min:16', 'max:128'],
        ]);

        $request->session()->put('cli_auth', [
            'port' => (int) $request->port,
            'state' => $request->state,
        ]);

        // If already logged in, skip to token generation
        if (Auth::check()) {
            return redirect()->route('auth.cli.callback');
        }

        return Inertia::render('auth/login', [
            'canResetPassword' => true,
            'status' => 'Please log in to authorize the PHPless CLI.',
            'cliAuth' => true,
        ]);
    }

    /**
     * After login, generate a Sanctum token and redirect to the CLI's local server.
     */
    public function callback(Request $request): RedirectResponse
    {
        $cliAuth = $request->session()->pull('cli_auth');

        if (! $cliAuth) {
            return redirect()->route('dashboard');
        }

        $user = $request->user();
        $token = $user->createToken('cli')->plainTextToken;

        $callbackUrl = sprintf(
            'http://127.0.0.1:%d/callback?token=%s&state=%s&email=%s&name=%s',
            $cliAuth['port'],
            urlencode($token),
            urlencode($cliAuth['state']),
            urlencode($user->email),
            urlencode($user->name),
        );

        return redirect()->away($callbackUrl);
    }
}
