<?php

namespace App\Http\Controllers;

use App\Models\App;
use App\Services\VMManagerClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class TerminalController extends Controller
{
    public function store(App $app, VMManagerClient $vmManager): JsonResponse
    {
        Gate::authorize('ssh', $app);

        if (!$app->vm_ip || $app->vm_state !== 'running') {
            return response()->json(['message' => 'App is not running.'], 422);
        }

        $sessionId = $vmManager->createTerminalSession($app->vm_ip);

        return response()->json(['session_id' => $sessionId]);
    }
}
