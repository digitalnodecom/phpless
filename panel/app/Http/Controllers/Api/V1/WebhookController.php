<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\GitDeployJob;
use App\Jobs\PreviewDeployJob;
use App\Jobs\SendDownAlertJob;
use App\Jobs\SendUpAlertJob;
use App\Models\App;
use App\Models\UptimeCheck;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

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

        // Extract branch from ref
        $ref = $payload->get('ref', '');
        if (! str_starts_with($ref, 'refs/heads/')) {
            return response()->json(['message' => 'Not a branch push.'], 200);
        }
        $pushBranch = substr($ref, strlen('refs/heads/'));
        $configuredBranch = $app->github_branch ?? 'main';

        // Extract commit info
        $headCommit = $payload->get('head_commit', []);
        $commitSha = $headCommit['id'] ?? $payload->get('after');
        $commitMessage = $headCommit['message'] ?? null;
        $commitAuthor = $headCommit['author']['name'] ?? $headCommit['author']['username'] ?? null;

        // Main branch → standard deploy
        if ($pushBranch === $configuredBranch) {
            GitDeployJob::dispatch($app, $commitSha, $commitMessage, $commitAuthor);

            return response()->json(['message' => 'Deploy queued.']);
        }

        // Non-default branch → preview environment
        if (! $app->preview_enabled) {
            return response()->json(['message' => 'Branch ignored.'], 200);
        }

        return $this->handlePreviewDeploy($app, $pushBranch, $commitSha, $commitMessage, $commitAuthor);
    }

    /**
     * Handle health check webhook
     *
     * Receives health state change notifications from the VM manager.
     * Authenticated via X-Manager-Secret header.
     *
     * @unauthenticated
     */
    public function health(Request $request): JsonResponse
    {
        // Verify manager secret
        $secret = config('phpless.manager_secret');
        if ($secret && $request->header('X-Manager-Secret') !== $secret) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $validated = $request->validate([
            'slug' => ['required', 'string'],
            'is_up' => ['required', 'boolean'],
            'status_code' => ['required', 'integer'],
            'response_time_ms' => ['required', 'integer'],
        ]);

        $app = App::where('slug', $validated['slug'])->first();
        if (! $app) {
            return response()->json(['message' => 'App not found.'], 404);
        }

        $check = UptimeCheck::create([
            'app_id' => $app->id,
            'status_code' => $validated['status_code'],
            'response_time_ms' => $validated['response_time_ms'],
            'is_up' => $validated['is_up'],
            'checked_at' => now(),
        ]);

        $checkedAt = now()->toDateTimeString();

        if (! $validated['is_up']) {
            SendDownAlertJob::dispatch($app, $validated['status_code'], $checkedAt);
        } else {
            SendUpAlertJob::dispatch($app, $validated['status_code'], $checkedAt);
        }

        return response()->json(['message' => 'Recorded.']);
    }

    private function handlePreviewDeploy(
        App $app,
        string $branch,
        ?string $commitSha,
        ?string $commitMessage,
        ?string $commitAuthor,
    ): JsonResponse {
        // Check if a preview for this branch already exists
        $existing = $app->previewEnvironments()->where('branch', $branch)->first();

        if ($existing) {
            // Redeploy to existing preview
            PreviewDeployJob::dispatch($app, $existing, $commitSha, $commitMessage, $commitAuthor);

            return response()->json(['message' => 'Preview redeploy queued.', 'preview_slug' => $existing->slug]);
        }

        // Check preview limit
        $currentCount = $app->previewEnvironments()->count();
        $max = $app->preview_max ?? 3;
        if ($currentCount >= $max) {
            return response()->json([
                'message' => "Preview limit reached ({$max}). Delete an existing preview to create a new one.",
            ], 429);
        }

        // Generate preview slug: {app_slug}--{sanitized_branch}
        $sanitizedBranch = Str::slug($branch);
        $slug = Str::limit("{$app->slug}--{$sanitizedBranch}", 63, '');

        // Ensure uniqueness
        $baseSlug = $slug;
        $counter = 1;
        while (\App\Models\PreviewEnvironment::where('slug', $slug)->exists()) {
            $slug = Str::limit("{$baseSlug}-{$counter}", 63, '');
            $counter++;
        }

        $preview = $app->previewEnvironments()->create([
            'branch' => $branch,
            'slug' => $slug,
            'vm_state' => 'pending',
            'commit_sha' => $commitSha,
            'commit_message' => $commitMessage,
            'commit_author' => $commitAuthor,
        ]);

        PreviewDeployJob::dispatch($app, $preview, $commitSha, $commitMessage, $commitAuthor);

        return response()->json([
            'message' => 'Preview deploy queued.',
            'preview_slug' => $preview->slug,
            'preview_url' => $preview->url(),
        ], 201);
    }
}
