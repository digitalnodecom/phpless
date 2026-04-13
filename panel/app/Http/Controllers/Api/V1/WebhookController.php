<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\GitDeployJob;
use App\Models\App;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    /**
     * Handle GitHub webhook
     *
     * Receives push events from GitHub and triggers a deployment.
     * The webhook signature is verified using the app's webhook secret.
     *
     * @unauthenticated
     */
    public function github(Request $request, App $app): JsonResponse
    {
        // Verify webhook signature
        $signature = $request->header('X-Hub-Signature-256');
        if (! $signature || ! $app->github_webhook_secret) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $expected = 'sha256=' . hash_hmac('sha256', $request->getContent(), $app->github_webhook_secret);
        if (! hash_equals($expected, $signature)) {
            return response()->json(['message' => 'Invalid signature.'], 403);
        }

        // Only process push events
        $event = $request->header('X-GitHub-Event');
        if ($event === 'ping') {
            return response()->json(['message' => 'Pong.']);
        }

        if ($event !== 'push') {
            return response()->json(['message' => 'Event ignored.'], 200);
        }

        $payload = $request->json();

        // Only deploy pushes to the configured branch
        $ref = $payload->get('ref', '');
        $branch = $app->github_branch ?? 'main';
        if ($ref !== "refs/heads/{$branch}") {
            return response()->json(['message' => 'Branch ignored.'], 200);
        }

        // Extract commit info
        $headCommit = $payload->get('head_commit', []);
        $commitSha = $headCommit['id'] ?? $payload->get('after');
        $commitMessage = $headCommit['message'] ?? null;
        $commitAuthor = $headCommit['author']['name'] ?? $headCommit['author']['username'] ?? null;

        GitDeployJob::dispatch($app, $commitSha, $commitMessage, $commitAuthor);

        return response()->json(['message' => 'Deploy queued.']);
    }
}
