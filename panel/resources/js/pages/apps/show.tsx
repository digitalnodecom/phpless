import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { type AnalyticsSummary, type App, type BreadcrumbItem, type LogEntry, type RequestMetric } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Activity, BarChart3, Code2, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

function stateVariant(state: string) {
    switch (state) {
        case 'running':
            return 'default' as const;
        case 'creating':
        case 'starting':
            return 'secondary' as const;
        case 'stopped':
            return 'outline' as const;
        default:
            return 'destructive' as const;
    }
}

function statusColor(status: number): string {
    if (status >= 500) return 'text-red-500';
    if (status >= 400) return 'text-orange-500';
    if (status >= 300) return 'text-yellow-500';
    if (status >= 200) return 'text-green-500';
    return 'text-muted-foreground';
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
    if (seconds < 0.001) return '<1ms';
    if (seconds < 1) return Math.round(seconds * 1000) + 'ms';
    return seconds.toFixed(2) + 's';
}

// Simple bar chart using SVG
function MetricsChart({ metrics }: { metrics: RequestMetric[] }) {
    if (metrics.length === 0) {
        return <p className="text-muted-foreground py-8 text-center text-sm">No data yet</p>;
    }

    const maxRequests = Math.max(...metrics.map((m) => m.requests), 1);
    const chartHeight = 160;
    const barWidth = Math.max(4, Math.min(20, Math.floor(600 / metrics.length) - 2));

    return (
        <div className="overflow-x-auto">
            <svg width={Math.max(600, metrics.length * (barWidth + 2))} height={chartHeight + 30} className="w-full">
                {metrics.map((m, i) => {
                    const height = (m.requests / maxRequests) * chartHeight;
                    const x = i * (barWidth + 2);
                    const errorHeight = ((m.status_4xx + m.status_5xx) / maxRequests) * chartHeight;

                    return (
                        <g key={m.id}>
                            <title>
                                {new Date(m.period).toLocaleString()}: {m.requests} requests
                            </title>
                            <rect
                                x={x}
                                y={chartHeight - height}
                                width={barWidth}
                                height={height}
                                className="fill-primary/70"
                                rx={1}
                            />
                            {errorHeight > 0 && (
                                <rect
                                    x={x}
                                    y={chartHeight - errorHeight}
                                    width={barWidth}
                                    height={errorHeight}
                                    className="fill-red-500/70"
                                    rx={1}
                                />
                            )}
                        </g>
                    );
                })}
                {/* X-axis labels — show a few timestamps */}
                {metrics
                    .filter((_, i) => i % Math.max(1, Math.floor(metrics.length / 6)) === 0)
                    .map((m, i, arr) => {
                        const idx = metrics.indexOf(m);
                        const x = idx * (barWidth + 2);
                        return (
                            <text key={i} x={x} y={chartHeight + 16} className="fill-muted-foreground text-[10px]">
                                {new Date(m.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })}
                            </text>
                        );
                    })}
            </svg>
        </div>
    );
}

function AnalyticsTab({ appId }: { appId: number }) {
    const [metrics, setMetrics] = useState<RequestMetric[]>([]);
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAnalytics = useCallback(() => {
        setLoading(true);
        fetch(`/apps/${appId}/analytics`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setMetrics(data.metrics || []);
                setSummary(data.summary || null);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [appId]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <p className="text-muted-foreground text-center text-sm">Loading analytics...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">Requests (7d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{summary?.total_requests?.toLocaleString() ?? 0}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">Avg Response Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{summary ? formatDuration(summary.avg_duration) : '-'}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">Error Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-2xl font-bold ${(summary?.error_rate ?? 0) > 5 ? 'text-red-500' : ''}`}>
                            {summary?.error_rate ?? 0}%
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-muted-foreground text-sm font-medium">Bandwidth (7d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{formatBytes(summary?.total_bytes ?? 0)}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Requests Over Time
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={fetchAnalytics}>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    <MetricsChart metrics={metrics} />
                </CardContent>
            </Card>

            {metrics.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Status Code Breakdown (7d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-4">
                            <div>
                                <span className="text-muted-foreground text-sm">2xx Success</span>
                                <p className="text-lg font-semibold text-green-500">{metrics.reduce((a, m) => a + m.status_2xx, 0).toLocaleString()}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-sm">3xx Redirect</span>
                                <p className="text-lg font-semibold text-yellow-500">{metrics.reduce((a, m) => a + m.status_3xx, 0).toLocaleString()}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-sm">4xx Client Error</span>
                                <p className="text-lg font-semibold text-orange-500">{metrics.reduce((a, m) => a + m.status_4xx, 0).toLocaleString()}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-sm">5xx Server Error</span>
                                <p className="text-lg font-semibold text-red-500">{metrics.reduce((a, m) => a + m.status_5xx, 0).toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function LogsTab({ appId }: { appId: number }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLogs = useCallback(() => {
        fetch(`/apps/${appId}/logs`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setLogs(data.logs || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [appId]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(fetchLogs, 5000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoRefresh, fetchLogs]);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Recent Requests
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Button
                        variant={autoRefresh ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        {autoRefresh ? 'Stop Auto-Refresh' : 'Auto-Refresh'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={fetchLogs}>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Refresh
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">Loading logs...</p>
                ) : logs.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">No requests logged yet. Visit your app to generate some traffic.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-muted-foreground border-b text-left text-xs">
                                    <th className="pb-2 pr-4">Time</th>
                                    <th className="pb-2 pr-4">Method</th>
                                    <th className="pb-2 pr-4">Path</th>
                                    <th className="pb-2 pr-4">Status</th>
                                    <th className="pb-2 pr-4">Duration</th>
                                    <th className="pb-2 pr-4">Size</th>
                                    <th className="pb-2">Client IP</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {logs.slice().reverse().map((log, i) => (
                                    <tr key={i} className="border-b last:border-0">
                                        <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">{log.timestamp}</td>
                                        <td className="py-1.5 pr-4 font-medium">{log.method}</td>
                                        <td className="max-w-[300px] truncate py-1.5 pr-4">{log.path}</td>
                                        <td className={`py-1.5 pr-4 font-medium ${statusColor(log.status)}`}>{log.status}</td>
                                        <td className="py-1.5 pr-4 whitespace-nowrap">{log.duration}ms</td>
                                        <td className="py-1.5 pr-4 whitespace-nowrap">{formatBytes(log.size)}</td>
                                        <td className="text-muted-foreground py-1.5">{log.client_ip}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function AppsShow({ app }: { app: App }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Apps', href: '/apps' },
        { title: app.name, href: `/apps/${app.id}` },
    ];

    const appUrl = `https://${app.slug}.phpless.digitalno.de`;

    function handleDelete() {
        router.delete(`/apps/${app.id}`);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={app.name} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{app.name}</h1>
                        <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" asChild>
                            <a href={`/apps/${app.id}/code`}>
                                <Code2 className="mr-2 h-4 w-4" />
                                Edit Code
                            </a>
                        </Button>
                        {app.vm_state === 'running' && (
                            <Button variant="outline" asChild>
                                <a href={appUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Visit
                                </a>
                            </Button>
                        )}
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently destroy the VM and all associated data. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>

                <Tabs defaultValue="overview">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                        <TabsTrigger value="deployments">Deployments</TabsTrigger>
                        <TabsTrigger value="domains">Domains</TabsTrigger>
                        <TabsTrigger value="environment">Environment</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
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
                    </TabsContent>

                    <TabsContent value="analytics" className="mt-4">
                        <AnalyticsTab appId={app.id} />
                    </TabsContent>

                    <TabsContent value="logs" className="mt-4">
                        <LogsTab appId={app.id} />
                    </TabsContent>

                    <TabsContent value="deployments" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Deployments</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground text-sm">
                                    Git-based deployments will be available in the next update. Connect a GitHub repository to enable automatic deployments.
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="domains" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Domains</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground text-sm">
                                    Custom domain management will be available in a future update. Your app is currently available at{' '}
                                    <a href={appUrl} target="_blank" rel="noopener noreferrer" className="font-mono underline">
                                        {appUrl}
                                    </a>
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="environment" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Environment Variables</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground text-sm">
                                    Environment variable management will be available in the next update.
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className={`mt-1 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
        </div>
    );
}
