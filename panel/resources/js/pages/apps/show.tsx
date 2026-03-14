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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type AnalyticsSummary, type App, type BreadcrumbItem, type Domain, type EnvironmentVariable, type FileItem, type LogEntry, type RequestMetric, type WorkerDef, type WorkerStatus } from '@/types';
import { Head, router } from '@inertiajs/react';
import { toast } from 'sonner';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Activity, BarChart3, CheckCircle, ChevronRight, Clock, Copy, Download, Eye, EyeOff, ExternalLink, File as FileIcon, Folder, FolderOpen, Globe, Lock, LockOpen, Pencil, Plus, RefreshCw, Rocket, Server, Terminal as TerminalIcon, Trash2, Upload, Zap } from 'lucide-react';
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

// Simple bar chart using SVG with hover tooltip
function MetricsChart({ metrics }: { metrics: RequestMetric[] }) {
    const [hovered, setHovered] = useState<{ metric: RequestMetric; x: number; y: number } | null>(null);

    if (metrics.length === 0) {
        return <p className="text-muted-foreground py-8 text-center text-sm">No data yet</p>;
    }

    const maxRequests = Math.max(...metrics.map((m) => m.requests), 1);
    const chartHeight = 160;
    const barWidth = Math.max(4, Math.min(20, Math.floor(600 / metrics.length) - 2));
    const chartWidth = Math.max(600, metrics.length * (barWidth + 2));

    // Show 3-5 evenly spaced axis labels
    const labelCount = Math.min(5, metrics.length);
    const labelStep = Math.max(1, Math.floor((metrics.length - 1) / (labelCount - 1)));

    return (
        <div className="relative overflow-x-auto" onMouseLeave={() => setHovered(null)}>
            <svg width={chartWidth} height={chartHeight + 28} className="w-full">
                {metrics.map((m, i) => {
                    const height = (m.requests / maxRequests) * chartHeight;
                    const x = i * (barWidth + 2);
                    const errorHeight = ((m.status_4xx + m.status_5xx) / maxRequests) * chartHeight;

                    return (
                        <g
                            key={m.id}
                            onMouseEnter={(e) => {
                                const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
                                setHovered({ metric: m, x: e.clientX - rect.left, y: e.clientY - rect.top });
                            }}
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
                                setHovered({ metric: m, x: e.clientX - rect.left, y: e.clientY - rect.top });
                            }}
                            className="cursor-crosshair"
                        >
                            {/* Invisible hit area for easier hover */}
                            <rect x={x} y={0} width={barWidth + 2} height={chartHeight} fill="transparent" />
                            <rect
                                x={x}
                                y={chartHeight - height}
                                width={barWidth}
                                height={height}
                                className={hovered?.metric.id === m.id ? 'fill-primary' : 'fill-primary/70'}
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
                {/* X-axis: sparse labels */}
                {Array.from({ length: labelCount }, (_, i) => {
                    const idx = i === labelCount - 1 ? metrics.length - 1 : i * labelStep;
                    const m = metrics[idx];
                    if (!m) return null;
                    const x = idx * (barWidth + 2);
                    const d = new Date(m.period);
                    return (
                        <text key={idx} x={x} y={chartHeight + 18} className="fill-muted-foreground" style={{ fontSize: 10 }}>
                            {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </text>
                    );
                })}
            </svg>
            {/* Floating tooltip */}
            {hovered && (
                <div
                    className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border px-3 py-1.5 shadow-md"
                    style={{ left: Math.min(hovered.x, chartWidth - 180), top: Math.max(0, hovered.y - 48) }}
                >
                    <p className="text-xs font-medium">{new Date(hovered.metric.period).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    <p className="text-muted-foreground text-xs">
                        {hovered.metric.requests.toLocaleString()} requests
                        {hovered.metric.status_4xx + hovered.metric.status_5xx > 0 && (
                            <span className="text-red-500"> ({hovered.metric.status_4xx + hovered.metric.status_5xx} errors)</span>
                        )}
                    </p>
                </div>
            )}
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
    const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLogs = useCallback(() => {
        fetch(`/apps/${appId}/logs`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setLogs(data.logs || []);
                setConsoleLogs(data.console_logs || []);
            })
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
        <div className="space-y-4">
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

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <TerminalIcon className="h-4 w-4" />
                        VM Console (FrankenPHP)
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={fetchLogs}>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">Loading...</p>
                    ) : consoleLogs.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">No console output yet. Deploy your app to see startup logs.</p>
                    ) : (
                        <pre className="bg-muted/50 max-h-96 overflow-y-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                            {consoleLogs.join('\n')}
                        </pre>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function EnvironmentTab({ app }: { app: App }) {
    const [appVars, setAppVars] = useState<EnvironmentVariable[]>([]);
    const [teamVars, setTeamVars] = useState<EnvironmentVariable[]>([]);
    const [loading, setLoading] = useState(true);
    const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingVar, setEditingVar] = useState<EnvironmentVariable | null>(null);
    const [deletingVar, setDeletingVar] = useState<EnvironmentVariable | null>(null);
    const [formKey, setFormKey] = useState('');
    const [formValue, setFormValue] = useState('');
    const [formSecret, setFormSecret] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [deploying, setDeploying] = useState(false);

    const fetchVars = useCallback(() => {
        setLoading(true);
        fetch(`/apps/${app.id}/env`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setAppVars(data.app_vars || []);
                setTeamVars(data.team_vars || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchVars();
    }, [fetchVars]);

    const toggleReveal = (id: number) => {
        setRevealedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const openAdd = () => {
        setFormKey('');
        setFormValue('');
        setFormSecret(false);
        setFormErrors({});
        setShowAddDialog(true);
    };

    const openEdit = (v: EnvironmentVariable) => {
        setEditingVar(v);
        setFormValue(v.is_secret ? '' : v.value);
        setFormSecret(v.is_secret);
        setFormErrors({});
    };

    const handleAdd = async () => {
        setSaving(true);
        setFormErrors({});
        try {
            const res = await fetch(`/apps/${app.id}/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ key: formKey, value: formValue, is_secret: formSecret }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setShowAddDialog(false);
            setHasChanges(true);
            fetchVars();
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!editingVar) return;
        setSaving(true);
        setFormErrors({});
        try {
            const res = await fetch(`/apps/${app.id}/env/${editingVar.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ value: formValue, is_secret: formSecret }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setEditingVar(null);
            setHasChanges(true);
            fetchVars();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingVar) return;
        await fetch(`/apps/${app.id}/env/${deletingVar.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
        });
        setDeletingVar(null);
        setHasChanges(true);
        fetchVars();
    };

    // Merge for display: team vars first, then app vars override
    const mergedMap = new Map<string, EnvironmentVariable>();
    for (const v of teamVars) mergedMap.set(v.key, v);
    for (const v of appVars) mergedMap.set(v.key, v);
    const merged = Array.from(mergedMap.values()).sort((a, b) => a.key.localeCompare(b.key));

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <p className="text-muted-foreground text-center text-sm">Loading environment variables...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {hasChanges && (
                <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="text-sm font-medium">Environment variables have been updated. Deploy now to apply changes.</p>
                    <Button size="sm" disabled={deploying} onClick={() => {
                        setDeploying(true);
                        router.post(`/apps/${app.id}/deploy`, {}, {
                            onSuccess: () => { setHasChanges(false); toast.success('Deployed successfully.'); },
                            onError: (errors) => toast.error(errors.deploy || 'Deploy failed.'),
                            onFinish: () => setDeploying(false),
                        });
                    }}>
                        <Rocket className={`mr-2 h-3 w-3 ${deploying ? 'animate-spin' : ''}`} />
                        {deploying ? 'Deploying…' : 'Deploy Now'}
                    </Button>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Environment Variables</CardTitle>
                    <Button size="sm" onClick={openAdd}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add Variable
                    </Button>
                </CardHeader>
                <CardContent>
                    {merged.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            No environment variables configured. Add variables to inject them into your app's runtime.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Key</th>
                                        <th className="pb-2 pr-4">Value</th>
                                        <th className="pb-2 pr-4">Source</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {merged.map((v) => (
                                        <tr key={`${v.source}-${v.id}`} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs font-medium">{v.key}</td>
                                            <td className="py-2 pr-4 font-mono text-xs">
                                                {v.is_secret ? (
                                                    <span className="flex items-center gap-2">
                                                        {revealedIds.has(v.id) ? v.value || '(encrypted)' : '********'}
                                                        <button onClick={() => toggleReveal(v.id)} className="text-muted-foreground hover:text-foreground">
                                                            {revealedIds.has(v.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="max-w-[300px] truncate">{v.value}</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge variant={v.source === 'app' ? 'default' : 'secondary'}>{v.source === 'app' ? 'App' : 'Team'}</Badge>
                                            </td>
                                            <td className="py-2">
                                                {v.source === 'app' && (
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => setDeletingVar(v)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Environment Variable</DialogTitle>
                        <DialogDescription>Add an app-level environment variable. It will be injected as a key-value pair in the .env file.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="env-key">Key</Label>
                            <Input
                                id="env-key"
                                placeholder="MY_API_KEY"
                                value={formKey}
                                onChange={(e) => setFormKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                className="font-mono"
                            />
                            {formErrors.key && <p className="mt-1 text-xs text-red-500">{formErrors.key[0]}</p>}
                        </div>
                        <div>
                            <Label htmlFor="env-value">Value</Label>
                            <Textarea id="env-value" placeholder="Enter value..." value={formValue} onChange={(e) => setFormValue(e.target.value)} rows={3} className="font-mono" />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="env-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="env-secret" className="text-sm font-normal">
                                Mark as secret (value will be masked in the UI)
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAdd} disabled={saving || !formKey || !formValue}>
                            {saving ? 'Adding...' : 'Add Variable'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingVar} onOpenChange={(open) => !open && setEditingVar(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Environment Variable</DialogTitle>
                        <DialogDescription>
                            Update the value for <span className="font-mono font-semibold">{editingVar?.key}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="edit-value">Value</Label>
                            <Textarea
                                id="edit-value"
                                placeholder="Enter new value..."
                                value={formValue}
                                onChange={(e) => setFormValue(e.target.value)}
                                rows={3}
                                className="font-mono"
                            />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="edit-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="edit-secret" className="text-sm font-normal">
                                Mark as secret
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingVar(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={saving || !formValue}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingVar} onOpenChange={(open) => !open && setDeletingVar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deletingVar?.key}?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove this environment variable. You'll need to redeploy for changes to take effect.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function DomainsTab({ app, serverIp }: { app: App; serverIp: string }) {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [formDomain, setFormDomain] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [verifying, setVerifying] = useState<number | null>(null);
    const [deletingDomain, setDeletingDomain] = useState<Domain | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const fetchDomains = useCallback(() => {
        setLoading(true);
        fetch(`/apps/${app.id}/domains`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setDomains(data.domains || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchDomains();
    }, [fetchDomains]);

    const handleAdd = async () => {
        setSaving(true);
        setFormErrors({});
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ domain: formDomain }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setShowAddDialog(false);
            setFormDomain('');
            fetchDomains();
        } finally {
            setSaving(false);
        }
    };

    const handleVerify = async (domain: Domain) => {
        setVerifying(domain.id);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/domains/${domain.id}/verify`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Domain verified!', type: 'success' });
                fetchDomains();
            } else {
                setMessage({ text: data.message || 'DNS verification failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to verify domain.', type: 'error' });
        } finally {
            setVerifying(null);
        }
    };

    const handleDelete = async () => {
        if (!deletingDomain) return;
        await fetch(`/apps/${app.id}/domains/${deletingDomain.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
        });
        setDeletingDomain(null);
        setMessage(null);
        fetchDomains();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8">
                    <p className="text-muted-foreground text-center text-sm">Loading domains...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Custom Domains
                    </CardTitle>
                    <Button size="sm" onClick={() => { setFormDomain(''); setFormErrors({}); setShowAddDialog(true); }}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add Domain
                    </Button>
                </CardHeader>
                <CardContent>
                    {domains.length === 0 ? (
                        <div className="py-4 text-center">
                            <p className="text-muted-foreground text-sm">
                                No custom domains configured. Your app is available at{' '}
                                <a href={`https://${app.slug}.phpless.digitalno.de`} target="_blank" rel="noopener noreferrer" className="font-mono underline">
                                    {app.slug}.phpless.digitalno.de
                                </a>
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Domain</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2 pr-4">Added</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {domains.map((d) => (
                                        <tr key={d.id} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs font-medium">{d.domain}</td>
                                            <td className="py-2 pr-4">
                                                {d.dns_verified ? (
                                                    <Badge variant="default" className="gap-1">
                                                        <CheckCircle className="h-3 w-3" />
                                                        Verified
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Pending DNS
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
                                            <td className="py-2">
                                                <div className="flex items-center gap-1">
                                                    {!d.dns_verified && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleVerify(d)}
                                                            disabled={verifying === d.id}
                                                        >
                                                            <RefreshCw className={`mr-1 h-3 w-3 ${verifying === d.id ? 'animate-spin' : ''}`} />
                                                            {verifying === d.id ? 'Verifying...' : 'Verify DNS'}
                                                        </Button>
                                                    )}
                                                    {d.dns_verified && (
                                                        <Button variant="outline" size="sm" asChild>
                                                            <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer">
                                                                <ExternalLink className="mr-1 h-3 w-3" />
                                                                Visit
                                                            </a>
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={() => setDeletingDomain(d)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DNS Instructions */}
            {domains.some((d) => !d.dns_verified) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">DNS Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-muted-foreground text-sm">
                            Point your domain to PHPless by adding one of the following DNS records at your domain registrar:
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-xs font-medium">Option 1: A Record</p>
                                    <p className="font-mono text-sm">A &rarr; {serverIp}</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(serverIp)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-xs font-medium">Option 2: CNAME Record</p>
                                    <p className="font-mono text-sm">CNAME &rarr; {app.slug}.phpless.digitalno.de</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${app.slug}.phpless.digitalno.de`)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-muted-foreground text-xs">
                            DNS changes can take up to 48 hours to propagate, but usually take only a few minutes. Click "Verify DNS" once your records are set.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Add Domain Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Custom Domain</DialogTitle>
                        <DialogDescription>Enter the domain you want to point to this app. You'll need to configure DNS after adding it.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="domain-input">Domain</Label>
                            <Input
                                id="domain-input"
                                placeholder="example.com"
                                value={formDomain}
                                onChange={(e) => setFormDomain(e.target.value.toLowerCase())}
                                className="font-mono"
                            />
                            {formErrors.domain && <p className="mt-1 text-xs text-red-500">{formErrors.domain[0]}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={saving || !formDomain}>
                            {saving ? 'Adding...' : 'Add Domain'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingDomain} onOpenChange={(open) => !open && setDeletingDomain(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {deletingDomain?.domain}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the custom domain and its SSL certificate. Traffic to this domain will no longer be routed to your app.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Remove Domain</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function SettingsTab({ app }: { app: App }) {
    const [workerMode, setWorkerMode] = useState(app.worker_mode);
    const [workerScript, setWorkerScript] = useState(app.worker_script);
    const [workerCount, setWorkerCount] = useState(app.worker_count);
    const [mercureEnabled, setMercureEnabled] = useState(app.mercure_enabled);
    const [webRoot, setWebRoot] = useState(app.web_root || '/');
    const [vcpus, setVcpus] = useState(String(app.vcpus));
    const [memMib, setMemMib] = useState(String(app.mem_mib));
    const [saving, setSaving] = useState(false);
    const [generatingKeys, setGeneratingKeys] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const vmSizeChanged = vcpus !== String(app.vcpus) || memMib !== String(app.mem_mib);
    const hasChanges =
        workerMode !== app.worker_mode ||
        workerScript !== app.worker_script ||
        workerCount !== app.worker_count ||
        mercureEnabled !== app.mercure_enabled ||
        webRoot !== (app.web_root || '/') ||
        vmSizeChanged;

    const handleGenerateKeys = async () => {
        setGeneratingKeys(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/generate-mercure-keys`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'JWT keys generated. Redeploy to apply.', type: 'success' });
            } else {
                setMessage({ text: data.message || 'Failed to generate keys.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to generate keys.', type: 'error' });
        } finally {
            setGeneratingKeys(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({
                    worker_mode: workerMode,
                    worker_script: workerScript,
                    worker_count: workerCount,
                    mercure_enabled: mercureEnabled,
                    web_root: webRoot,
                    vcpus: parseInt(vcpus),
                    mem_mib: parseInt(memMib),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setMessage({ text: data.message || 'Settings saved.', type: 'success' });
                router.reload({ only: ['app'] });
            } else {
                const data = await res.json();
                setMessage({ text: data.message || 'Failed to save settings.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to save settings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        VM Resources
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="settings-mem">Memory</Label>
                            <Select value={memMib} onValueChange={setMemMib}>
                                <SelectTrigger id="settings-mem">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="256">256 MB</SelectItem>
                                    <SelectItem value="512">512 MB</SelectItem>
                                    <SelectItem value="1024">1024 MB</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="settings-vcpus">vCPUs</Label>
                            <Select value={vcpus} onValueChange={setVcpus}>
                                <SelectTrigger id="settings-vcpus">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 vCPU</SelectItem>
                                    <SelectItem value="2">2 vCPUs</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {vmSizeChanged && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-500">
                            Changing VM resources will destroy and recreate the VM with your code redeployed automatically.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Web Root
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-2">
                        <Label htmlFor="web-root">Document root directory</Label>
                        <Input
                            id="web-root"
                            value={webRoot}
                            onChange={(e) => setWebRoot(e.target.value)}
                            placeholder="public"
                            className="max-w-sm font-mono"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['/', 'public', 'public_html'].map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setWebRoot(preset)}
                                className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                                    webRoot === preset
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:border-primary/50'
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <p className="text-muted-foreground text-xs">
                        The directory inside your app served as the document root. Use <code className="bg-muted rounded px-1 py-0.5">/</code> for flat PHP apps,{' '}
                        <code className="bg-muted rounded px-1 py-0.5">public</code> for Laravel/Slim,{' '}
                        or <code className="bg-muted rounded px-1 py-0.5">public_html</code> for WordPress/Bedrock. Requires redeploy.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Worker Mode
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="worker-mode"
                            checked={workerMode}
                            onCheckedChange={(v) => setWorkerMode(v === true)}
                        />
                        <Label htmlFor="worker-mode" className="text-sm font-normal">
                            Enable worker mode
                        </Label>
                    </div>

                    {workerMode && (
                        <div className="space-y-3 pl-6">
                            <div>
                                <Label htmlFor="worker-script">Worker script</Label>
                                <Input
                                    id="worker-script"
                                    value={workerScript}
                                    onChange={(e) => setWorkerScript(e.target.value)}
                                    placeholder="public/index.php"
                                    className="mt-1 max-w-sm font-mono"
                                />
                            </div>
                            <div>
                                <Label htmlFor="worker-count">Worker count</Label>
                                <Input
                                    id="worker-count"
                                    type="number"
                                    min={1}
                                    max={16}
                                    value={workerCount}
                                    onChange={(e) => setWorkerCount(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)))}
                                    className="mt-1 max-w-[100px]"
                                />
                            </div>
                        </div>
                    )}

                    <p className="text-muted-foreground text-xs">
                        Worker mode keeps your PHP script in memory for faster response times. Your entry script must use{' '}
                        <code className="bg-muted rounded px-1 py-0.5">frankenphp_handle_request()</code>. Compatible with Laravel Octane.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Mercure (Real-time Push)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="mercure-enabled"
                            checked={mercureEnabled}
                            onCheckedChange={(v) => setMercureEnabled(v === true)}
                        />
                        <Label htmlFor="mercure-enabled" className="text-sm font-normal">
                            Enable Mercure
                        </Label>
                    </div>

                    {mercureEnabled && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateKeys}
                            disabled={generatingKeys}
                        >
                            <RefreshCw className={`mr-2 h-3 w-3 ${generatingKeys ? 'animate-spin' : ''}`} />
                            {generatingKeys ? 'Generating...' : 'Generate JWT Keys'}
                        </Button>
                    )}

                    <p className="text-muted-foreground text-xs">
                        Enables real-time push via Server-Sent Events. Use the button above to auto-generate{' '}
                        <code className="bg-muted rounded px-1 py-0.5">MERCURE_PUBLISHER_JWT_KEY</code> and{' '}
                        <code className="bg-muted rounded px-1 py-0.5">MERCURE_SUBSCRIBER_JWT_KEY</code>, or set them manually in the Environment tab.
                    </p>
                </CardContent>
            </Card>

            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving || !hasChanges}>
                    {saving ? (vmSizeChanged ? 'Resizing VM...' : 'Saving...') : 'Save Settings'}
                </Button>
                {hasChanges && (
                    <p className="text-muted-foreground text-sm">You have unsaved changes.</p>
                )}
            </div>

            <PortForwardingCard app={app} />
        </div>
    );
}

function DeployTab({ app }: { app: App }) {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    const installCmd = 'brew install phpless-cli';
    const deployCmd = `phpless deploy . --app ${app.slug}`;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TerminalIcon className="h-4 w-4" />
                        Deploy via CLI
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                        Deploy your PHP app from your local machine using the PHPless CLI.
                    </p>
                    <div className="space-y-2">
                        <p className="text-xs font-medium">1. Install the CLI</p>
                        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                            <code className="font-mono text-sm">{installCmd}</code>
                            <Button variant="ghost" size="sm" onClick={() => copy(installCmd, 'install')}>
                                {copied === 'install' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                        <p className="text-xs font-medium">2. Deploy your app</p>
                        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                            <code className="font-mono text-sm">{deployCmd}</code>
                            <Button variant="ghost" size="sm" onClick={() => copy(deployCmd, 'deploy')}>
                                {copied === 'deploy' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rocket className="h-4 w-4" />
                        Deployment History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!app.deployments || app.deployments.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">No deployments yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2 pr-4">Source</th>
                                        <th className="pb-2 pr-4">Message</th>
                                        <th className="pb-2 pr-4">By</th>
                                        <th className="pb-2 pr-4">Deployed</th>
                                        <th className="pb-2">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {app.deployments.map((d) => (
                                        <tr key={d.id} className="border-b last:border-0">
                                            <td className="py-2 pr-4">
                                                <Badge variant={d.status === 'succeeded' ? 'default' : d.status === 'failed' ? 'destructive' : 'secondary'}>
                                                    {d.status}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    {d.source ?? 'api'}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4 text-xs">{d.commit_message || '-'}</td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                                                {d.triggered_by?.name ?? '—'}
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                                                {d.created_at ? new Date(d.created_at).toLocaleString() : '-'}
                                            </td>
                                            <td className="text-muted-foreground py-2 text-xs whitespace-nowrap">
                                                {d.started_at && d.completed_at
                                                    ? Math.round((new Date(d.completed_at).getTime() - new Date(d.started_at).getTime()) / 1000) + 's'
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function FileBrowserTab({ app, currentPath, onNavigate }: { app: App; currentPath: string; onNavigate: (path: string) => void }) {
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showWriteDialog, setShowWriteDialog] = useState(false);
    const [writePath, setWritePath] = useState('');
    const [writeContent, setWriteContent] = useState('');
    const [writing, setWriting] = useState(false);
    const [deletingItem, setDeletingItem] = useState<FileItem | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchItems = useCallback((path: string) => {
        setLoading(true);
        const url = `/apps/${app.id}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setItems(data.items || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchItems(currentPath);
    }, [fetchItems, currentPath]);

    const navigate = (path: string) => {
        onNavigate(path);
        setMessage(null);
    };

    // Breadcrumb segments: ['', 'storage', 'framework'] from currentPath
    const breadcrumbSegments = currentPath ? currentPath.split('/') : [];

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            formData.append('path', uploadPath);
            const res = await fetch(`/apps/${app.id}/files/upload`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'File uploaded.', type: 'success' });
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Upload failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Upload failed.', type: 'error' });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleWrite = async () => {
        setWriting(true);
        setMessage(null);
        try {
            const fullPath = currentPath ? `${currentPath}/${writePath}` : writePath;
            const res = await fetch(`/apps/${app.id}/files/write`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ path: fullPath, content: writeContent }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'File saved.', type: 'success' });
                setShowWriteDialog(false);
                setWritePath('');
                setWriteContent('');
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Failed to save file.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to save file.', type: 'error' });
        } finally {
            setWriting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingItem) return;
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/files?path=${encodeURIComponent(deletingItem.path)}`, {
                method: 'DELETE',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Deleted.', type: 'success' });
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Delete failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Delete failed.', type: 'error' });
        } finally {
            setDeletingItem(null);
        }
    };

    const handleTogglePersistent = async (item: FileItem) => {
        const res = await fetch(`/apps/${app.id}/files/persistent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ path: item.path, persistent: !item.is_persistent }),
        });
        if (res.ok) {
            fetchItems(currentPath);
        }
    };

    const handleDownload = (item: FileItem) => {
        window.open(`/apps/${app.id}/files/download?path=${encodeURIComponent(item.path)}`);
    };

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-1 font-mono text-sm">
                        <button
                            onClick={() => navigate('')}
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                            <FolderOpen className="h-4 w-4" />
                            <span>app</span>
                        </button>
                        {breadcrumbSegments.map((seg, i) => {
                            const path = breadcrumbSegments.slice(0, i + 1).join('/');
                            return (
                                <span key={path} className="flex items-center gap-1">
                                    <ChevronRight className="text-muted-foreground h-3 w-3" />
                                    <button
                                        onClick={() => navigate(path)}
                                        className={i === breadcrumbSegments.length - 1
                                            ? 'text-foreground font-medium'
                                            : 'text-muted-foreground hover:text-foreground'}
                                    >
                                        {seg}
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setWritePath(''); setWriteContent(''); setShowWriteDialog(true); }}>
                            <Plus className="mr-1 h-3 w-3" />
                            New File
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            <Upload className="mr-1 h-3 w-3" />
                            {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                        <Button variant="ghost" size="sm" onClick={() => fetchItems(currentPath)}>
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">Loading...</p>
                    ) : items.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            {currentPath ? 'Empty directory.' : 'No files yet. Deploy your app to see files here.'}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">Size</th>
                                        <th className="pb-2 pr-4">Modified</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-xs">
                                    {items.map((item) => (
                                        <tr key={item.path} className="border-b last:border-0">
                                            <td className="py-1.5 pr-4">
                                                {item.type === 'dir' ? (
                                                    <button
                                                        onClick={() => navigate(item.path)}
                                                        className="hover:text-primary flex cursor-pointer items-center gap-1.5"
                                                    >
                                                        <Folder className="h-3.5 w-3.5 text-blue-400" />
                                                        {item.name}/
                                                    </button>
                                                ) : (
                                                    <span className="flex items-center gap-1.5">
                                                        <FileIcon className="text-muted-foreground h-3.5 w-3.5" />
                                                        {item.name}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">
                                                {item.type === 'dir' ? '—' : formatBytes(item.size)}
                                            </td>
                                            <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">{item.modified_at}</td>
                                            <td className="py-1.5">
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleTogglePersistent(item)}
                                                        title={item.is_persistent ? 'Persistent (survives redeploys — click to unpin)' : 'Not persistent (click to pin)'}
                                                    >
                                                        {item.is_persistent
                                                            ? <Lock className="h-3 w-3 text-amber-500" />
                                                            : <LockOpen className="text-muted-foreground h-3 w-3" />
                                                        }
                                                    </Button>
                                                    {item.type === 'file' && (
                                                        <Button variant="ghost" size="sm" onClick={() => handleDownload(item)} title="Download">
                                                            <Download className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={() => setDeletingItem(item)} title="Delete">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* New File Dialog */}
            <Dialog open={showWriteDialog} onOpenChange={setShowWriteDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New Text File</DialogTitle>
                        <DialogDescription>
                            Create or overwrite a file.{currentPath && <> Path will be relative to <code className="font-mono">{currentPath}/</code>.</>}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="write-path">Filename</Label>
                            <Input
                                id="write-path"
                                placeholder="index.php"
                                value={writePath}
                                onChange={(e) => setWritePath(e.target.value)}
                                className="font-mono"
                            />
                        </div>
                        <div>
                            <Label htmlFor="write-content">Content</Label>
                            <Textarea
                                id="write-content"
                                placeholder="<?php echo 'Hello world';"
                                value={writeContent}
                                onChange={(e) => setWriteContent(e.target.value)}
                                rows={8}
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowWriteDialog(false)}>Cancel</Button>
                        <Button onClick={handleWrite} disabled={writing || !writePath.trim()}>
                            {writing ? 'Saving...' : 'Save File'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deletingItem?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove <code className="font-mono">{deletingItem?.path}</code> from the build directory. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function TerminalTab({ app }: { app: App }) {
    const termRef = useRef<HTMLDivElement>(null);
    const termInstance = useRef<XTerm | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

    useEffect(() => {
        if (!termRef.current) return;
        const term = new XTerm({
            theme: { background: '#1a1a1a', foreground: '#f0f0f0', cursor: '#f0f0f0' },
            fontFamily: '"Cascadia Code", "Fira Code", monospace',
            fontSize: 14,
            cursorBlink: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termRef.current);
        fitAddon.fit();
        termInstance.current = term;

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            termInstance.current = null;
        };
    }, []);

    const disconnect = () => {
        wsRef.current?.close();
        wsRef.current = null;
        setStatus('disconnected');
    };

    const connect = async () => {
        setStatus('connecting');
        try {
            const res = await fetch(`/apps/${app.id}/terminal-session`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            if (!res.ok) {
                const data = await res.json();
                termInstance.current?.writeln('\r\n\x1b[31mError: ' + (data.message || 'Failed to create session') + '\x1b[0m');
                setStatus('disconnected');
                return;
            }
            const { session_id } = await res.json();
            const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${wsProtocol}//${location.host}/ws/terminal/${session_id}`);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            const term = termInstance.current!;

            ws.onopen = () => setStatus('connected');
            ws.onclose = () => {
                setStatus('disconnected');
                wsRef.current = null;
                term.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m');
            };
            ws.onerror = () => {
                setStatus('disconnected');
                term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m');
            };
            ws.onmessage = (e) => {
                if (e.data instanceof ArrayBuffer) {
                    term.write(new Uint8Array(e.data));
                } else {
                    term.write(e.data as string);
                }
            };

            term.onData((d) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(d));
                }
            });
            term.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                }
            });
        } catch {
            termInstance.current?.writeln('\r\n\x1b[31m[Connection failed]\x1b[0m');
            setStatus('disconnected');
        }
    };

    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4" />
                    Terminal
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Badge variant={status === 'connected' ? 'default' : status === 'connecting' ? 'secondary' : 'outline'}>
                        {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
                    </Badge>
                    {status !== 'connected' ? (
                        <Button size="sm" onClick={connect} disabled={status === 'connecting'}>
                            Connect
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={disconnect}>
                            Disconnect
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="rounded-b-lg bg-[#1a1a1a] p-2" ref={termRef} style={{ minHeight: '420px' }} />
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

export default function AppsShow({ app, serverIp }: { app: App; serverIp: string }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Apps', href: '/apps' },
        { title: app.name, href: `/apps/${app.id}` },
    ];

    const appUrl = `https://${app.slug}.phpless.digitalno.de`;
    const domain = 'phpless.digitalno.de';

    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(app.name);
    const [renamingName, setRenamingName] = useState(false);

    const [editingSlug, setEditingSlug] = useState(false);
    const [newSlug, setNewSlug] = useState(app.slug);
    const [slugError, setSlugError] = useState('');
    const [renamingSlug, setRenamingSlug] = useState(false);
    const [redeploying, setRedeploying] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [fileBrowserPath, setFileBrowserPath] = useState('');

    // Stamp initial history entry and listen for browser back/forward across tabs + file browser
    useEffect(() => {
        window.history.replaceState({ tab: 'overview', fileBrowserPath: '' }, '');
        const handlePopState = (e: PopStateEvent) => {
            if (e.state && 'tab' in e.state) {
                setActiveTab(e.state.tab as string);
                setFileBrowserPath((e.state.fileBrowserPath as string) ?? '');
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        window.history.pushState({ tab, fileBrowserPath: tab === 'files' ? fileBrowserPath : '' }, '');
    };

    const handleFilesNavigate = (path: string) => {
        setFileBrowserPath(path);
        window.history.pushState({ tab: 'files', fileBrowserPath: path }, '');
    };

    const saveField = async (field: 'name' | 'slug', value: string) => {
        const res = await fetch(`/apps/${app.id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ [field]: value }),
        });
        return res;
    };

    const handleRenameName = async () => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === app.name) { setEditingName(false); setNewName(app.name); return; }
        setRenamingName(true);
        try {
            const res = await saveField('name', trimmed);
            if (res.ok) { setEditingName(false); router.reload(); }
        } finally {
            setRenamingName(false);
        }
    };

    const handleRenameSlug = async () => {
        const trimmed = newSlug.trim().toLowerCase();
        if (!trimmed || trimmed === app.slug) { setEditingSlug(false); setNewSlug(app.slug); return; }
        setSlugError('');
        setRenamingSlug(true);
        try {
            const res = await saveField('slug', trimmed);
            if (res.ok) {
                setEditingSlug(false);
                router.reload();
            } else {
                const data = await res.json();
                setSlugError(data.errors?.slug?.[0] ?? 'That URL is already taken.');
            }
        } finally {
            setRenamingSlug(false);
        }
    };

    function handleDelete() {
        router.delete(`/apps/${app.id}`);
    }

    function handleRedeploy() {
        setRedeploying(true);
        router.post(`/apps/${app.id}/deploy`, {}, {
            onSuccess: () => toast.success('Deployed successfully.'),
            onError: (errors) => toast.error((errors as Record<string, string>).deploy || 'Deploy failed.'),
            onFinish: () => setRedeploying(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={app.name} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            {editingName ? (
                                <form onSubmit={(e) => { e.preventDefault(); handleRenameName(); }} className="flex items-center gap-2">
                                    <Input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="h-9 text-lg font-bold"
                                        autoFocus
                                        disabled={renamingName}
                                        onKeyDown={(e) => { if (e.key === 'Escape') { setEditingName(false); setNewName(app.name); } }}
                                    />
                                    <Button size="sm" type="submit" disabled={renamingName || !newName.trim()}>
                                        {renamingName ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button size="sm" variant="ghost" type="button" onClick={() => { setEditingName(false); setNewName(app.name); }}>
                                        Cancel
                                    </Button>
                                </form>
                            ) : (
                                <button onClick={() => setEditingName(true)} className="group flex items-center gap-2">
                                    <h1 className="text-2xl font-bold">{app.name}</h1>
                                    <Pencil className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                                </button>
                            )}
                            <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                        </div>

                        {editingSlug ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleRenameSlug(); }} className="flex items-center gap-1">
                                <span className="text-muted-foreground font-mono text-sm">https://</span>
                                <Input
                                    value={newSlug}
                                    onChange={(e) => { setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '')); setSlugError(''); }}
                                    className="h-7 w-40 font-mono text-sm"
                                    autoFocus
                                    disabled={renamingSlug}
                                    onKeyDown={(e) => { if (e.key === 'Escape') { setEditingSlug(false); setNewSlug(app.slug); setSlugError(''); } }}
                                />
                                <span className="text-muted-foreground font-mono text-sm">.{domain}</span>
                                <Button size="sm" type="submit" disabled={renamingSlug || !newSlug.trim()} className="ml-1 h-7 text-xs">
                                    {renamingSlug ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" variant="ghost" type="button" onClick={() => { setEditingSlug(false); setNewSlug(app.slug); setSlugError(''); }} className="h-7 text-xs">
                                    Cancel
                                </Button>
                                {slugError && <span className="ml-1 text-xs text-red-500">{slugError}</span>}
                            </form>
                        ) : (
                            <button onClick={() => setEditingSlug(true)} className="group flex items-center gap-1">
                                <span className="text-muted-foreground font-mono text-sm">https://{app.slug}.{domain}</span>
                                <Pencil className="text-muted-foreground h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {app.vm_state === 'running' && (
                            <Button variant="outline" asChild>
                                <a href={appUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Visit
                                </a>
                            </Button>
                        )}
                        <Button variant="outline" onClick={handleRedeploy} disabled={redeploying}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${redeploying ? 'animate-spin' : ''}`} />
                            {redeploying ? 'Deploying…' : 'Redeploy'}
                        </Button>
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

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                        <TabsTrigger value="deployments">Deployments</TabsTrigger>
                        <TabsTrigger value="files">Files</TabsTrigger>
                        <TabsTrigger value="domains">Domains</TabsTrigger>
                        <TabsTrigger value="environment">Environment</TabsTrigger>
                        <TabsTrigger value="workers">Workers</TabsTrigger>
                        <TabsTrigger value="terminal">
                            <TerminalIcon className="mr-1 h-3 w-3" />
                            Terminal
                        </TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
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
                        <DeployTab app={app} />
                    </TabsContent>

                    <TabsContent value="files" className="mt-4">
                        <FileBrowserTab app={app} currentPath={fileBrowserPath} onNavigate={handleFilesNavigate} />
                    </TabsContent>

                    <TabsContent value="domains" className="mt-4">
                        <DomainsTab app={app} serverIp={serverIp} />
                    </TabsContent>

                    <TabsContent value="environment" className="mt-4">
                        <EnvironmentTab app={app} />
                    </TabsContent>

                    <TabsContent value="workers" className="mt-4">
                        <WorkersTab app={app} />
                    </TabsContent>

                    <TabsContent value="terminal" className="mt-4">
                        <TerminalTab app={app} />
                    </TabsContent>

                    <TabsContent value="settings" className="mt-4">
                        <SettingsTab app={app} />
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}

function PortForwardingCard({ app }: { app: App }) {
    const [mappings, setMappings] = useState<Array<{ external: number; internal: number; protocol: 'tcp' | 'udp' }>>(
        app.port_mappings ?? [],
    );
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [dirty, setDirty] = useState(false);

    const addMapping = () => {
        setMappings([...mappings, { external: 0, internal: 0, protocol: 'tcp' }]);
        setDirty(true);
    };

    const removeMapping = (i: number) => {
        setMappings(mappings.filter((_, idx) => idx !== i));
        setDirty(true);
    };

    const updateMapping = (i: number, field: string, value: number | string) => {
        const updated = [...mappings];
        updated[i] = { ...updated[i], [field]: value };
        setMappings(updated);
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(`/apps/${app.id}/port-mappings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ port_mappings: mappings.filter((m) => m.external > 0 && m.internal > 0) }),
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ text: data.message, type: 'success' });
                setDirty(false);
            } else {
                setMsg({ text: data.message || 'Failed to save.', type: 'error' });
            }
        } catch {
            setMsg({ text: 'Failed to save port mappings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Port Forwarding
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addMapping}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add Port
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {msg && (
                    <div className={`rounded-lg border p-3 ${msg.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                )}

                {mappings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No ports forwarded. Add a mapping to expose a VM port on the server's public IP.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {mappings.map((m, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={m.external || ''}
                                    onChange={(e) => updateMapping(i, 'external', parseInt(e.target.value) || 0)}
                                    placeholder="External"
                                    className="w-28 font-mono text-sm"
                                />
                                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={m.internal || ''}
                                    onChange={(e) => updateMapping(i, 'internal', parseInt(e.target.value) || 0)}
                                    placeholder="Internal"
                                    className="w-28 font-mono text-sm"
                                />
                                <Select value={m.protocol} onValueChange={(v) => updateMapping(i, 'protocol', v)}>
                                    <SelectTrigger className="w-20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tcp">TCP</SelectItem>
                                        <SelectItem value="udp">UDP</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" onClick={() => removeMapping(i)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-muted-foreground text-xs">
                    Forward ports on the server's public IP directly to your VM. Each external port can only be used by one app.
                    Changes take effect immediately for running VMs.
                </p>

                {dirty && (
                    <Button onClick={save} disabled={saving} size="sm">
                        {saving ? 'Saving...' : 'Save Port Mappings'}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

function WorkersTab({ app }: { app: App }) {
    const [defs, setDefs] = useState<WorkerDef[]>(app.workers ?? []);
    const [statuses, setStatuses] = useState<WorkerStatus[]>([]);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logWorker, setLogWorker] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // Poll live status every 5 seconds
    useEffect(() => {
        if (app.vm_state !== 'running') return;
        let cancelled = false;
        const poll = () => {
            fetch(`/apps/${app.id}/workers/status`)
                .then((r) => r.json())
                .then((data) => { if (!cancelled) setStatuses(data.workers ?? []); })
                .catch(() => {});
        };
        poll();
        const interval = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [app.id, app.vm_state]);

    const addWorker = () => {
        setDefs([...defs, { name: `worker-${defs.length + 1}`, command: '', processes: 1 }]);
        setDirty(true);
    };

    const removeWorker = (index: number) => {
        setDefs(defs.filter((_, i) => i !== index));
        setDirty(true);
    };

    const updateWorker = (index: number, field: keyof WorkerDef, value: string | number) => {
        const updated = [...defs];
        updated[index] = { ...updated[index], [field]: value };
        setDefs(updated);
        setDirty(true);
    };

    const save = () => {
        setSaving(true);
        fetch(`/apps/${app.id}/workers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ workers: defs }),
        })
            .then((r) => r.json())
            .then((data) => {
                toast.success(data.message);
                setDirty(false);
            })
            .catch(() => toast.error('Failed to save workers'))
            .finally(() => setSaving(false));
    };

    const viewLogs = (name: string, index: number = 0) => {
        setLogWorker(`${name}:${index}`);
        fetch(`/apps/${app.id}/workers/logs?name=${name}&index=${index}&lines=200`)
            .then((r) => r.json())
            .then((data) => setLogLines(data.lines ?? []))
            .catch(() => setLogLines(['Failed to load logs']));
    };

    const formatUptime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const stateColor = (state: string) => {
        switch (state) {
            case 'running': return 'default' as const;
            case 'backoff': return 'destructive' as const;
            case 'stopped': return 'outline' as const;
            default: return 'secondary' as const;
        }
    };

    return (
        <div className="space-y-6">
            {/* Worker definitions */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Worker Definitions</CardTitle>
                    <div className="flex gap-2">
                        {dirty && (
                            <Button onClick={save} disabled={saving} size="sm">
                                <Rocket className="mr-1 h-3 w-3" />
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                        )}
                        <Button onClick={addWorker} variant="outline" size="sm">
                            <Plus className="mr-1 h-3 w-3" />
                            Add Worker
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {defs.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            No workers configured. Add a worker to run background processes like queue workers.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {defs.map((def, i) => (
                                <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                                    <div className="grid flex-1 gap-3 md:grid-cols-[1fr_2fr_80px]">
                                        <div>
                                            <Label className="text-xs">Name</Label>
                                            <Input
                                                value={def.name}
                                                onChange={(e) => updateWorker(i, 'name', e.target.value)}
                                                placeholder="queue"
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Command</Label>
                                            <Input
                                                value={def.command}
                                                onChange={(e) => updateWorker(i, 'command', e.target.value)}
                                                placeholder="php artisan queue:work --sleep=3 --tries=3"
                                                className="mt-1 font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Processes</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={8}
                                                value={def.processes}
                                                onChange={(e) => updateWorker(i, 'processes', parseInt(e.target.value) || 1)}
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="mt-5 shrink-0" onClick={() => removeWorker(i)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                    {dirty && (
                        <p className="text-muted-foreground mt-3 text-xs">
                            Save your changes, then redeploy the app to apply the new worker configuration.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Live status */}
            {defs.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Live Status</CardTitle>
                        {statuses.length > 0 && (
                            <Badge variant="default" className="text-xs">
                                {statuses.filter((s) => s.state === 'running').length}/{statuses.length} running
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent>
                        {statuses.length === 0 ? (
                            <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-900/20">
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    {app.vm_state !== 'running'
                                        ? 'VM is not running. Start the app to see worker status.'
                                        : 'No worker status available. Redeploy the app to start workers with the current configuration.'}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">State</th>
                                        <th className="pb-2 pr-4">PID</th>
                                        <th className="pb-2 pr-4">Uptime</th>
                                        <th className="pb-2 pr-4">Restarts</th>
                                        <th className="pb-2">Logs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statuses.map((s, i) => (
                                        <tr key={i} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs">
                                                {s.name}{s.index > 0 ? `:${s.index}` : ''}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge variant={stateColor(s.state)}>{s.state}</Badge>
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 font-mono text-xs">
                                                {s.pid || '—'}
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs">
                                                {s.state === 'running' ? formatUptime(s.uptime_seconds) : '—'}
                                            </td>
                                            <td className="py-2 pr-4 text-xs">
                                                {s.restarts > 0 ? (
                                                    <span className="text-orange-500">{s.restarts}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => viewLogs(s.name, s.index)}>
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Log viewer */}
            {logWorker && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="font-mono text-sm">Logs: {logWorker}</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setLogWorker(null)}>Close</Button>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
                            {logLines.length > 0 ? logLines.join('\n') : 'No logs yet'}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
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
