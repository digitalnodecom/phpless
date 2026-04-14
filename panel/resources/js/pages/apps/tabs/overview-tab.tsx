import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type App, type UptimeStats } from '@/types';
import { Activity, AlertTriangle, CheckCircle, Database, ExternalLink, Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className={`mt-1 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
        </div>
    );
}

function GetStartedCard({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-onboarding-dismissed-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-onboarding-dismissed-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-primary/30 bg-primary/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Rocket className="h-4 w-4" />
                    Get Started
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <p className="text-sm font-medium">Deploy via CLI</p>
                        <code className="bg-muted mt-1 block rounded px-3 py-2 text-xs">phpless init && phpless deploy</code>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Deploy via upload</p>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Upload a zip in the{' '}
                            <button onClick={() => document.querySelector<HTMLButtonElement>('[data-value="deployments"]')?.click()} className="text-primary underline underline-offset-2">
                                Deployments
                            </button>{' '}
                            tab.
                        </p>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Connect GitHub</p>
                        <p className="text-muted-foreground mt-1 text-sm">Coming soon — push to deploy.</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function FirstDeployBanner({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-first-deploy-seen-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    const hasSuccessfulDeploy = app.deployments?.some((d) => d.status === 'completed' || d.status === 'success');
    const isFirstDeploy = hasSuccessfulDeploy && (app.deployments?.filter((d) => d.status === 'completed' || d.status === 'success').length ?? 0) <= 1;

    if (dismissed || !isFirstDeploy) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-first-deploy-seen-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    const appUrl = `https://${app.slug}.phpless.digitalno.de`;

    return (
        <Card className="border-green-500/30 bg-green-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <CheckCircle className="h-6 w-6 shrink-0 text-green-500" />
                <div className="flex-1">
                    <p className="font-medium">Your app is live!</p>
                    <p className="text-muted-foreground text-sm">Visit it at {appUrl}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                    <a href={appUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Visit app
                    </a>
                </Button>
            </CardContent>
        </Card>
    );
}

function SqliteBackupBanner({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-sqlite-backup-banner-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    const unbackedDbs = (app.sqlite_databases ?? []).filter((db) => !db.backup_enabled);
    if (dismissed || unbackedDbs.length === 0) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-sqlite-backup-banner-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-blue-500/30 bg-blue-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <Database className="h-6 w-6 shrink-0 text-blue-500" />
                <div className="flex-1">
                    <p className="font-medium">SQLite database detected</p>
                    <p className="text-muted-foreground text-sm">
                        {unbackedDbs.length === 1
                            ? `Found at ${unbackedDbs[0].path}. Enable backups to protect your data.`
                            : `${unbackedDbs.length} databases found without backups enabled.`}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.querySelector<HTMLButtonElement>('[value="database"]')?.click()}
                >
                    Enable backups
                </Button>
            </CardContent>
        </Card>
    );
}

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function StatusDot({ isUp }: { isUp: boolean | null }) {
    if (isUp === null) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" title="Unknown" />;
    return isUp
        ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" title="Up" />
        : <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" title="Down" />;
}

function UptimeBar({ checks }: { checks: { is_up: boolean; checked_at: string }[] }) {
    if (checks.length === 0) return null;

    // Show last 30 checks as small bars
    const display = checks.slice(0, 30).reverse();

    return (
        <div className="flex items-end gap-px">
            {display.map((c, i) => (
                <div
                    key={i}
                    className={`h-6 w-1.5 rounded-sm ${c.is_up ? 'bg-green-500' : 'bg-red-500'}`}
                    title={`${c.is_up ? 'Up' : 'Down'} at ${new Date(c.checked_at).toLocaleString()}`}
                />
            ))}
        </div>
    );
}

function UptimeCard({ app }: { app: App }) {
    const [stats, setStats] = useState<UptimeStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUptime = async () => {
            try {
                const res = await fetch(`/api/v1/apps/${app.slug}/uptime`, {
                    headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                });
                if (res.ok) {
                    setStats(await res.json());
                }
            } catch { /* ignore */ }
            setLoading(false);
        };
        fetchUptime();
    }, [app.slug]);

    if (!app.health_check_enabled) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Uptime Monitoring
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
                        <span className="text-muted-foreground text-sm">Not monitored</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">
                        Enable health checks in Settings to monitor uptime.
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Uptime Monitoring
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">Loading...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Uptime Monitoring
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                    <StatusDot isUp={stats?.is_up ?? null} />
                    <span className="text-sm font-medium">
                        {stats?.is_up === true ? 'Up' : stats?.is_up === false ? 'Down' : 'Unknown'}
                    </span>
                    {stats?.last_check && (
                        <span className="text-muted-foreground text-xs">
                            Last checked: {new Date(stats.last_check.checked_at).toLocaleString()}
                        </span>
                    )}
                </div>

                {stats && stats.recent_checks.length > 0 && (
                    <UptimeBar checks={stats.recent_checks} />
                )}

                <div className="grid gap-4 md:grid-cols-4">
                    <div>
                        <p className="text-muted-foreground text-xs">Uptime (24h)</p>
                        <p className="text-lg font-semibold">
                            {stats?.uptime_24h != null ? `${stats.uptime_24h}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Uptime (7d)</p>
                        <p className="text-lg font-semibold">
                            {stats?.uptime_7d != null ? `${stats.uptime_7d}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Uptime (30d)</p>
                        <p className="text-lg font-semibold">
                            {stats?.uptime_30d != null ? `${stats.uptime_30d}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs">Avg Response (24h)</p>
                        <p className="text-lg font-semibold">
                            {stats?.avg_response_time_24h != null ? `${stats.avg_response_time_24h}ms` : '—'}
                        </p>
                    </div>
                </div>

                {stats?.last_check && (
                    <div className="text-muted-foreground text-xs">
                        Latest: {stats.last_check.response_time_ms}ms / HTTP {stats.last_check.status_code}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function WordPressSqliteWarning({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-wp-sqlite-warning-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    if (dismissed || app.detected_framework !== 'wordpress') return null;

    // Check if any SQLite database is detected (means configurator succeeded)
    const hasSqliteDb = (app.sqlite_databases ?? []).some((db) => db.path.includes('wp-content/database'));
    if (hasSqliteDb) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-wp-sqlite-warning-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-yellow-500/30 bg-yellow-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-500" />
                <div className="flex-1">
                    <p className="font-medium">WordPress SQLite plugin not configured</p>
                    <p className="text-muted-foreground text-sm">
                        WordPress was detected but the SQLite plugin could not be installed automatically.
                        Deploy again or install the <code className="text-xs">sqlite-database-integration</code> plugin manually.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

function WordPressSaltsWarning({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-wp-salts-warning-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    if (dismissed || app.detected_framework !== 'wordpress') return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-wp-salts-warning-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-amber-500/30 bg-amber-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                <div className="flex-1">
                    <p className="font-medium">Set WordPress security salts</p>
                    <p className="text-muted-foreground text-sm">
                        For security, set AUTH_KEY, SECURE_AUTH_KEY, LOGGED_IN_KEY, NONCE_KEY and their _SALT counterparts
                        in the Environment Variables tab. Generate unique values at{' '}
                        <a href="https://api.wordpress.org/secret-key/1.1/salt/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                            api.wordpress.org/secret-key
                        </a>.
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.querySelector<HTMLButtonElement>('[data-value="env"]')?.click()}
                >
                    Set env vars
                </Button>
            </CardContent>
        </Card>
    );
}

export default function OverviewTab({ app }: { app: App }) {
    const appUrl = `https://${app.slug}.phpless.digitalno.de`;

    return (
        <>
            <FirstDeployBanner app={app} />
            <WordPressSqliteWarning app={app} />
            <WordPressSaltsWarning app={app} />
            <SqliteBackupBanner app={app} />
            {(!app.deployments || app.deployments.length === 0) && <GetStartedCard app={app} />}
            <UptimeCard app={app} />
            <Card>
                <CardHeader>
                    <CardTitle>VM Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <InfoRow label="VM ID" value={app.vm_id || '-'} mono />
                        <InfoRow label="IP Address" value={app.vm_ip || '-'} mono />
                        <InfoRow label="vCPUs" value={String(app.vcpus)} />
                        <InfoRow label="Memory" value={`${app.mem_mib} MB`} />
                        <InfoRow label="PHP Version" value={app.php_version} />
                        <InfoRow label="URL" value={appUrl} mono />
                    </div>
                    <Separator />
                    <div className="grid gap-4 md:grid-cols-2">
                        <InfoRow label="Slug" value={app.slug} mono />
                        <InfoRow label="Created" value={new Date(app.created_at).toLocaleString()} />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
