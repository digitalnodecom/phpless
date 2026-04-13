# PHPless CLI

Command-line tool for deploying and managing PHP apps on PHPless.

## Installation

### Homebrew (macOS/Linux)

```bash
brew install phpless/tap/phpless
```

### Binary download

Download the latest binary for your platform from [GitHub Releases](https://github.com/digitalnodecom/phpless/releases):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/digitalnodecom/phpless/releases/latest/download/phpless-darwin-arm64 \
  -o /usr/local/bin/phpless
chmod +x /usr/local/bin/phpless
```

### Build from source

Requires Go 1.22+:

```bash
git clone https://github.com/digitalnodecom/phpless
cd phpless/cli
go build -o /usr/local/bin/phpless ./cmd/phpless
```

## Authentication

```bash
phpless login
```

Prompts for email and password. Your API token is stored in `~/.config/phpless/config.toml`.

Verify your session:

```bash
phpless whoami
```

## Commands

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--api-url <url>` | Override the API base URL |

### `phpless login`

Log in to PHPless. Prompts for email and password interactively.

```bash
phpless login
```

### `phpless whoami`

Show the current authenticated user and team info.

```bash
phpless whoami
```

### `phpless apps`

Manage apps. Has four subcommands:

#### `phpless apps list`

List all apps in your team.

```bash
phpless apps list
```

#### `phpless apps create <name>`

Create a new app.

```bash
phpless apps create "My App"
phpless apps create "My App" --slug my-app --vcpus 2 --mem 512
```

| Flag | Description |
|------|-------------|
| `--slug` | Custom slug (auto-generated from name if omitted) |
| `--vcpus` | Number of vCPUs: 1 or 2 (default: 1) |
| `--mem` | Memory in MiB: 128, 256, 512, or 1024 (default: 256) |

#### `phpless apps info <slug>`

Show detailed info about an app including VM state, domains, and recent deployments.

```bash
phpless apps info my-app
```

#### `phpless apps delete <slug>`

Delete an app and its VM. Prompts for confirmation.

```bash
phpless apps delete my-app
```

### `phpless init`

Initialize a `.phpless.toml` config file in the current directory, linking it to an app.

```bash
cd /path/to/my/project
phpless init
```

Creates:
- `.phpless.toml` — links the directory to an app slug
- `.phplessignore` — default ignore rules (if not present)

### `phpless deploy [directory]`

Deploy code to your app. Archives the directory as a tarball and uploads it.

```bash
# Deploy current directory (uses .phpless.toml)
phpless deploy

# Deploy a specific directory
phpless deploy ./src --app my-app
```

| Flag | Description |
|------|-------------|
| `--app` | App slug (defaults to value in `.phpless.toml`) |

Files listed in `.phplessignore` are excluded from the archive.

### `phpless pull [directory]`

Download the currently deployed code from an app.

```bash
phpless pull --app my-app
phpless pull ./local-copy --app my-app
```

| Flag | Description |
|------|-------------|
| `--app` | App slug (defaults to value in `.phpless.toml`) |

### `phpless info`

Show info about the current app (linked via `.phpless.toml` or `--app` flag).

```bash
phpless info
phpless info --app my-app
```

### `phpless logs`

View recent HTTP access logs for an app.

```bash
phpless logs --app my-app
```

Output columns: TIME, METHOD, PATH, STATUS, DURATION (ms), IP.

### `phpless files`

List deployed files for an app with sizes and modification dates.

```bash
phpless files --app my-app
```

### `phpless ssh`

Open an interactive SSH session into the app's Firecracker microVM.

```bash
phpless ssh --app my-app
phpless ssh    # uses .phpless.toml
```

Connects through the PHPless SSH proxy using your API token. Supports terminal resizing and full PTY.

### `phpless env`

Manage environment variables at the app or team level.

#### `phpless env list`

List environment variables.

```bash
phpless env list --app my-app       # app vars (merged with team)
phpless env list --team             # team-level vars only
```

#### `phpless env set KEY=VALUE...`

Set one or more environment variables.

```bash
phpless env set --app my-app DB_HOST=localhost APP_DEBUG=false
phpless env set --team SHARED_SECRET=abc123
```

#### `phpless env unset <KEY>`

Delete an environment variable.

```bash
phpless env unset --app my-app DB_HOST
phpless env unset --team SHARED_SECRET
```

### `phpless storage`

Manage persistent storage files for an app. Storage persists across deploys at `/app/storage/` inside the VM.

#### `phpless storage list`

```bash
phpless storage list --app my-app
```

#### `phpless storage upload <file>`

Upload a local file to persistent storage.

```bash
phpless storage upload database.sqlite --app my-app
phpless storage upload database.sqlite --app my-app --path db/app.sqlite
```

| Flag | Description |
|------|-------------|
| `--path` | Remote path in storage (defaults to the filename) |

#### `phpless storage write <remote-path>`

Write content from stdin to a file in persistent storage.

```bash
echo 'APP_ENV=production' | phpless storage write .env --app my-app
```

#### `phpless storage download <remote-path>`

Download a file from persistent storage.

```bash
phpless storage download database.sqlite --app my-app
phpless storage download database.sqlite --app my-app -o ./local.sqlite
phpless storage download .env --app my-app -o -    # output to stdout
```

| Flag | Description |
|------|-------------|
| `-o, --output` | Local output path (defaults to filename, use `-` for stdout) |

#### `phpless storage delete <remote-path>`

Delete a file from persistent storage.

```bash
phpless storage delete database.sqlite --app my-app
```

## MCP Server (AI Integration)

The CLI includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server for integration with AI tools like Claude Code, Cursor, and others.

### Setup with Claude Code

```bash
claude mcp add phpless -- phpless mcp
```

### Setup with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "phpless": {
      "command": "phpless",
      "args": ["mcp"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `whoami` | Show authenticated user and current team |
| `list_apps` | List all apps in the current team |
| `get_app` | Get detailed info about an app |
| `create_app` | Create a new app |
| `delete_app` | Delete an app and its VM |
| `deploy` | Deploy a local directory to an app |
| `pull_app` | Download deployed code into a local directory |
| `get_logs` | Get recent access logs |
| `list_files` | List deployed files |
| `list_env` | List environment variables (app or team scope) |
| `set_env` | Set an environment variable |
| `delete_env` | Delete an environment variable |
| `ssh_exec` | Execute a shell command inside an app's VM |

### MCP Resources

| Resource | Description |
|----------|-------------|
| `phpless://docs/overview` | Platform overview and architecture |
| `phpless://docs/quickstart` | Step-by-step quickstart guide |
| `phpless://project-config` | Current `.phpless.toml` configuration |

## Configuration

### Global config

Location: `~/.config/phpless/config.toml`

```toml
api_url = "https://phpless.digitalno.de/api/v1"
token = "1|abc123..."
```

Created automatically by `phpless login`. File permissions are set to `0600`.

### Project config

Location: `.phpless.toml` (in your project root)

```toml
app = "my-app"
directory = "."
```

Created by `phpless init`. The CLI searches up the directory tree for this file, so you can run commands from subdirectories.

### `.phplessignore`

Controls which files are excluded from deploy archives. Uses `.gitignore` syntax.

Default contents (created by `phpless init`):

```
.git/
.phpless.toml
.phplessignore
node_modules/
.DS_Store
__MACOSX/
*.log
.env
.env.*
```
