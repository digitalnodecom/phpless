# PHPless

A serverless PHP platform that runs each tenant's application inside its own [Firecracker](https://firecracker-microvm.github.io/) microVM with [FrankenPHP](https://frankenphp.dev/). VMs boot in ~1.2 seconds and are fully isolated at the hardware level.

```
                        ┌─────────────────────────────────────┐
                        │         MANAGEMENT PLANE            │
                        │   Laravel 12 + React + Inertia      │
                        │   https://phpless.digitalno.de      │
                        └──────────────┬──────────────────────┘
                                       │ Unix socket
                        ┌──────────────▼──────────────────────┐
                        │          CONTROL PLANE              │
                        │   Go daemon (phpless-manager)       │
                        │   /var/fc/manager.sock              │
                        └───┬──────────┬──────────┬───────────┘
                            │          │          │
                        ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
                        │  VM 1 │  │  VM 2 │  │  VM N │
                        │Frank- │  │Frank- │  │Frank- │
                        │enPHP  │  │enPHP  │  │enPHP  │
                        └───────┘  └───────┘  └───────┘
                             EXECUTION PLANE
```

## Prerequisites

- **Server**: Bare-metal with KVM support (tested on Hetzner AX41-NVMe)
- **OS**: Ubuntu 24.04
- **Local machine**: macOS or Linux with SSH access to the server
- **Go 1.23+** (local, for cross-compiling the manager)
- **Node.js 20+** and **npm** (local, for building frontend assets)
- **PHP 8.2+** and **Composer** (local, for panel development)

## Project Structure

```
phpless/
├── panel/                 # Laravel 12 management panel (React + Inertia + shadcn/ui)
├── phpless-manager/       # Go VM orchestration daemon
├── rootfs/                # Firecracker microVM base filesystem (init, Caddyfile, php.ini)
├── configs/               # Server config templates (systemd, Caddy, PHP-FPM)
├── scripts/               # Setup and deployment scripts
├── test-app/              # Sample PHP app for testing
├── Makefile               # Build and deploy targets
└── GUIDE.md               # Detailed implementation walkthrough
```

## Setup

### 1. Provision the Server

SSH into a fresh Ubuntu 24.04 bare-metal server and run:

```bash
# On your local machine
scp scripts/server-setup.sh root@<SERVER_IP>:/tmp/
ssh root@<SERVER_IP> 'bash /tmp/server-setup.sh'
```

This installs: Firecracker 1.10.1, Go 1.23.5, PHP 8.4, Caddy 2.10, and all system dependencies. It also enables KVM, configures UFW, and sets up IP forwarding.

### 2. Build the Root Filesystem

The rootfs is a minimal Debian bookworm image with FrankenPHP baked in:

```bash
# On the server
bash scripts/build-rootfs.sh
```

This creates:
- `/srv/firecracker/base/rootfs-base.ext4` (512 MB ext4 image)
- `/srv/firecracker/base/kernel/vmlinux.bin` (Linux 4.14.174)

> **Important**: The 4.14 kernel is required. Linux 5.10 kernels fail with `virtio_blk: probe of virtio0 failed` on Firecracker 1.10.1.

### 3. Build and Deploy the VM Manager

The Go daemon manages VM lifecycle, networking, and code deployment:

```bash
# From project root (local machine)
make deploy
```

Or manually:

```bash
cd phpless-manager
GOOS=linux GOARCH=amd64 go build -o bin/phpless-manager ./cmd/manager/
scp bin/phpless-manager root@<SERVER_IP>:/usr/local/bin/phpless-manager
```

Install the systemd service on the server:

```bash
# On the server
cp /var/www/phpless/configs/phpless-manager.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now phpless-manager
```

Verify it's running:

```bash
curl -sf --unix-socket /var/fc/manager.sock http://localhost/health
# {"status":"ok","total_vms":0,"running_vms":0}
```

### 4. Deploy the Laravel Panel

The panel is a Laravel 12 app with React/Inertia frontend:

```bash
# From project root (local machine)
bash scripts/deploy-panel.sh
```

This script:
1. Builds frontend assets locally (`npm run build`)
2. Installs server-side dependencies (PHP-FPM, Node, Composer)
3. Rsyncs panel files to the server
4. Runs `composer install`, `artisan migrate`, route/view caching
5. Deploys PHP-FPM pool, queue worker, and Caddy configs
6. Restarts all services

### 5. Create the First User

```bash
# On the server
cd /var/www/phpless/panel
php artisan tinker
```

```php
$user = \App\Models\User::create([
    'name' => 'Admin',
    'email' => 'admin@example.com',
    'password' => bcrypt('your-password'),
    'email_verified_at' => now(),
]);

$team = \App\Models\Team::create([
    'name' => 'Default',
    'slug' => 'default',
    'owner_id' => $user->id,
]);

$team->users()->attach($user->id, ['role' => 'owner']);
$user->update(['current_team_id' => $team->id]);
```

## Configuration

### Environment Variables

The panel uses a `.env` file. Copy the production template:

```bash
cp panel/.env.production panel/.env
php artisan key:generate
```

Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `PHPLESS_MANAGER_SOCKET` | Path to Go manager Unix socket | `/var/fc/manager.sock` |
| `PHPLESS_DOMAIN` | Base domain for app subdomains | `phpless.digitalno.de` |
| `PHPLESS_CADDYFILE_PATH` | Path to Caddy config file | `/etc/caddy/Caddyfile` |
| `PHPLESS_BUILDS_DIR` | Directory for app build artifacts | `/var/www/phpless/builds` |
| `PHPLESS_LOG_DIR` | Directory for per-app access logs | `/var/log/phpless/apps` |

### VM Manager Flags

The Go manager accepts these flags (see `configs/phpless-manager.service`):

| Flag | Description | Default |
|------|-------------|---------|
| `--socket` | Unix socket path | `/var/fc/manager.sock` |
| `--bridge` | Linux bridge name | `br-phpless` |
| `--bridge-cidr` | Bridge network CIDR | `10.0.0.1/16` |
| `--kernel` | Path to Linux kernel | (required) |
| `--base-ext4` | Path to base rootfs image | (required) |
| `--tenant-dir` | Per-tenant VM data directory | `/srv/firecracker/tenants` |
| `--socket-dir` | Firecracker socket directory | `/srv/firecracker/sockets` |

## Development

### Panel (Laravel + React)

```bash
cd panel

# Install dependencies
composer install
npm install

# Run dev servers
php artisan serve
npm run dev
```

The frontend uses React 19, TypeScript, Tailwind CSS 4, and shadcn/ui components.

### VM Manager (Go)

```bash
cd phpless-manager
go build ./cmd/manager/
go test ./...
```

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make build` | Cross-compile Go manager for Linux amd64 |
| `make deploy` | Build + rsync everything to server |
| `make panel-deploy` | Deploy panel only |
| `make setup` | Run server setup script |
| `make rootfs` | Build base rootfs on server |
| `make test-vm` | Boot a test VM |
| `make benchmark` | Run performance benchmarks |
| `make validate` | Run validation checklist |

## How It Works

1. **User creates an app** via the panel UI
2. **Panel calls the Go manager** over a Unix socket to create a Firecracker VM
3. **VM boots** with the base rootfs (Debian + FrankenPHP) in ~1.2 seconds
4. **User writes/deploys code** — the manager mounts the rootfs and rsyncs app files + `.env` into `/app/`
5. **Caddy** on the host routes `<slug>.phpless.digitalno.de` to the VM's internal IP
6. **Environment variables** are merged (team-level + app-level, app overrides) and injected as `/app/.env`

### Key Architecture Decisions

- **FrankenPHP** (not PHP-FPM) inside VMs — single static binary, no separate web server needed
- **Overlay filesystem** support for copy-on-write deployments (optional, per-VM)
- **SQLite** for the panel database — simple, no external DB server needed
- **Unix socket** for manager communication — no network exposure, no auth needed

## File Locations (Server)

| Component | Path |
|-----------|------|
| Kernel | `/srv/firecracker/base/kernel/vmlinux.bin` |
| Base rootfs | `/srv/firecracker/base/rootfs-base.ext4` |
| Rootfs contents | `/srv/firecracker/base/rootfs/` |
| VM Manager binary | `/usr/local/bin/phpless-manager` |
| Manager socket | `/var/fc/manager.sock` |
| Caddy config | `/etc/caddy/Caddyfile` |
| Panel | `/var/www/phpless/panel/` |
| Panel database | `/var/www/phpless/panel/database/database.sqlite` |
| PHP-FPM pool | `/etc/php/8.4/fpm/pool.d/phpless.conf` |
| App builds | `/var/www/phpless/builds/` |
| App access logs | `/var/log/phpless/apps/` |
| Tenant VM data | `/srv/firecracker/tenants/` |

## Known Gotchas

- **Entropy**: FrankenPHP (Go-based) blocks on `getrandom()` in the 4.14 kernel. The rootfs init script runs a custom `add_entropy` binary to seed the kernel RNG before starting FrankenPHP.
- **Init script**: Never use `set -e` (mount commands may fail if already mounted) or `2>/dev/null` before `/dev` is ready.
- **File uploads to VM**: Always use `scp` for the init script, never SSH heredocs (encoding issues cause `ENOEXEC`).
- **FrankenPHP Caddyfile**: The bare `frankenphp` directive (no braces) in the global block is required for `php_server` to work.

## License

Proprietary. All rights reserved.
