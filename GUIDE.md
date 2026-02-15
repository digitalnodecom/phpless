# PHPless: Building a Serverless PHP Platform from Scratch

A comprehensive guide to building PHPless — a serverless PHP hosting platform using Firecracker microVMs, FrankenPHP, and a Laravel management panel — on a bare Hetzner dedicated server.

---

## Table of Contents

1. [Introduction & Architecture Overview](#1-introduction--architecture-overview)
2. [Server Setup](#2-server-setup)
3. [Building the Root Filesystem](#3-building-the-root-filesystem)
4. [Go VM Manager](#4-go-vm-manager)
5. [Laravel Management Panel](#5-laravel-management-panel)
6. [Deploying the Panel](#6-deploying-the-panel)
7. [How It All Connects](#7-how-it-all-connects)
8. [Key Gotchas & Lessons Learned](#8-key-gotchas--lessons-learned)
9. [File Locations Reference](#9-file-locations-reference)
10. [Current State & Roadmap](#10-current-state--roadmap)

---

## 1. Introduction & Architecture Overview

PHPless is a serverless PHP platform that runs each tenant's PHP application inside its own Firecracker microVM. Each VM boots in ~1.2 seconds and runs FrankenPHP (a PHP application server built on Caddy) to serve the app.

### Three Planes

```
┌──────────────────────────────────────────────────────────────┐
│                     MANAGEMENT PLANE                         │
│           Laravel 12 + React + Inertia + shadcn/ui           │
│      (PHP-FPM on host — NOT in a container or VM)            │
│               https://phpless.digitalno.de                   │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP over Unix socket
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                           │
│              Go daemon (phpless-manager)                      │
│    chi router · Firecracker SDK · logrus · systemd           │
│              Unix socket: /var/fc/manager.sock                │
└──────────┬──────────────┬──────────────┬─────────────────────┘
           │              │              │
           ▼              ▼              ▼
┌────────────────┐┌────────────────┐┌────────────────┐
│  EXECUTION     ││  EXECUTION     ││  EXECUTION     │
│  Firecracker   ││  Firecracker   ││  Firecracker   │
│  microVM       ││  microVM       ││  microVM       │
│  FrankenPHP    ││  FrankenPHP    ││  FrankenPHP    │
│  10.0.1.2:8080 ││  10.0.1.3:8080 ││  10.0.1.4:8080 │
└────────────────┘└────────────────┘└────────────────┘
```

**Execution Plane** — Firecracker microVMs running FrankenPHP. Each VM is an isolated sandbox with its own kernel, filesystem, and network interface. FrankenPHP serves PHP on port 8080.

**Control Plane** — A Go daemon (`phpless-manager`) that manages VM lifecycle: create, start, stop, destroy, and deploy code. Exposes an HTTP API over a Unix socket. Handles networking (Linux bridge, TAP devices, NAT).

**Management Plane** — A Laravel 12 panel with React/Inertia frontend. Provides the user-facing dashboard for managing apps, deployments, domains, and billing. Runs directly on the host via PHP-FPM + Caddy — it is NOT containerized or running in a Firecracker VM. It could live on any server that can reach the manager's socket (or a future TCP API).

### Traffic Flow

External HTTP requests hit Caddy on the host, which reverse-proxies to the correct VM based on subdomain. The panel communicates with the Go manager over a Unix socket to orchestrate VM operations.

---

## 2. Server Setup

**Source:** `scripts/server-setup.sh`

### Prerequisites

- Hetzner AX41-NVMe dedicated server (or any bare-metal with KVM support)
- Ubuntu 24.04 LTS, 64GB RAM
- Hardware KVM support (`/dev/kvm` must exist — VPS will NOT work)

### What the Script Does (8 Stages)

1. **System update** — `apt-get update && upgrade`
2. **KVM verification** — Checks `/dev/kvm` exists, sets permissions to 666
3. **Dependencies** — Installs: curl, wget, git, jq, debootstrap, squashfs-tools, iproute2, iptables, bridge-utils, e2fsprogs, wrk, build-essential, ufw, rsync
4. **Firecracker v1.10.1** — Downloaded from GitHub releases for x86_64
5. **Go 1.23.5** — Installed to `/usr/local/go`, PATH added via `/etc/profile.d/go.sh`
6. **PHP 8.4 + Composer** — From ondrej/php PPA with extensions: mbstring, xml, curl, zip, sqlite3, opcache
7. **Caddy 2.10** — Installed from official apt repository (cloudsmith.io)
8. **Directory structure + firewall** — Creates all required directories, enables UFW (SSH, HTTP, HTTPS), enables IP forwarding

### Directory Structure Created

```
/srv/firecracker/
├── base/
│   ├── kernel/       # vmlinux kernel binary
│   └── rootfs/       # debootstrapped rootfs directory
├── tenants/          # per-VM overlay/rootfs images
├── jail/             # jailer directory (unused currently)
└── sockets/          # per-VM Firecracker API sockets

/var/fc/              # manager state directory
```

### IP Forwarding

Enabled both at runtime and persistently:
```bash
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
```

---

## 3. Building the Root Filesystem

**Source:** `scripts/build-rootfs.sh`, `rootfs/init`, `rootfs/Caddyfile`, `configs/php.ini`

### Kernel

**Working kernel:** `vmlinux.bin` (Linux 4.14.174, 21MB)
**Source:** `s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin`

> **WARNING:** 5.10 kernels fail with `virtio_blk: probe of virtio0 failed with error -22` on Firecracker 1.10.1. Even the official Firecracker CI kernel fails. Use 4.14.174.

Boot arguments must include `root=/dev/vda rw`.

### Rootfs Build Steps

1. **Debootstrap Debian bookworm** — Minimal install with: procps, iproute2, iputils-ping, ca-certificates, curl
2. **Install FrankenPHP** — Static binary (v1.4.2) to `/usr/local/bin/frankenphp`
3. **Install configs:**
   - `/etc/php/php.ini` — OPcache + JIT enabled, 128MB memory limit
   - `/sbin/init` — Custom init script (see below)
   - `/etc/frankenphp/Caddyfile` — FrankenPHP server config
   - `/app/public/index.php` — Default test app
   - DNS resolver → 8.8.8.8
4. **Clean up** — Remove apt cache, docs, man pages to reduce size
5. **Create ext4 image** — 512MB sparse file, formatted with mkfs.ext4, populated from rootfs directory
6. **Create SquashFS image** — zstd compressed, for overlay mode

### The Init Script (`rootfs/init`)

This is PID 1 inside every microVM. It must be robust — no `set -e`, no `2>/dev/null` before `/dev` is ready.

```bash
#!/bin/sh
# Mount filesystems (|| true because some may be pre-mounted)
mount -t proc proc /proc || true
mount -t sysfs sysfs /sys || true
mount -t devtmpfs devtmpfs /dev || true
mount -t devpts devpts /dev/pts || true
mount -t tmpfs tmpfs /dev/shm || true
mount -t tmpfs tmpfs /tmp || true
mount -t tmpfs tmpfs /run || true

# Network
hostname phpless
ip link set lo up
echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
mkdir -p /tmp/sessions

# CRITICAL: Seed entropy before starting any Go binary
/usr/local/bin/add_entropy
echo "Entropy available: $(cat /proc/sys/kernel/random/entropy_avail)"

# Environment
export HOME=/root
export XDG_CONFIG_HOME=/root/.config
export XDG_DATA_HOME=/root/.local/share

# Optional overlay filesystem (if kernel cmdline has overlay=1)
OVERLAY=$(cat /proc/cmdline | tr ' ' '\n' | grep 'overlay=' | cut -d= -f2)
if [ "$OVERLAY" = "1" ] && [ -b /dev/vdb ]; then
    mkdir -p /mnt/overlay
    mount /dev/vdb /mnt/overlay
    mkdir -p /mnt/overlay/upper/app /mnt/overlay/work
    mount -t overlay overlay -o lowerdir=/app,upperdir=/mnt/overlay/upper/app,workdir=/mnt/overlay/work /app
fi

# Load .env if present
if [ -f /app/.env ]; then
    set -a; . /app/.env; set +a
fi

# Start FrankenPHP
exec /usr/local/bin/frankenphp run --config /etc/frankenphp/Caddyfile --adapter caddyfile
```

### The Entropy Fix (Critical)

FrankenPHP is built in Go, and Go's runtime calls `getrandom()` at startup. The 4.14 kernel has no `random.trust_cpu` support, so the entropy pool is empty at boot and `getrandom()` blocks indefinitely.

**Solution:** A static C binary (`add_entropy`) that uses the `RNDADDENTROPY` ioctl to inject 4096 bits of entropy from `/dev/urandom` into the kernel's entropy pool. This must run before any Go binary starts.

```c
// /tmp/add_entropy.c (compile on server)
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/random.h>

struct rand_pool_info_ext {
    int entropy_count;
    int buf_size;
    unsigned char buf[512];
};

int main() {
    int fd = open("/dev/urandom", O_RDONLY);
    if (fd < 0) return 1;

    struct rand_pool_info_ext info;
    info.entropy_count = 4096;
    info.buf_size = 512;
    read(fd, info.buf, 512);
    close(fd);

    fd = open("/dev/random", O_WRONLY);
    if (fd < 0) return 1;
    ioctl(fd, RNDADDENTROPY, &info);
    close(fd);
    return 0;
}
```

Compile statically and place in rootfs:
```bash
gcc -static -o /usr/local/bin/add_entropy /tmp/add_entropy.c
```

### VM Caddyfile (`rootfs/Caddyfile`)

```caddyfile
{
    admin off
    auto_https off
    frankenphp           # REQUIRED — enables php_server directive
    servers {
        protocols h1 h2c
    }
}

:8080 {
    root * /app/public
    encode zstd gzip
    php_server
    log {
        output stderr
        format console
        level ERROR
    }
}
```

> **Key:** The bare `frankenphp` directive (no braces, no workers) is REQUIRED in the global block. Without it, `php_server` silently fails.

### PHP Configuration (`configs/php.ini`)

Optimized for FrankenPHP in microVMs:
- OPcache enabled with JIT tracing mode (64MB buffer)
- `validate_timestamps = 0` — code is immutable in the VM image
- Memory limit: 128MB
- Sessions: file-based in `/tmp/sessions`

---

## 4. Go VM Manager

**Source:** `phpless-manager/`

The VM manager is a Go daemon that orchestrates Firecracker microVMs. It provides an HTTP API over a Unix socket.

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| firecracker-go-sdk | v1.0.0 | Official Firecracker SDK |
| chi/v5 | v5.1.0 | HTTP router |
| google/uuid | v1.6.0 | VM ID generation |
| logrus | v1.9.3 | Structured logging |

### Package Structure

```
phpless-manager/
├── cmd/manager/main.go           # Entry point, flags, signal handling
├── internal/
│   ├── api/server.go             # HTTP handlers & chi routing
│   ├── vm/
│   │   ├── lifecycle.go          # VM create/start/stop/destroy/redeploy
│   │   └── config.go             # VMConfig & ManagerConfig structs
│   ├── network/
│   │   ├── bridge.go             # Linux bridge, IP allocation, NAT
│   │   └── tap.go                # TAP device management
│   └── deploy/
│       └── overlay.go            # Code deployment (rsync to rootfs/overlay)
└── go.mod
```

### Startup Flow (`main.go`)

1. Parse command-line flags (socket path, bridge name, CIDR, kernel path, image paths, directories, log level)
2. Create Linux bridge with the specified CIDR
3. Initialize VM Manager with config and bridge
4. Start HTTP server on Unix socket (chmod 0666 for www-data access)
5. Register SIGINT/SIGTERM handlers
6. On shutdown: stop all VMs, destroy bridge

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/vms/` | Create a new VM (slug, optional vcpus/mem_mib) |
| `GET` | `/vms/` | List all VMs |
| `GET` | `/vms/{id}` | Get VM details |
| `DELETE` | `/vms/{id}` | Stop and destroy a VM |
| `POST` | `/vms/{id}/deploy` | Deploy code to a VM (app_dir, optional env_content) |
| `GET` | `/upstreams/{slug}` | Get VM address for Caddy routing |
| `GET` | `/health` | Health check (total/running VM counts) |

### Key Types

```go
type VMConfig struct {
    ID        string // 8-char UUID prefix
    Slug      string // App slug (subdomain routing)
    VCPUs     int    // Default: 1
    MemMiB    int    // Default: 128
    IP        string // Allocated from bridge (e.g., 10.0.1.2)
    GatewayIP string // Bridge IP (10.0.0.1)
    Subnet    string // 255.255.0.0
    MAC       string // AA:FC:00:xx:xx:01
    Overlay   bool   // SquashFS+overlay vs single ext4 copy
}

type DeployRequest struct {
    AppDir     string `json:"app_dir"`
    EnvContent string `json:"env_content,omitempty"` // .env file content to inject
}

type VMResponse struct {
    ID        string    `json:"id"`
    Slug      string    `json:"slug"`
    State     string    `json:"state"`      // starting/running/stopping/stopped/error
    IP        string    `json:"ip"`
    VCPUs     int       `json:"vcpus"`
    MemMiB    int       `json:"mem_mib"`
    StartedAt time.Time `json:"started_at,omitempty"`
    Error     string    `json:"error,omitempty"`
}
```

### VM Lifecycle

**Create:**
1. Allocate IP, gateway, MAC from bridge
2. Create TAP device, attach to bridge
3. Prepare rootfs (overlay mode: SquashFS base + sparse ext4 overlay; or full ext4 copy)
4. Build Firecracker machine config (kernel, drives, network, vCPU/memory)
5. Start VM asynchronously in a goroutine
6. Return immediately with `state: starting`

**Start (async):**
1. Start Firecracker machine (blocks until guest boots)
2. Log boot duration
3. Set state to `running`
4. Wait for VM exit (blocks)
5. On exit: set state to `stopped`

**Stop:**
1. Graceful `Shutdown()` with 10-second timeout
2. If timeout: force `StopVMM()`
3. Destroy TAP device, release IP

**Destroy:**
1. Stop VM
2. Remove from manager map
3. Delete socket file and rootfs/overlay files from disk

**Redeploy:**
1. Stop the running VM
2. Remove from manager map
3. Execute deploy function on the stopped rootfs (mount → rsync → unmount)
4. Create a fresh VM with the same config (gets new IP)

### Networking

```
Host (10.0.0.1)
  │
  br-phpless (Linux bridge, 10.0.0.1/16)
  │
  ├── tap-aaaaaaaa ─── VM1 (10.0.1.2)
  ├── tap-bbbbbbbb ─── VM2 (10.0.1.3)
  └── tap-cccccccc ─── VM3 (10.0.1.4)

Outbound: iptables MASQUERADE through host's default interface
Inbound:  Caddy reverse_proxy → VM_IP:8080
```

**Bridge creation:**
1. `ip link add br-phpless type bridge`
2. `ip addr add 10.0.0.1/16 dev br-phpless`
3. `ip link set br-phpless up`
4. `iptables -t nat -A POSTROUTING -o <default-iface> -j MASQUERADE`

**IP allocation:** Sequential from 10.0.1.2, supports ~65,000 VMs (253 per /24 × 254 subnets).

**TAP devices:** Created per-VM (`tap-{vm_id}`, truncated to 15 chars for Linux limit), attached to bridge.

**Boot args include IP config:**
```
console=ttyS0 reboot=k panic=1 pci=off root=/dev/vda rw
ip=10.0.1.2::10.0.0.1:255.255.0.0::eth0:off
```

### Code Deployment

Two modes depending on VM configuration:

**Non-overlay (current default):**
1. Stop VM (can't dual-mount ext4)
2. Mount rootfs ext4 with loop device
3. `rsync -a --delete appDir/ mountDir/app/public/`
4. Write `envContent` to `mountDir/app/.env` (if provided)
5. Unmount
6. Restart VM

**Overlay mode:**
1. Mount overlay ext4 with loop device
2. rsync to `upper/app/` directory
3. Write `envContent` to `upper/app/.env` (if provided)
4. Unmount
5. Changes visible immediately (no restart needed)

### Systemd Service

**Source:** `configs/phpless-manager.service`

```ini
[Service]
Type=simple
ExecStart=/usr/local/bin/phpless-manager \
    --socket /var/fc/manager.sock \
    --bridge br-phpless \
    --bridge-cidr 10.0.0.1/16 \
    --kernel /srv/firecracker/base/kernel/vmlinux.bin \
    --base-ext4 /srv/firecracker/base/rootfs-base.ext4 \
    --tenant-dir /srv/firecracker/tenants \
    --socket-dir /srv/firecracker/sockets \
    --log-level info
ExecStartPost=/bin/bash -c 'sleep 2 && /usr/bin/php /var/www/phpless/panel/artisan app:restore-vms || true'
Restart=always
RestartSec=5
```

The `ExecStartPost` is critical: VMs are child processes of the manager, so they die when the manager stops. On every manager (re)start — whether from a binary deploy or a server reboot — `app:restore-vms` recreates all VMs, redeploys code with environment variables, and regenerates the Caddy config.

Build and install:
```bash
cd /var/www/phpless/phpless-manager
go build -o /usr/local/bin/phpless-manager ./cmd/manager
cp /var/www/phpless/configs/phpless-manager.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now phpless-manager
```

---

## 5. Laravel Management Panel

**Source:** `panel/`

### Stack

- **Backend:** Laravel 12 + PHP 8.4 + SQLite
- **Frontend:** React 19 + Inertia.js v2 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui
- **Code Editor:** CodeMirror 6 with PHP syntax highlighting
- **Payments:** Laravel Cashier (Stripe) — installed, not yet active
- **WebSockets:** Laravel Reverb — installed, not yet active

### Scaffolding

```bash
composer create-project laravel/react-starter-kit panel
```

> **NOTE:** Do NOT use `breeze:install` — Laravel 12 starter kits are standalone project templates.

### Database Schema

8 migrations create these tables:

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | id, name, email, password, current_team_id | Authentication |
| `teams` | id, name, slug, owner_id, plan, stripe_id, trial_ends_at | Multi-tenancy & billing |
| `team_user` | team_id, user_id, role | Membership (owner/member) |
| `apps` | id, team_id, name, slug, vm_id, vm_ip, vm_state, vcpus, mem_mib, php_version, github_repo | PHP applications |
| `deployments` | id, app_id, triggered_by, commit_sha, status, log, started_at, completed_at | Deploy history |
| `domains` | id, app_id, domain, type, dns_verified, ssl_active | Custom domains |
| `environment_variables` | id, team_id (nullable), app_id (nullable), key, value (encrypted), is_secret | App/team config |

Environment variables support two scopes: **team-level** (shared across all apps in a team) and **app-level** (per-app overrides). A row has either `app_id` or `team_id`, never both. Unique indexes on `(app_id, key)` and `(team_id, key)` prevent duplicate keys within each scope.

### Models & Relationships

```
User ──belongsToMany──> Team (pivot: role)
     ──hasMany──> Team (as owner)
     ──belongsTo──> Team (current_team)

Team ──hasMany──> App
     ──hasMany──> EnvironmentVariable (team-level)
     ──belongsToMany──> User

App ──belongsTo──> Team
    ──hasMany──> Deployment, Domain, EnvironmentVariable

Deployment ──belongsTo──> App, User (triggeredBy)
Domain ──belongsTo──> App
EnvironmentVariable ──belongsTo──> App OR Team (value is encrypted)
    scopeForApp($appId)  — app-level vars only
    scopeForTeam($teamId) — team-level vars only
```

`Team.appLimit()` returns plan-based limits: 3 (hobby) / 10 (pro) / 50 (enterprise).

### Services

**VMManagerClient** — Communicates with the Go manager over Unix socket using cURL.

```php
// Key methods:
$client->createVM($slug, $vcpus, $memMib);           // POST /vms/ (30s timeout)
$client->destroyVM($vmId);                            // DELETE /vms/{id}
$client->deployCode($vmId, $appDir, $envContent='');  // POST /vms/{id}/deploy (60s timeout)
$client->waitForRunning($vmId, $timeout);             // Polls until state=running
$client->health();                                    // GET /health
```

**CaddyConfigManager** — Generates the host Caddyfile from all active apps and reloads Caddy.

```php
$caddy->regenerateAndReload();
// Reads all apps with running VMs
// Generates per-app reverse_proxy blocks (app.slug.phpless.digitalno.de → vm_ip:8080)
// Writes to /etc/caddy/Caddyfile
// Runs: sudo systemctl reload caddy
```

**AppLifecycleService** — Orchestrates the full app lifecycle.

```php
$lifecycle->createApp($team, $data);
// 1. Create App record in DB
// 2. Call VMManagerClient->createVM()
// 3. Wait for VM to reach "running" state
// 4. Update App with vm_id, vm_ip, vm_state
// 5. Regenerate Caddy config

$lifecycle->deleteApp($app);
// 1. Destroy VM via manager
// 2. Delete App record
// 3. Regenerate Caddy config
```

**EnvironmentVariableService** — Merges team and app environment variables, generates `.env` content for deployment.

```php
$envService->getMergedVariables($app);
// Returns collection of team + app vars, merged (app overrides team on same key)
// Each item has a 'source' attribute: 'team' or 'app'

$envService->generateEnvContent($app);
// Returns shell-safe .env content: KEY="value"\n
// Escapes \, ", $, ` in values
```

### Controllers

**DashboardController** — Shows running/total apps, plan info, engine health (calls `VMManagerClient->health()`).

**AppController:**
- `index` — List team's apps
- `create` / `store` — Create form + validation (name, slug, vcpus: 1-2, mem_mib: 128/256/512/1024)
- `show` — App details with VM state sync, last 10 deployments, domains
- `destroy` — Delete via AppLifecycleService
- `code` — Code editor (reads `/builds/{slug}/index.php` from disk)
- `updateCode` — Save code to disk
- `deploy` — Generates env content via `EnvironmentVariableService`, calls `deployCode()` with it, waits for running, creates Deployment record, reloads Caddy
- `analytics` — Returns 7-day request metrics as JSON
- `logs` — Returns last 100 access log entries from per-app Caddy log file

**EnvironmentVariableController** — CRUD for app-level env vars:
- `index(App)` — Returns JSON with `app_vars` and `team_vars` for the app
- `store(App)` — Creates a new app env var (key validated: `^[A-Z_][A-Z0-9_]*$`)
- `update(App, EnvVar)` — Updates value/is_secret (key is immutable)
- `destroy(App, EnvVar)` — Deletes an app env var

**TeamEnvironmentVariableController** — CRUD for team-level env vars (owner-only writes):
- `index` — Renders Inertia page (or JSON if `wantsJson()`)
- `store` / `update` / `destroy` — Same pattern, scoped to `user->currentTeam`

### Custom Middleware

**EnsureHasTeam** — Auto-creates a personal team for users who don't have one. Sets slug from user name, attaches with role `owner`.

### Authorization

**AppPolicy** — `view`, `update`, `delete` all check `user.current_team_id === app.team_id`.

### Routes

```
GET    /                         → Welcome page (public)
GET    /dashboard                → DashboardController
GET    /apps                     → AppController@index
GET    /apps/create              → AppController@create
POST   /apps                     → AppController@store
GET    /apps/{app}               → AppController@show
DELETE /apps/{app}               → AppController@destroy
GET    /apps/{app}/code          → AppController@code
PUT    /apps/{app}/code          → AppController@updateCode
POST   /apps/{app}/deploy        → AppController@deploy
GET    /apps/{app}/analytics     → AppController@analytics
GET    /apps/{app}/logs          → AppController@logs
GET    /apps/{app}/env           → EnvironmentVariableController@index
POST   /apps/{app}/env           → EnvironmentVariableController@store
PUT    /apps/{app}/env/{envVar}  → EnvironmentVariableController@update
DELETE /apps/{app}/env/{envVar}  → EnvironmentVariableController@destroy
GET    /team/env                 → TeamEnvironmentVariableController@index
POST   /team/env                 → TeamEnvironmentVariableController@store
PUT    /team/env/{envVar}        → TeamEnvironmentVariableController@update
DELETE /team/env/{envVar}        → TeamEnvironmentVariableController@destroy
```

All routes require `auth` + `EnsureHasTeam` middleware. App routes also check `AppPolicy`. Team env var writes require team ownership.

### Frontend Pages

- **Dashboard** — 3 cards: Running Apps (count/limit), Plan tier, Engine Status
- **Apps Index** — Table listing all apps (name, slug, state badge, IP, resources, created date)
- **Apps Create** — Form with name, auto-slug, memory dropdown, vCPU dropdown
- **Apps Show** — Tabbed view:
  - **Overview** — VM info (ID, IP, vCPUs, memory, PHP version, URL)
  - **Analytics** — 7-day request metrics with SVG bar chart, summary cards, status code breakdown
  - **Logs** — Recent request log table with auto-refresh, parsed from per-app Caddy JSON logs
  - **Deployments** — Deploy history (placeholder for git-based deploys)
  - **Domains** — Custom domain management (placeholder)
  - **Environment** — Full CRUD for app env vars: table with key, masked value (eye toggle for secrets), source badge (App/Team), add/edit/delete dialogs, "Deploy now to apply" prompt after changes
  - Actions: Edit Code, Visit, Delete
- **Apps Code** — CodeMirror editor with PHP syntax highlighting, Save and Deploy buttons
- **Team Env** (`/team/env`) — Team-level environment variables CRUD, same table/dialog pattern as app env vars. Accessible via "Team Settings" in sidebar.

---

## 6. Deploying the Panel

**Source:** `scripts/deploy-panel.sh`

### What the Script Does

Run from your local machine (not the server):

```bash
./scripts/deploy-panel.sh
```

1. **Build frontend locally** — `npm run build` (produces `public/build/`)
2. **Ensure server dependencies** — PHP 8.4-FPM, Node.js 20+, Composer
3. **Rsync panel to server** — Excludes: node_modules, vendor, .env, logs, cache, .git, database.sqlite
4. **Server-side setup:**
   - `composer install --no-dev`
   - Copy `.env.production` → `.env` (if missing)
   - Generate app key
   - Create SQLite database file
   - `php artisan migrate --force`
   - Cache routes, views
   - Set permissions (www-data owns storage, bootstrap/cache, database)
5. **Deploy server configs via scp:**
   - `configs/server/phpless-fpm.conf` → `/etc/php/8.4/fpm/pool.d/phpless.conf`
   - `configs/server/phpless-queue.service` → `/etc/systemd/system/`
   - `configs/server/phpless-sudoers` → `/etc/sudoers.d/phpless`
   - `configs/phpless-manager.service` → `/etc/systemd/system/`
6. **Restart services** — PHP-FPM, queue worker, regenerate Caddy config from database

> **Note:** The deploy script does NOT overwrite `/etc/caddy/Caddyfile` with a static template. Instead, it calls `CaddyConfigManager->regenerateAndReload()` to rebuild the Caddyfile from the database, preserving per-app routing blocks.

### PHP-FPM Pool (`configs/server/phpless-fpm.conf`)

```ini
[phpless]
user = www-data
group = www-data
listen = /run/php/php8.4-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = dynamic
pm.max_children = 10
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 4
```

### Queue Worker (`configs/server/phpless-queue.service`)

```ini
[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/phpless/panel
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=3
```

### Sudoers (`configs/server/phpless-sudoers`)

```
www-data ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy
```

Allows the Laravel panel (running as www-data) to reload Caddy after config changes.

### Host Caddyfile

The deploy script writes the Caddy config, but after that the `CaddyConfigManager` service regenerates it dynamically. The base structure:

```caddyfile
{
    email admin@phpless.io
}

phpless.digitalno.de {
    root * /var/www/phpless/panel/public
    php_fastcgi unix//run/php/php8.4-fpm.sock
    file_server
    encode gzip
}

# Per-app blocks generated by CaddyConfigManager:
# my-app.phpless.digitalno.de {
#     reverse_proxy 10.0.1.2:8080
# }

:8081 {
    respond /health "PHPless Host OK" 200
}
```

---

## 7. How It All Connects

### Creating an App

```
User clicks "Create App" in panel
         │
         ▼
Laravel AppController@store
  → validates name, slug, vcpus, mem_mib
  → AppLifecycleService->createApp()
         │
         ▼
VMManagerClient->createVM(slug, vcpus, mem_mib)
  → POST /vms/ over Unix socket
         │
         ▼
Go Manager: api.createVM()
  → Allocates IP from bridge (10.0.1.x)
  → Creates TAP device (tap-{vmid})
  → Copies base rootfs (ext4)
  → Starts Firecracker VM async
         │
         ▼
VMManagerClient->waitForRunning(vmId)
  → Polls GET /vms/{id} until state=running (~1.2s)
         │
         ▼
Laravel updates App record (vm_id, vm_ip, vm_state)
CaddyConfigManager->regenerateAndReload()
  → Writes new Caddyfile with reverse_proxy block
  → sudo systemctl reload caddy
         │
         ▼
App accessible at https://{slug}.phpless.digitalno.de
```

### Editing and Deploying Code

```
User edits code in CodeMirror editor
         │
         ▼
AppController@updateCode
  → Saves to /var/www/phpless/builds/{slug}/index.php
         │
User clicks "Deploy"
         │
         ▼
AppController@deploy
  → EnvironmentVariableService->generateEnvContent($app)
    (merges team + app vars, generates KEY="value" format)
  → VMManagerClient->deployCode(vmId, buildDir, envContent)
         │
         ▼
Go Manager: api.deployCode()
  → Manager.Redeploy(id, deployFn):
    1. Stop running VM
    2. Mount rootfs ext4
    3. rsync /builds/{slug}/ → rootfs/app/public/
    4. Write envContent → rootfs/app/.env
    5. Unmount
    6. Create new VM with same config (new IP)
         │
         ▼
VMManagerClient->waitForRunning(newVmId)
         │
         ▼
Laravel creates Deployment record
Updates App record (new vm_id, vm_ip)
CaddyConfigManager->regenerateAndReload()
  → Updates reverse_proxy to new VM IP
```

### Handling an External Request

```
Browser: GET https://my-app.phpless.digitalno.de/
         │
         ▼
Caddy (host, port 443)
  → TLS termination
  → Matches server block: my-app.phpless.digitalno.de
  → reverse_proxy 10.0.1.2:8080
         │
         ▼
Linux bridge (br-phpless)
  → Routes to TAP device (tap-{vmid})
         │
         ▼
Firecracker VM (10.0.1.2)
  → FrankenPHP on :8080
  → Serves /app/public/index.php
         │
         ▼
Response flows back: VM → bridge → Caddy → browser
```

---

## 8. Key Gotchas & Lessons Learned

### Kernel

- **4.14.174 works, 5.10 does NOT** on Firecracker 1.10.1. The 5.10 kernel fails with `virtio_blk: probe of virtio0 failed with error -22`, even using the official Firecracker CI config kernel.
- Boot args MUST include `root=/dev/vda rw`.

### Entropy

- FrankenPHP (Go-based) blocks on `getrandom()` in the 4.14 kernel because there's no `random.trust_cpu` support and the entropy pool is empty at boot.
- **Must seed entropy** with a static C binary using the `RNDADDENTROPY` ioctl before starting FrankenPHP. This is non-negotiable — without it, the VM hangs forever.

### Init Script

- **Never use `set -e`** — mount commands may fail because devtmpfs is already mounted by the kernel.
- **Never use `2>/dev/null`** before `/dev` is mounted — it will cause errors.
- Use `|| true` to suppress expected failures.
- **Always use `scp`** to upload the init script to the rootfs, never SSH heredocs — encoding issues cause `ENOEXEC` (bad interpreter).

### FrankenPHP / Caddyfile

- The bare `frankenphp` directive (without braces or worker config) is **REQUIRED** in the global block for `php_server` to work. Without it, PHP requests return empty responses.
- Worker mode (`worker /path/to/file.php N`) blocks startup if the PHP file doesn't call `frankenphp_handle_request()`. Use bare `php_server` for standard PHP apps.

### VM Persistence

- VMs are child processes of the Go manager — **they die when the manager stops**. This means a server reboot, a manager binary deploy, or a `systemctl restart phpless-manager` kills all running VMs.
- The `ExecStartPost` in the manager's systemd service runs `php artisan app:restore-vms` after every manager (re)start. This command recreates all VMs, redeploys code with environment variables, and regenerates the Caddy config.
- The restore command has a built-in 15-second health poll loop (`waitForManager`) to handle the delay between the manager process starting and the API socket being ready.
- The database may briefly show stale `vm_state: running` after a manager restart — the restore command updates it to the correct state.

### Networking

- The VM gateway must be the bridge IP (10.0.0.1), not the host's default gateway.
- Use `/16` subnet — `/24` is too small for multi-tenant.
- TAP device names are truncated to 15 chars (Linux interface name limit).

### Unix Socket

- The manager socket (`/var/fc/manager.sock`) must be chmod 0666 so www-data (PHP-FPM) can connect.
- The `VMManagerClient` in Laravel connects to the Unix socket using cURL's `CURLOPT_UNIX_SOCKET_PATH`.

### VM Manager API

- The `VMManagerClient` must send `slug` (not `id`) when creating VMs — the Go API uses slug for upstream routing.
- After deploy, the VM gets a **new IP** (old VM destroyed, new one created). The Caddy config must be regenerated.

### Rootfs

- You **cannot dual-mount ext4** — the rootfs must be unmounted from the host before the VM can use it, and vice versa. This is why non-overlay deploy requires stopping the VM first.

### Caddy

- `on_demand` TLS requires a permission module — don't use for catch-all blocks without one.
- The panel uses `php_fastcgi unix//run/php/php8.4-fpm.sock` (note the double slash — Caddy convention for absolute socket paths).
- www-data needs passwordless sudo for `systemctl reload caddy` to update routing.

---

## 9. File Locations Reference

### On the Server (65.108.14.212)

| Component | Path |
|-----------|------|
| **Firecracker binary** | `/usr/local/bin/firecracker` |
| **VM Manager binary** | `/usr/local/bin/phpless-manager` |
| **VM Manager socket** | `/var/fc/manager.sock` |
| **VM Manager service** | `/etc/systemd/system/phpless-manager.service` |
| **Kernel** | `/srv/firecracker/base/kernel/vmlinux.bin` |
| **Base rootfs (ext4)** | `/srv/firecracker/base/rootfs-base.ext4` |
| **Base rootfs (squashfs)** | `/srv/firecracker/base/rootfs-base.sqfs` |
| **Rootfs directory** | `/srv/firecracker/base/rootfs/` |
| **Tenant VM images** | `/srv/firecracker/tenants/{id}-rootfs.ext4` |
| **VM sockets** | `/srv/firecracker/sockets/fc-{id}.sock` |
| **Entropy binary** | (inside rootfs) `/usr/local/bin/add_entropy` |
| **Entropy source** | `/tmp/add_entropy.c` |
| **Panel application** | `/var/www/phpless/panel/` |
| **Panel database** | `/var/www/phpless/panel/database/database.sqlite` |
| **App build files** | `/var/www/phpless/builds/{slug}/` |
| **Caddy config** | `/etc/caddy/Caddyfile` |
| **PHP-FPM pool** | `/etc/php/8.4/fpm/pool.d/phpless.conf` |
| **Queue worker service** | `/etc/systemd/system/phpless-queue.service` |
| **App access logs** | `/var/log/phpless/apps/{slug}.log` |
| **Queue worker log** | `/var/log/phpless-queue.log` |
| **PHP-FPM log** | `/var/log/php8.4-fpm-phpless.log` |
| **Sudoers** | `/etc/sudoers.d/phpless` |

### In the Repository

| Component | Path |
|-----------|------|
| **Server setup script** | `scripts/server-setup.sh` |
| **Rootfs build script** | `scripts/build-rootfs.sh` |
| **Panel deploy script** | `scripts/deploy-panel.sh` |
| **VM init script** | `rootfs/init` |
| **VM Caddyfile** | `rootfs/Caddyfile` |
| **PHP config** | `configs/php.ini` |
| **Host Caddyfile** | `configs/Caddyfile` |
| **Manager systemd** | `configs/phpless-manager.service` |
| **Restore service** | `configs/server/phpless-restore.service` |
| **FPM pool config** | `configs/server/phpless-fpm.conf` |
| **Queue service** | `configs/server/phpless-queue.service` |
| **Sudoers file** | `configs/server/phpless-sudoers` |
| **Go manager source** | `phpless-manager/` |
| **Laravel panel source** | `panel/` |

---

## 10. Current State & Roadmap

### Phase 1 — Foundation (Complete)

- [x] Server provisioned and configured (Firecracker 1.10.1, Go, PHP 8.4, Caddy)
- [x] Root filesystem built (Debian bookworm + FrankenPHP static binary)
- [x] Single VM boots and serves PHP (~1.2s boot-to-ready)
- [x] Caddy routes external traffic to VM via reverse proxy
- [x] Go VM Manager running as systemd service with Unix socket API

### Phase 2.1 — Management Panel (Complete)

- [x] Laravel panel scaffolded (React + Inertia + TypeScript + shadcn/ui)
- [x] Database schema: teams, apps, deployments, domains, environment variables
- [x] Models with relationships and team-based authorization
- [x] Services: VMManagerClient, CaddyConfigManager, AppLifecycleService, EnvironmentVariableService
- [x] Dashboard with engine health monitoring
- [x] App CRUD with VM provisioning
- [x] In-browser PHP code editor (CodeMirror 6) with deploy
- [x] Analytics tab: 7-day request metrics with charts and status code breakdown
- [x] Logs tab: real-time access log viewer with auto-refresh
- [x] Environment variables: two-scope (team + app) CRUD with merge logic, secret masking, deploy integration
- [x] VM auto-restore on manager restart via ExecStartPost
- [x] Deployed to production: https://phpless.digitalno.de
- [x] Test account: test@phpless.io / password123

### Phase 2.2 — Git-based Deployment (Planned)

- [ ] GitHub webhook receiver
- [ ] Automated deploy jobs (clone repo → build → deploy to VM)
- [ ] Real-time deploy logs via Laravel Reverb (WebSockets)
- [ ] Deploy history with commit info

### Phase 2.3 — Custom Domains & SSL (Planned)

- [ ] Add custom domains to apps
- [ ] DNS verification
- [ ] Automatic SSL via Caddy's ACME

### Phase 2.4 — Monitoring & Billing (Planned)

- [ ] Resource monitoring (CPU, memory, network per VM)
- [ ] Usage-based billing via Laravel Cashier (Stripe)
- [ ] Plan enforcement (app limits, resource caps)
