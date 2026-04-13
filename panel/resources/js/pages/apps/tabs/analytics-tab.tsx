import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type AnalyticsSummary, type RequestMetric } from '@/types';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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

function MetricsChart({ metrics }: { metrics: RequestMetric[] }) {
    const [hovered, setHovered] = useState<{ metric: RequestMetric; x: number; y: number } | null>(null);

    if (metrics.length === 0) {
        return <p className="text-muted-foreground py-8 text-center text-sm">No data yet</p>;
    }

    const maxRequests = Math.max(...metrics.map((m) => m.requests), 1);
    const chartHeight = 160;
    const barWidth = Math.max(4, Math.min(20, Math.floor(600 / metrics.length) - 2));
    const chartWidth = Math.max(600, metrics.length * (barWidth + 2));

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

function AnalyticsLoadingSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-16" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[160px] w-full" />
                </CardContent>
            </Card>
        </div>
    );
}

export default function AnalyticsTab({ appId }: { appId: number }) {
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
            .catch((err) => toast.error('Failed to load analytics'))
            .finally(() => setLoading(false));
    }, [appId]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    if (loading) {
        return <AnalyticsLoadingSkeleton />;
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
