<?php

use App\Http\Controllers\Admin\AdminController;
use App\Http\Controllers\AppController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DomainController;
use App\Http\Controllers\EnvironmentVariableController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\TeamEnvironmentVariableController;
use App\Http\Controllers\TeamInvitationController;
use App\Http\Controllers\TerminalController;
use App\Http\Middleware\EnsureHasTeam;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::get('/llms.txt', function () {
    $content = <<<'TXT'
# PHPless

> Serverless PHP hosting powered by Firecracker microVMs. Each app runs in an
> isolated VM with ~1.2s cold start. Deploy via CLI, REST API, or web panel.

Base URL:  https://phpless.digitalno.de
API base:  https://phpless.digitalno.de/api/v1
Web panel: https://phpless.digitalno.de


## Quick Start (CLI)

Install the CLI:

  # macOS (Homebrew) — recommended
  brew tap digitalnodecom/tap
  brew install phpless

  # Linux (direct binary download)
  curl -sSfL https://github.com/digitalnodecom/phpless/releases/latest/download/phpless-linux-amd64 \
    -o /usr/local/bin/phpless && chmod +x /usr/local/bin/phpless

  # Build from source (requires Go 1.23+)
  git clone https://github.com/digitalnodecom/phpless
  cd phpless/cli && make install

Authenticate and deploy:

  phpless login             # prompts for email & password, saves token locally
  cd my-php-project
  phpless apps create "My App"   # create the app on the platform
  phpless init              # prompts for app slug, creates .phpless.toml
  phpless deploy            # packages current directory and uploads


## CLI Commands

  phpless login                       Authenticate (email + password). Saves token
                                      to ~/.config/phpless/config.toml.
  phpless whoami                      Show current authenticated user and team.

  phpless apps list                   List all apps.
  phpless apps create NAME            Create a new app.
    --slug SLUG                         Custom slug (default: derived from name).
    --vcpus N                           vCPUs: 1 or 2 (default 1).
    --mem N                             Memory MiB: 128, 256, 512, 1024 (default 128).
  phpless apps info SLUG              Show detailed app info, deployments, domains.
  phpless apps delete SLUG            Delete an app permanently (prompts to confirm).

  phpless init                        Create .phpless.toml in current directory.
                                      Prompts for app slug.
  phpless deploy [DIR]                Package DIR (default: .) and deploy.
                                      Reads app slug from .phpless.toml or --app flag.
  phpless pull [DIR]                  Download deployed code into DIR.

  phpless logs [--app SLUG]           Show last 100 request log entries.
  phpless files [--app SLUG]          List files in the deployed build.

  phpless env list [--app SLUG]       List env vars for an app.
  phpless env list --team             List team-wide env vars.
  phpless env set KEY=VAL...          Set env vars on an app (--app SLUG or .phpless.toml).
  phpless env set KEY=VAL... --team   Set team-wide env vars.
  phpless env unset KEY               Delete an env var from an app.
  phpless env unset KEY --team        Delete a team-wide env var.

  phpless mcp                         Start an MCP (Model Context Protocol) server
                                      over stdio for use with AI assistants.

  Global flags:
    --json       Output in JSON format (all commands).
    --app SLUG   Override app slug (deploy, logs, files, env commands).
    --api-url    Override API base URL.

  .phpless.toml format (place in project root, created by `phpless init`):
    app       = "my-app-slug"
    directory = "."            # subdirectory to deploy (optional)


## REST API

All authenticated endpoints require:
  Authorization: Bearer <token>
  Content-Type: application/json   (except file uploads)

### Authentication

  POST /api/v1/auth/token
  Body: {"email": "user@example.com", "password": "secret"}
  Response: {"token": "..."}

### User & Team

  GET /api/v1/user              Current user info.
  GET /api/v1/team              Current team info.

### Apps

  GET    /api/v1/apps               List apps.
  POST   /api/v1/apps               Create app.
    Body: {
      "name": "My App",             required
      "slug": "my-app",             optional (auto-derived from name)
      "vcpus": 1,                   optional: 1 or 2 (default 1)
      "mem_mib": 128                optional: 128, 256, 512, 1024 (default 128)
    }
  GET    /api/v1/apps/{slug}        Get app detail (includes deployments, domains).
  DELETE /api/v1/apps/{slug}        Delete app.

### Deploy

  POST /api/v1/apps/{slug}/deploy
    Content-Type: multipart/form-data
    Field: tarball  (file, .tar.gz, max 50 MB)
    Response: {"message": "Deployed successfully.", "app": {...}}

  GET  /api/v1/apps/{slug}/download   Download current code as .tar.gz.
  GET  /api/v1/apps/{slug}/logs       Last 100 request log lines.
  GET  /api/v1/apps/{slug}/files      List deployed files with sizes.

### Environment Variables

  App-scoped (injected only into this app's VM):
    GET    /api/v1/apps/{slug}/env          List.
    PUT    /api/v1/apps/{slug}/env          Set/update. Body: {"KEY": "VALUE", ...}
    DELETE /api/v1/apps/{slug}/env/{KEY}    Delete one key.

  Team-scoped (shared across all apps in the team):
    GET    /api/v1/team/env          List.
    PUT    /api/v1/team/env          Set/update. Body: {"KEY": "VALUE", ...}
    DELETE /api/v1/team/env/{KEY}    Delete one key.

  App env vars override team env vars with the same key.


## App Object Shape

  {
    "slug":       "my-app",
    "name":       "My App",
    "url":        "https://my-app.phpless.app",
    "vm_state":   "running",    // running | stopped | error
    "vcpus":      1,
    "mem_mib":    128,
    "created_at": "2026-01-01T00:00:00.000000Z",
    "updated_at": "2026-01-01T00:00:00.000000Z"
  }

  Detailed view (GET /apps/{slug}) also includes:
    "vm_id", "vm_ip", "php_version", "github_repo",
    "github_branch", "deployments", "domains"


## Full Deploy Workflow (curl)

  # 1. Obtain token
  TOKEN=$(curl -s -X POST https://phpless.digitalno.de/api/v1/auth/token \
    -H "Content-Type: application/json" \
    -d '{"email":"you@example.com","password":"yourpassword"}' | jq -r .token)

  # 2. Create app (skip if already exists)
  curl -s -X POST https://phpless.digitalno.de/api/v1/apps \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"my-app"}' | jq .

  # 3. Package project
  tar -czf /tmp/app.tar.gz -C ./my-php-project .

  # 4. Deploy
  curl -X POST https://phpless.digitalno.de/api/v1/apps/my-app/deploy \
    -H "Authorization: Bearer $TOKEN" \
    -F "tarball=@/tmp/app.tar.gz" | jq .

  # 5. Check status
  curl -s https://phpless.digitalno.de/api/v1/apps/my-app \
    -H "Authorization: Bearer $TOKEN" | jq .app.vm_state


## MCP Server (for AI coding assistants)

PHPless CLI ships a built-in MCP server that exposes all platform operations
as tools callable by AI assistants (Claude, Cursor, Windsurf, etc.).

Start it:
  phpless mcp

Configure in your MCP client (e.g. ~/.claude/mcp.json):
  {
    "mcpServers": {
      "phpless": {
        "command": "phpless",
        "args": ["mcp"]
      }
    }
  }

Available MCP tools:
  whoami, list_apps, get_app, create_app, delete_app,
  deploy (slug + directory), pull_app,
  get_logs, list_files,
  list_env (scope: app|team), set_env (scope: app|team), delete_env (scope: app|team)

Available MCP resources:
  phpless://docs/overview, phpless://docs/quickstart, phpless://project-config

Available MCP prompts:
  deploy-app (slug, directory), setup-project (name, directory)


## Platform Details

- PHP version: 8.4 (FrankenPHP static binary)
- VM isolation: Firecracker microVMs (hardware virtualisation)
- Cold start: ~1.2 seconds
- Default URL: https://{slug}.phpless.app
- Custom domains: add via web panel, DNS CNAME to {slug}.phpless.app
- Max upload: 50 MB per deployment tarball
- VM sizes: 1–2 vCPUs, 128 / 256 / 512 / 1024 MiB RAM


## Notes for AI Assistants

- The CLI is the easiest integration path. Use `phpless mcp` for native tool use.
- All CLI commands accept --json for structured output.
- Slugs are URL-safe identifiers derived from app names (e.g. "My App" → "my-app").
- Environment variables are encrypted at rest and injected as standard $_ENV / getenv().
- The deploy endpoint accepts any PHP project; no special framework required.
- Laravel, Symfony, Slim, plain PHP — all work out of the box.
TXT;

    return response($content, 200, ['Content-Type' => 'text/plain; charset=utf-8']);
})->name('llms.txt');

Route::get('/docs', function () {
    return Inertia::render('docs');
})->name('docs');

// Invitations — show is public (guests see login prompt), accept requires auth
Route::get('/invitations/{token}', [TeamInvitationController::class, 'show'])->name('invitations.show');
Route::middleware('auth')->post('/invitations/{token}/accept', [TeamInvitationController::class, 'accept'])->name('invitations.accept');

Route::middleware(['auth', EnsureHasTeam::class])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::resource('apps', AppController::class)->only([
        'index', 'create', 'store', 'show', 'destroy',
    ]);

    Route::post('apps/{app}/deploy', [AppController::class, 'deploy'])->name('apps.deploy');
    Route::get('apps/{app}/files', [AppController::class, 'files'])->name('apps.files');
    Route::post('apps/{app}/files/upload', [AppController::class, 'filesUpload'])->name('apps.files.upload');
    Route::post('apps/{app}/files/write', [AppController::class, 'filesWrite'])->name('apps.files.write');
    Route::delete('apps/{app}/files', [AppController::class, 'filesDelete'])->name('apps.files.delete');
    Route::get('apps/{app}/files/download', [AppController::class, 'filesDownload'])->name('apps.files.download');
    Route::post('apps/{app}/files/persistent', [AppController::class, 'setPersistent'])->name('apps.files.persistent');
    Route::put('apps/{app}/rename', [AppController::class, 'rename'])->name('apps.rename');
    Route::put('apps/{app}/settings', [AppController::class, 'updateSettings'])->name('apps.settings.update');
    Route::put('apps/{app}/port-mappings', [AppController::class, 'updatePortMappings'])->name('apps.port-mappings.update');
    Route::put('apps/{app}/workers', [AppController::class, 'updateWorkers'])->name('apps.workers.update');
    Route::get('apps/{app}/workers/status', [AppController::class, 'workerStatus'])->name('apps.workers.status');
    Route::get('apps/{app}/workers/logs', [AppController::class, 'workerLogs'])->name('apps.workers.logs');
    Route::post('apps/{app}/generate-mercure-keys', [AppController::class, 'generateMercureKeys'])->name('apps.generate-mercure-keys');
    Route::post('apps/{app}/terminal-session', [TerminalController::class, 'store'])->name('apps.terminal-session');
    Route::get('apps/{app}/analytics', [AppController::class, 'analytics'])->name('apps.analytics');
    Route::get('apps/{app}/logs', [AppController::class, 'logs'])->name('apps.logs');

    // Custom domains
    Route::get('apps/{app}/domains', [DomainController::class, 'index'])->name('apps.domains.index');
    Route::post('apps/{app}/domains', [DomainController::class, 'store'])->name('apps.domains.store');
    Route::post('apps/{app}/domains/{domain}/verify', [DomainController::class, 'verify'])->name('apps.domains.verify');
    Route::delete('apps/{app}/domains/{domain}', [DomainController::class, 'destroy'])->name('apps.domains.destroy');

    // App env vars
    Route::get('apps/{app}/env', [EnvironmentVariableController::class, 'index'])->name('apps.env.index');
    Route::post('apps/{app}/env', [EnvironmentVariableController::class, 'store'])->name('apps.env.store');
    Route::put('apps/{app}/env/{envVar}', [EnvironmentVariableController::class, 'update'])->name('apps.env.update');
    Route::delete('apps/{app}/env/{envVar}', [EnvironmentVariableController::class, 'destroy'])->name('apps.env.destroy');

    // Team switching
    Route::post('teams/{team}/switch', [TeamController::class, 'switchTeam'])->name('teams.switch');

    // Team settings
    Route::get('settings/team/env', [TeamEnvironmentVariableController::class, 'index'])->name('team.env.index');
    Route::post('settings/team/env', [TeamEnvironmentVariableController::class, 'store'])->name('team.env.store');
    Route::put('settings/team/env/{envVar}', [TeamEnvironmentVariableController::class, 'update'])->name('team.env.update');
    Route::delete('settings/team/env/{envVar}', [TeamEnvironmentVariableController::class, 'destroy'])->name('team.env.destroy');
});

// Stripe webhook (no auth middleware)
Route::post('/stripe/webhook', '\Laravel\Cashier\Http\Controllers\WebhookController@handleWebhook');

// Admin panel
Route::middleware(['auth', 'admin'])->prefix('admin')->group(function () {
    Route::get('/', [AdminController::class, 'index'])->name('admin.index');
    Route::get('/teams/{team}', [AdminController::class, 'showTeam'])->name('admin.teams.show');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
