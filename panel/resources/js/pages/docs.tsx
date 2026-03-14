import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowLeft, BookOpen, Bot, ChevronRight, Code2, Key, Rocket, Server, Terminal, Variable } from 'lucide-react';
import { useEffect, useState } from 'react';

function SideNav({ active }: { active: string }) {
    const sections = [
        { id: 'getting-started', label: 'Getting Started', icon: Rocket },
        { id: 'panel', label: 'Panel Overview', icon: Server },
        { id: 'api-auth', label: 'API Authentication', icon: Key },
        { id: 'api-apps', label: 'Apps', icon: Code2 },
        { id: 'api-deploy', label: 'Deploying', icon: Terminal },
        { id: 'api-env', label: 'Environment Variables', icon: Variable },
        { id: 'api-team', label: 'Team & User', icon: BookOpen },
        { id: 'cli-mcp', label: 'CLI & MCP', icon: Bot },
    ];

    return (
        <nav className="space-y-1">
            {sections.map((s) => (
                <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        active === s.id
                            ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                            : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-200'
                    }`}
                >
                    <s.icon className="h-4 w-4 shrink-0" />
                    {s.label}
                </a>
            ))}
        </nav>
    );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(children.trim());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative rounded-lg border border-neutral-200 dark:border-neutral-700">
            {title && (
                <div className="border-b border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                    {title}
                </div>
            )}
            <div className="relative">
                <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                    <code>{children.trim()}</code>
                </pre>
                <button
                    onClick={copy}
                    className="absolute top-2 right-2 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600 opacity-0 transition-opacity hover:bg-neutral-200 group-hover:opacity-100 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
    const colors: Record<string, string> = {
        GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
        <div className="flex items-start gap-3 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <span className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-bold ${colors[method] ?? ''}`}>
                {method}
            </span>
            <div className="min-w-0">
                <code className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{path}</code>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            </div>
        </div>
    );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24">
            <h2 className="mb-4 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
            <div className="space-y-4 text-neutral-700 dark:text-neutral-300">{children}</div>
        </section>
    );
}

export default function Docs() {
    const { auth } = usePage<SharedData>().props;
    const [active, setActive] = useState('getting-started');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id);
                    }
                }
            },
            { rootMargin: '-80px 0px -60% 0px' },
        );

        document.querySelectorAll('section[id]').forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const baseUrl = 'https://phpless.digitalno.de';

    return (
        <>
            <Head title="Documentation">
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />
            </Head>

            <div className="min-h-screen bg-white dark:bg-neutral-950" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
                {/* Header */}
                <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80">
                    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                                PHPless
                            </Link>
                            <ChevronRight className="h-4 w-4 text-neutral-400" />
                            <span className="text-sm text-neutral-500">Documentation</span>
                        </div>
                        <nav className="flex items-center gap-4">
                            {auth.user ? (
                                <Link
                                    href="/dashboard"
                                    className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    Dashboard
                                </Link>
                            ) : (
                                <>
                                    <Link href="/login" className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
                                        Log in
                                    </Link>
                                    <Link
                                        href="/register"
                                        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                                    >
                                        Sign up
                                    </Link>
                                </>
                            )}
                        </nav>
                    </div>
                </header>

                <div className="mx-auto flex max-w-7xl gap-10 px-6 py-10">
                    {/* Sidebar */}
                    <aside className="hidden w-56 shrink-0 lg:block">
                        <div className="sticky top-24">
                            <SideNav active={active} />
                        </div>
                    </aside>

                    {/* Content */}
                    <main className="min-w-0 max-w-3xl flex-1 space-y-16">
                        <Section id="getting-started" title="Getting Started">
                            <p>
                                PHPless is a serverless PHP hosting platform. Each app runs in its own
                                Firecracker microVM with a dedicated FrankenPHP runtime — full isolation,
                                instant boot, zero cold starts after the first deploy.
                            </p>
                            <p>You can manage apps through the web panel or programmatically via the REST API.</p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Quick start</h3>
                            <ol className="list-inside list-decimal space-y-2 pl-1">
                                <li>
                                    <Link href="/register" className="text-blue-600 underline dark:text-blue-400">Create an account</Link> and log in to the panel.
                                </li>
                                <li>
                                    Go to <strong>Apps</strong> and click <strong>Create App</strong>. Pick a name and resource tier.
                                </li>
                                <li>
                                    Open the <strong>Code</strong> tab, write some PHP, and hit <strong>Deploy</strong>.
                                </li>
                                <li>
                                    Your app is live at <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">https://&lt;slug&gt;.phpless.digitalno.de</code>.
                                </li>
                            </ol>
                        </Section>

                        <Section id="panel" title="Panel Overview">
                            <p>The web panel at <a href={baseUrl} className="text-blue-600 underline dark:text-blue-400">{baseUrl}</a> lets you:</p>
                            <ul className="list-inside list-disc space-y-1.5 pl-1">
                                <li><strong>Dashboard</strong> — overview of your apps and VM engine status.</li>
                                <li><strong>Apps</strong> — create, configure, deploy, and delete apps.</li>
                                <li><strong>Code editor</strong> — edit PHP directly in the browser and deploy with one click.</li>
                                <li><strong>Logs</strong> — view the last 100 access log entries per app (method, path, status, duration).</li>
                                <li><strong>Analytics</strong> — request counts, average latency, error rates, and bandwidth over the last 7 days.</li>
                                <li><strong>Environment Variables</strong> — set app-level and team-level variables. App vars override team vars when keys collide.</li>
                                <li><strong>Team Settings</strong> — manage team-wide environment variables shared across all apps.</li>
                                <li><strong>API Tokens</strong> — create and revoke bearer tokens for API access under <strong>Settings &rarr; API Tokens</strong>.</li>
                            </ul>
                        </Section>

                        <Section id="api-auth" title="API Authentication">
                            <p>
                                The REST API lives at <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">{baseUrl}/api/v1/</code>.
                                All endpoints (except token exchange) require a bearer token.
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Option 1: Create a token in the panel</h3>
                            <p>
                                Go to <strong>Settings &rarr; API Tokens</strong>, enter a name, and click <strong>Create token</strong>.
                                Copy the token immediately — it's only shown once.
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Option 2: Exchange credentials for a token</h3>
                            <CodeBlock title="Request">{`curl -X POST ${baseUrl}/api/v1/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "your-password"}'`}</CodeBlock>
                            <CodeBlock title="Response">{`{
  "token": "1|abc123...",
  "user": {
    "id": 1,
    "name": "Your Name",
    "email": "you@example.com"
  }
}`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Option 3: Artisan command (server admin)</h3>
                            <CodeBlock>{`php artisan api:token you@example.com my-token-name`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Using the token</h3>
                            <p>Pass it as a Bearer token in the <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">Authorization</code> header:</p>
                            <CodeBlock>{`curl -H "Authorization: Bearer 1|abc123..." \\
  -H "Accept: application/json" \\
  ${baseUrl}/api/v1/apps`}</CodeBlock>
                        </Section>

                        <Section id="api-apps" title="Apps">
                            <p>Apps are identified by their <strong>slug</strong> in API URLs (not numeric IDs).</p>

                            <div className="space-y-3">
                                <Endpoint method="GET" path="/api/v1/apps" description="List all apps in your current team." />
                                <Endpoint method="POST" path="/api/v1/apps" description="Create a new app." />
                                <Endpoint method="GET" path="/api/v1/apps/{slug}" description="Get app details including VM state, recent deployments, and domains." />
                                <Endpoint method="DELETE" path="/api/v1/apps/{slug}" description="Delete an app and its VM." />
                            </div>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Create an app</h3>
                            <CodeBlock title="Request">{`curl -X POST ${baseUrl}/api/v1/apps \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My App",
    "slug": "my-app",
    "vcpus": 1,
    "mem_mib": 256
  }'`}</CodeBlock>

                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                        <th className="py-2 pr-4 text-left font-medium">Field</th>
                                        <th className="py-2 pr-4 text-left font-medium">Required</th>
                                        <th className="py-2 text-left font-medium">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="text-neutral-600 dark:text-neutral-400">
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>name</code></td>
                                        <td className="py-2 pr-4">Yes</td>
                                        <td className="py-2">Display name (max 255 chars)</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>slug</code></td>
                                        <td className="py-2 pr-4">No</td>
                                        <td className="py-2">URL-safe identifier. Auto-generated from name if omitted. Must be unique.</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>vcpus</code></td>
                                        <td className="py-2 pr-4">No</td>
                                        <td className="py-2">1 or 2 (default: 1)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4"><code>mem_mib</code></td>
                                        <td className="py-2 pr-4">No</td>
                                        <td className="py-2">128, 256, 512, or 1024 (default: 256)</td>
                                    </tr>
                                </tbody>
                            </table>

                            <CodeBlock title="Response (201)">{`{
  "app": {
    "slug": "my-app",
    "name": "My App",
    "url": "https://my-app.phpless.digitalno.de",
    "vm_state": "running",
    "vcpus": 1,
    "mem_mib": 256,
    "created_at": "2026-02-15T12:00:00.000000Z",
    "updated_at": "2026-02-15T12:00:00.000000Z"
  }
}`}</CodeBlock>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Get app details</h3>
                            <CodeBlock title="Request">{`curl ${baseUrl}/api/v1/apps/my-app \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Accept: application/json"`}</CodeBlock>
                            <p>Returns extended info: VM ID, IP, PHP version, recent deployments, and configured domains.</p>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Access logs</h3>
                            <Endpoint method="GET" path="/api/v1/apps/{slug}/logs" description="Returns the last 100 access log entries." />
                            <CodeBlock title="Response">{`{
  "logs": [
    {
      "timestamp": "2026-02-15 12:34:56",
      "method": "GET",
      "path": "/",
      "status": 200,
      "duration": 4.2,
      "client_ip": "1.2.3.4",
      "size": 26594
    }
  ]
}`}</CodeBlock>
                        </Section>

                        <Section id="api-deploy" title="Deploying">
                            <p>
                                Deploy code by uploading a <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">.tar.gz</code> tarball
                                containing your PHP application. The tarball is extracted into the app's build directory, then deployed to the VM.
                            </p>

                            <Endpoint method="POST" path="/api/v1/apps/{slug}/deploy" description="Deploy code from a tarball upload." />

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Create a tarball</h3>
                            <CodeBlock>{`# From your project root:
tar -czf app.tar.gz -C ./src .`}</CodeBlock>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                Your tarball should contain an <code>index.php</code> at the root. Max upload size: 50 MB.
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Deploy via API</h3>
                            <CodeBlock title="Request">{`curl -X POST ${baseUrl}/api/v1/apps/my-app/deploy \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "tarball=@app.tar.gz"`}</CodeBlock>

                            <CodeBlock title="Response">{`{
  "message": "Deployed successfully.",
  "app": {
    "slug": "my-app",
    "name": "My App",
    "url": "https://my-app.phpless.digitalno.de",
    "vm_state": "running",
    ...
  }
}`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">What happens during deploy</h3>
                            <ol className="list-inside list-decimal space-y-1.5 pl-1">
                                <li>The tarball is extracted into the app's build directory on the server.</li>
                                <li>Environment variables are merged (team + app) and written as a <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">.env</code> file.</li>
                                <li>The build directory is synced to the Firecracker VM's filesystem.</li>
                                <li>The VM restarts with the new code.</li>
                                <li>Caddy config is regenerated so traffic routes to the updated VM IP.</li>
                            </ol>
                        </Section>

                        <Section id="api-env" title="Environment Variables">
                            <p>
                                Environment variables have two scopes: <strong>app</strong> and <strong>team</strong>.
                                Team variables are shared across all apps; app variables override team variables when keys collide.
                                Variables are encrypted at rest and injected as a <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">.env</code> file on each deploy.
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">App-level variables</h3>
                            <div className="space-y-3">
                                <Endpoint method="GET" path="/api/v1/apps/{slug}/env" description="List merged env vars (team + app) for this app." />
                                <Endpoint method="PUT" path="/api/v1/apps/{slug}/env" description="Batch set app env vars (upsert). Existing keys are overwritten." />
                                <Endpoint method="DELETE" path="/api/v1/apps/{slug}/env/{KEY}" description="Delete a single app env var by key name." />
                            </div>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Batch set</h3>
                            <CodeBlock title="Request">{`curl -X PUT ${baseUrl}/api/v1/apps/my-app/env \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "vars": {
      "DB_HOST": "localhost",
      "DB_PORT": "3306",
      "APP_DEBUG": "false"
    }
  }'`}</CodeBlock>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                Keys must match <code>{'[A-Z_][A-Z0-9_]*'}</code> (uppercase, underscores, digits after first char). Values are strings, max 10,000 chars.
                            </p>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Team-level variables</h3>
                            <p>Team vars are inherited by all apps. Only the team owner can modify them.</p>
                            <div className="space-y-3">
                                <Endpoint method="GET" path="/api/v1/team/env" description="List team env vars." />
                                <Endpoint method="PUT" path="/api/v1/team/env" description="Batch set team env vars." />
                                <Endpoint method="DELETE" path="/api/v1/team/env/{KEY}" description="Delete a team env var by key." />
                            </div>

                            <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-900/20">
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    <strong>Note:</strong> Setting env vars does not trigger a redeploy. After changing variables, run a deploy to apply the new values.
                                </p>
                            </div>
                        </Section>

                        <Section id="api-team" title="Team & User">
                            <div className="space-y-3">
                                <Endpoint method="GET" path="/api/v1/user" description="Get authenticated user info and current team." />
                                <Endpoint method="GET" path="/api/v1/team" description="Get current team info, app count, and plan limits." />
                            </div>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">User info</h3>
                            <CodeBlock title="Response">{`{
  "user": {
    "id": 1,
    "name": "Your Name",
    "email": "you@example.com",
    "current_team": {
      "id": 1,
      "name": "Your Team",
      "slug": "your-team"
    },
    "created_at": "2026-02-14T15:42:50.000000Z"
  }
}`}</CodeBlock>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Team info</h3>
                            <CodeBlock title="Response">{`{
  "team": {
    "id": 1,
    "name": "Your Team",
    "slug": "your-team",
    "plan": "hobby",
    "app_count": 2,
    "app_limit": 3,
    "created_at": "2026-02-14T15:44:20.000000Z"
  }
}`}</CodeBlock>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">Plans</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                        <th className="py-2 pr-4 text-left font-medium">Plan</th>
                                        <th className="py-2 text-left font-medium">App limit</th>
                                    </tr>
                                </thead>
                                <tbody className="text-neutral-600 dark:text-neutral-400">
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4">Hobby</td>
                                        <td className="py-2">3 apps</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4">Pro</td>
                                        <td className="py-2">10 apps</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4">Enterprise</td>
                                        <td className="py-2">50 apps</td>
                                    </tr>
                                </tbody>
                            </table>
                        </Section>

                        <Section id="cli-mcp" title="CLI & MCP">
                            <p>
                                The PHPless CLI lets you deploy apps, manage environment variables, stream logs, and browse files — all from your terminal.
                                It also ships a built-in <strong>Model Context Protocol (MCP) server</strong> so AI tools like Claude can manage your apps autonomously.
                            </p>
                            <p>
                                Source code and releases:{' '}
                                <a href="https://github.com/digitalnodecom/phpless" target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">
                                    github.com/digitalnodecom/phpless
                                </a>
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Installation</h3>
                            <p>Download the latest binary from <a href="https://github.com/digitalnodecom/phpless/releases" target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">GitHub Releases</a> and place it in your <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">PATH</code>:</p>
                            <CodeBlock title="macOS / Linux">{`# Download the latest release for your platform, e.g.:
curl -L https://github.com/digitalnodecom/phpless/releases/latest/download/phpless-darwin-arm64 \\
  -o /usr/local/bin/phpless
chmod +x /usr/local/bin/phpless`}</CodeBlock>
                            <p>Or build from source (requires Go 1.22+):</p>
                            <CodeBlock title="Build from source">{`git clone https://github.com/digitalnodecom/phpless
cd phpless/cli
go build -o /usr/local/bin/phpless .`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Authentication</h3>
                            <p>Log in with your PHPless credentials. Your token is stored in <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">~/.config/phpless/config.toml</code>.</p>
                            <CodeBlock>{`phpless login`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Common commands</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                        <th className="py-2 pr-4 text-left font-medium">Command</th>
                                        <th className="py-2 text-left font-medium">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="text-neutral-600 dark:text-neutral-400">
                                    {[
                                        ['phpless login', 'Authenticate with your PHPless account'],
                                        ['phpless apps list', 'List all apps in your team'],
                                        ['phpless apps create "My App"', 'Create a new app'],
                                        ['phpless deploy [slug]', 'Deploy current directory (or specify slug)'],
                                        ['phpless pull [slug]', 'Download deployed code to local directory'],
                                        ['phpless logs [slug]', 'Stream recent access logs'],
                                        ['phpless files [slug]', 'Browse deployed files'],
                                        ['phpless env list --app <slug>', 'List env vars for an app'],
                                        ['phpless env set --app <slug> KEY=value', 'Set an env var'],
                                        ['phpless env set --team KEY=value', 'Set a team-wide env var'],
                                    ].map(([cmd, desc]) => (
                                        <tr key={cmd} className="border-b border-neutral-100 dark:border-neutral-800">
                                            <td className="py-2 pr-4"><code>{cmd}</code></td>
                                            <td className="py-2">{desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <h3 className="pt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">MCP Server (Claude integration)</h3>
                            <p>
                                The CLI includes an MCP server (<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">phpless mcp</code>) that exposes your PHPless account
                                as tools Claude can call. Once configured, Claude can list your apps, deploy code, check logs, and manage environment variables on your behalf.
                            </p>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                Requires <code>phpless login</code> to be run once before the MCP server will work.
                            </p>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Claude Code</h3>
                            <p>Add the MCP server to Claude Code by running:</p>
                            <CodeBlock>{`claude mcp add phpless -- phpless mcp`}</CodeBlock>
                            <p>Or add it manually to your Claude Code settings (<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">~/.claude/settings.json</code>):</p>
                            <CodeBlock title="~/.claude/settings.json">{`{
  "mcpServers": {
    "phpless": {
      "command": "phpless",
      "args": ["mcp"]
    }
  }
}`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Claude Desktop</h3>
                            <p>Add the following to your Claude Desktop config (<code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">~/Library/Application Support/Claude/claude_desktop_config.json</code> on macOS):</p>
                            <CodeBlock title="claude_desktop_config.json">{`{
  "mcpServers": {
    "phpless": {
      "command": "phpless",
      "args": ["mcp"]
    }
  }
}`}</CodeBlock>

                            <h3 className="pt-2 text-lg font-medium text-neutral-900 dark:text-neutral-100">Available MCP tools</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                        <th className="py-2 pr-4 text-left font-medium">Tool</th>
                                        <th className="py-2 text-left font-medium">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="text-neutral-600 dark:text-neutral-400">
                                    {[
                                        ['whoami', 'Show authenticated user and current team'],
                                        ['list_apps', 'List all apps in the current team'],
                                        ['get_app', 'Get detailed info about an app (slug required)'],
                                        ['create_app', 'Create a new app (name required; slug, vcpus, mem_mib optional)'],
                                        ['delete_app', 'Delete an app and its VM (slug required)'],
                                        ['deploy', 'Deploy a local directory to an app (slug + directory required)'],
                                        ['pull_app', 'Download deployed code into a local directory'],
                                        ['get_logs', 'Get recent access logs for an app'],
                                        ['list_files', 'List deployed files for an app'],
                                        ['list_env', "List env vars (scope: 'app' or 'team')"],
                                        ['set_env', "Set an env var (scope: 'app' or 'team')"],
                                        ['delete_env', "Delete an env var (scope: 'app' or 'team')"],
                                    ].map(([tool, desc]) => (
                                        <tr key={tool} className="border-b border-neutral-100 dark:border-neutral-800">
                                            <td className="py-2 pr-4"><code>{tool}</code></td>
                                            <td className="py-2">{desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        {/* Full endpoint reference */}
                        <section id="reference" className="scroll-mt-24">
                            <h2 className="mb-4 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">API Reference</h2>
                            <div className="mb-6 flex items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-blue-800 dark:text-blue-200">
                                        Explore and test all API endpoints interactively with the <strong>Swagger UI</strong>.
                                    </p>
                                </div>
                                <a
                                    href="/docs/api"
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                                >
                                    Open API Explorer
                                </a>
                            </div>
                            <p className="mb-6 text-neutral-700 dark:text-neutral-300">
                                All endpoints are prefixed with <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">/api/v1</code>.
                                Authenticated endpoints require <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">Authorization: Bearer &lt;token&gt;</code>.
                            </p>

                            <div className="space-y-3">
                                <Endpoint method="POST" path="/api/v1/auth/token" description="Exchange email + password for a bearer token. No auth required." />
                                <Endpoint method="GET" path="/api/v1/user" description="Authenticated user info." />
                                <Endpoint method="GET" path="/api/v1/team" description="Current team info." />
                                <Endpoint method="GET" path="/api/v1/team/env" description="List team env vars." />
                                <Endpoint method="PUT" path="/api/v1/team/env" description="Batch set team env vars." />
                                <Endpoint method="DELETE" path="/api/v1/team/env/{KEY}" description="Delete team env var." />
                                <Endpoint method="GET" path="/api/v1/apps" description="List apps." />
                                <Endpoint method="POST" path="/api/v1/apps" description="Create app." />
                                <Endpoint method="GET" path="/api/v1/apps/{slug}" description="App details." />
                                <Endpoint method="DELETE" path="/api/v1/apps/{slug}" description="Delete app." />
                                <Endpoint method="POST" path="/api/v1/apps/{slug}/deploy" description="Deploy (tarball upload, multipart/form-data)." />
                                <Endpoint method="GET" path="/api/v1/apps/{slug}/logs" description="Access logs (last 100 entries)." />
                                <Endpoint method="GET" path="/api/v1/apps/{slug}/env" description="Merged env vars." />
                                <Endpoint method="PUT" path="/api/v1/apps/{slug}/env" description="Batch set app env vars." />
                                <Endpoint method="DELETE" path="/api/v1/apps/{slug}/env/{KEY}" description="Delete app env var." />
                            </div>
                        </section>

                        {/* HTTP status codes */}
                        <section className="scroll-mt-24">
                            <h2 className="mb-4 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">HTTP Status Codes</h2>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                        <th className="py-2 pr-4 text-left font-medium">Code</th>
                                        <th className="py-2 text-left font-medium">Meaning</th>
                                    </tr>
                                </thead>
                                <tbody className="text-neutral-600 dark:text-neutral-400">
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>200</code></td>
                                        <td className="py-2">Success</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>201</code></td>
                                        <td className="py-2">Created (new app, new token)</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>401</code></td>
                                        <td className="py-2">Unauthenticated — missing or invalid token</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>403</code></td>
                                        <td className="py-2">Forbidden — no permission (e.g., wrong team, not owner)</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>404</code></td>
                                        <td className="py-2">Resource not found</td>
                                    </tr>
                                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                        <td className="py-2 pr-4"><code>422</code></td>
                                        <td className="py-2">Validation error — check the <code>errors</code> object in the response</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4"><code>500</code></td>
                                        <td className="py-2">Server error</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <div className="border-t border-neutral-200 pt-8 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                            <p>PHPless &mdash; Serverless PHP on Firecracker microVMs.</p>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
