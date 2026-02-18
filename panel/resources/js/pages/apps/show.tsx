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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type AnalyticsSummary, type App, type BreadcrumbItem, type Domain, type EnvironmentVariable, type LogEntry, type RequestMetric } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Activity, BarChart3, CheckCircle, Clock, Code2, Copy, Eye, EyeOff, ExternalLink, Globe, Pencil, Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react';
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
                    <Button size="sm" onClick={() => router.post(`/apps/${app.id}/deploy`)}>
                        <Rocket className="mr-2 h-3 w-3" />
                        Deploy Now
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
                        <DomainsTab app={app} serverIp={serverIp} />
                    </TabsContent>

                    <TabsContent value="environment" className="mt-4">
                        <EnvironmentTab app={app} />
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
