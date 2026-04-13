# Deploying Laravel on PHPless

This guide walks through deploying a Laravel application on PHPless.

## Prerequisites

- A Laravel app (10.x, 11.x, or 12.x)
- [PHPless CLI](../cli/README.md) installed and authenticated (`phpless login`)
- Your app must use **SQLite** for the database (PHPless VMs include SQLite; no external database servers are available yet)

## Step 1: Create an App

```bash
phpless apps create "My Laravel App" --mem 512
```

A Laravel app with Composer dependencies typically needs at least 256 MiB of memory. Use 512 MiB if you have many packages or run queues.

## Step 2: Link Your Project

From your Laravel project root:

```bash
phpless init
```

This creates a `.phpless.toml` file linking your project directory to the app.

## Step 3: Set Environment Variables

Laravel requires at least `APP_KEY` and `APP_ENV`:

```bash
phpless env set --app my-laravel-app \
  APP_KEY=base64:$(php artisan key:generate --show | tr -d '\n') \
  APP_ENV=production \
  APP_DEBUG=false
```

Other commonly needed variables:

```bash
phpless env set --app my-laravel-app \
  LOG_CHANNEL=stderr \
  SESSION_DRIVER=file \
  CACHE_STORE=file \
  DB_CONNECTION=sqlite
```

> **Note:** Env vars are injected as a `.env` file on each deploy. Changing variables does not trigger a redeploy — you need to run `phpless deploy` afterward.

## Step 4: Configure for SQLite

Make sure your `config/database.php` uses SQLite:

```php
'default' => env('DB_CONNECTION', 'sqlite'),
```

And your `.env` (or PHPless env vars) includes:

```
DB_CONNECTION=sqlite
DB_DATABASE=/app/storage/database.sqlite
```

The `/app/storage/` directory is persistent across deploys inside the VM.

## Step 5: Prepare Your `.phplessignore`

Make sure your `.phplessignore` excludes unnecessary files:

```
.git
.env
node_modules
tests
.phpless.toml
storage/logs/*
storage/framework/cache/*
storage/framework/sessions/*
storage/framework/views/*
```

Keep `vendor/` in the deploy — PHPless VMs don't run `composer install`.

## Step 6: Build Frontend Assets

If you use Vite:

```bash
npm run build
```

Make sure the `public/build/` directory is included in the deploy.

## Step 7: Deploy

```bash
phpless deploy
```

The CLI creates a tarball of your project, uploads it, and the platform:

1. Extracts the code into the VM's build directory
2. Merges environment variables (team + app) into a `.env` file
3. Syncs the build directory to the Firecracker VM filesystem
4. Restarts the VM with the new code
5. Regenerates Caddy routing config

## Step 8: Run Migrations

SSH into the VM and run migrations:

```bash
phpless ssh --app my-laravel-app
# Inside the VM:
php artisan migrate --force
```

Or use the CLI to run a one-off command (if using MCP with Claude):

```
ssh_exec: php artisan migrate --force
```

## Step 9: Verify

Check that your app is running:

```bash
phpless info --app my-laravel-app
phpless logs --app my-laravel-app
```

Visit `https://my-laravel-app.phpless.app` in your browser.

## Common Issues

### "Class not found" or autoload errors

Make sure `vendor/` is included in your deploy. PHPless does not run `composer install` — your deployed tarball must include all dependencies.

### 500 errors with no output

Check that `APP_KEY` is set:

```bash
phpless env list --app my-laravel-app
```

If missing, generate and set it:

```bash
phpless env set --app my-laravel-app APP_KEY=base64:$(php artisan key:generate --show | tr -d '\n')
```

### SQLite "unable to open database file"

The database file must be in `/app/storage/` (the persistent volume). Set `DB_DATABASE=/app/storage/database.sqlite` in your env vars, then SSH in and create it:

```bash
phpless ssh --app my-laravel-app
touch /app/storage/database.sqlite
php artisan migrate --force
```

### Storage permissions

Laravel expects `storage/` and `bootstrap/cache/` to be writable. These directories are writable by default inside the VM.

### Session / cache not persisting across deploys

Use file-based sessions and cache with paths under `/app/storage/`:

```bash
phpless env set --app my-laravel-app \
  SESSION_DRIVER=file \
  CACHE_STORE=file
```

The `/app/storage/` directory persists across deploys. The rest of `/app/` is replaced on each deploy.
