# Deploy WordPress with SQLite on PHPless

PHPless runs WordPress without MySQL — SQLite is the database, powered by the official [sqlite-database-integration](https://wordpress.org/plugins/sqlite-database-integration/) plugin.

## Prerequisites

- A WordPress project (standard download or Composer-managed)
- PHPless CLI installed and authenticated (`phpless login`)

## Quick Start

```bash
# In your WordPress project directory
phpless init
phpless deploy
```

PHPless detects WordPress automatically (via `wp-config.php`) and configures SQLite for you.

## What PHPless Does Automatically

On every deploy of a WordPress app, PHPless:

1. **Installs the SQLite plugin** as a must-use plugin at `wp-content/mu-plugins/sqlite-database-integration/` (if not already present)
2. **Copies the `db.php` drop-in** to `wp-content/db.php` (the SQLite database bridge)
3. **Creates `wp-content/database/`** directory where the SQLite database lives
4. **Persists data directories** — `wp-content/database/` and `wp-content/uploads/` survive redeploys
5. **Registers the SQLite database** at `wp-content/database/.ht.sqlite` for backup management

## First-Time Setup

After your first deploy, visit your app URL to run the WordPress installation wizard. WordPress will use SQLite instead of MySQL — no database credentials needed.

## Security Salts

PHPless does **not** auto-generate WordPress security salts. Set these environment variables in the panel (Environment Variables tab) or via CLI:

- `AUTH_KEY`
- `SECURE_AUTH_KEY`
- `LOGGED_IN_KEY`
- `NONCE_KEY`
- `AUTH_SALT`
- `SECURE_AUTH_SALT`
- `LOGGED_IN_SALT`
- `NONCE_SALT`

Generate unique values at: https://api.wordpress.org/secret-key/1.1/salt/

Then reference them in `wp-config.php`:

```php
define('AUTH_KEY', getenv('AUTH_KEY'));
define('SECURE_AUTH_KEY', getenv('SECURE_AUTH_KEY'));
// ... etc
```

## Common Issues

### Uploads not persisting after redeploy

`wp-content/uploads/` is automatically added to persistent paths. If uploads disappear, check the Persistent Paths setting in your app's Settings tab.

### Permission errors on wp-content

The `wp-content/database/` and `wp-content/uploads/` directories need to be writable. PHPless sets correct permissions during deploy, but if you see errors, redeploy.

### Caching plugins

Most caching plugins work with SQLite. File-based caching plugins (WP Super Cache, W3 Total Cache) work out of the box. Avoid plugins that require Redis or Memcached unless you configure them separately.

### WP-CLI

WP-CLI works inside the VM. Use `phpless ssh <app>` to access it:

```bash
phpless ssh my-wordpress-app
wp core version
wp plugin list
```

## Composer-Managed WordPress

PHPless also detects WordPress installed via Composer (`johnpbloch/wordpress` or `roots/wordpress`). The build command is automatically set to `composer install --no-dev`.

For Bedrock-style projects, you may need to adjust the web root in Settings to `web/`.
