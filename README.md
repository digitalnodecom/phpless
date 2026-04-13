# PHPless

Serverless PHP hosting on Firecracker microVMs.

PHPless runs each PHP app in its own isolated [Firecracker](https://firecracker-microvm.github.io/) microVM with a dedicated [FrankenPHP](https://frankenphp.dev/) runtime. Deploy from the CLI, push from Git, or let an AI agent manage your apps via the built-in MCP server.

## Features

- **Firecracker VM isolation** -- every app gets its own microVM with a dedicated kernel and filesystem. No containers, no shared runtimes.
- **FrankenPHP performance** -- static FrankenPHP binary serves PHP with automatic HTTPS, HTTP/2, and early hints.
- **Fast cold starts** -- VMs boot to ready in ~1.2 seconds.
- **AI-native MCP server** -- built-in Model Context Protocol server lets Claude Code, Cursor, and other AI tools deploy and manage your apps.
- **Simple CLI** -- one command to deploy, SSH into VMs, manage env vars, and stream logs.

## Architecture

```
                        +-------------------------------------+
                        |         MANAGEMENT PLANE            |
                        |   Laravel 12 + React + Inertia      |
                        |   https://phpless.digitalno.de      |
                        +----------------+--------------------+
                                         | Unix socket
                        +----------------v--------------------+
                        |          CONTROL PLANE              |
                        |   Go daemon (phpless-manager)       |
                        |   /var/fc/manager.sock              |
                        +---+----------+----------+-----------+
                            |          |          |
                        +---v---+  +---v---+  +---v---+
                        |  VM 1 |  |  VM 2 |  |  VM N |
                        |Frank- |  |Frank- |  |Frank- |
                        |enPHP  |  |enPHP  |  |enPHP  |
                        +-------+  +-------+  +-------+
                             EXECUTION PLANE
```

| Component | Technology | Role |
|-----------|------------|------|
| **Panel** | Laravel 12 + React/Inertia + shadcn/ui | Web dashboard, REST API, team management |
| **Manager** | Go daemon | VM lifecycle, port forwarding, deploy orchestration |
| **CLI** | Go (Cobra) | Terminal client + MCP server for AI integration |
| **RootFS** | Debian + FrankenPHP | Firecracker VM filesystem with PHP runtime |

## Quick Start

### 1. Install the CLI

```bash
brew install phpless/tap/phpless
```

Or download a binary from [GitHub Releases](https://github.com/digitalnodecom/phpless/releases).

### 2. Log in

```bash
phpless login
```

### 3. Deploy

```bash
cd /path/to/your/php-project
phpless up
```

That single command creates the app (if it doesn't exist), writes a `.phpless.toml` config, and deploys your code. Your app is live at `https://<slug>.phpless.app`.

## Documentation

- **[CLI Reference](cli/README.md)** -- all commands, flags, and configuration
- **[Laravel Deployment Guide](docs/laravel.md)** -- step-by-step Laravel deployment
- **[Panel Documentation](https://phpless.digitalno.de/docs)** -- web panel docs and API reference
- **[API Explorer (Swagger)](https://phpless.digitalno.de/docs/api)** -- interactive OpenAPI explorer

## MCP / AI Integration

Add PHPless to Claude Code in one command:

```bash
claude mcp add phpless -- phpless mcp
```

Claude can then create apps, deploy code, check logs, set env vars, and SSH into VMs on your behalf. See the [CLI README](cli/README.md#mcp-server-ai-integration) for full setup instructions.

## Project Structure

```
phpless/
├── panel/                 # Laravel 12 management panel (React + Inertia + shadcn/ui)
├── phpless-manager/       # Go VM orchestration daemon
├── cli/                   # Go CLI + MCP server
├── rootfs/                # Firecracker microVM base filesystem (init, Caddyfile)
├── scripts/               # Setup and deployment scripts
├── docs/                  # Guides and documentation
└── Makefile               # Build and deploy targets
```

## How It Works

1. **Create an app** via the panel, CLI, or MCP tool.
2. **Panel calls the Go manager** over a Unix socket to provision a Firecracker VM.
3. **VM boots** with the base rootfs (Debian + FrankenPHP) in ~1.2 seconds.
4. **Deploy code** -- the manager syncs app files and a merged `.env` into `/app/` on the VM.
5. **Caddy** on the host routes `<slug>.phpless.app` traffic to the VM's internal IP.
6. **Environment variables** merge at two levels (team + app, app overrides team) and are injected as `/app/.env`.

VMs are child processes of the Go manager. On manager restart, all VMs are automatically restored from the database.

## Development

### Prerequisites

- **Server**: bare-metal with KVM support (tested on Hetzner AX41-NVMe)
- **OS**: Ubuntu 24.04
- **Go 1.22+** (for manager and CLI)
- **Node.js 20+** and **npm** (for frontend assets)
- **PHP 8.2+** and **Composer** (for panel)

### Panel (Laravel + React)

```bash
cd panel
composer install
npm install
php artisan serve
npm run dev
```

### VM Manager (Go)

```bash
cd phpless-manager
go build ./cmd/manager/
```

### CLI

```bash
cd cli
go build -o phpless ./cmd/phpless/
```

### Makefile Targets

| Target | Description |
|--------|-------------|
| `make build` | Cross-compile Go manager for Linux amd64 |
| `make deploy` | Build + rsync everything to server |
| `make panel-deploy` | Deploy panel only |
| `make setup` | Run server setup script |
| `make rootfs` | Build base rootfs on server |

## License

Proprietary. All rights reserved.
