import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type LogEntry } from '@/types';
import { Activity, Radio, RefreshCw, Terminal as TerminalIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
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

function parseCaddyLogLine(raw: string): LogEntry | null {
    try {
        const entry = JSON.parse(raw);
        if (!entry.ts) return null;
        const request = entry.request ?? {};
        return {
            timestamp: new Date(entry.ts * 1000).toLocaleTimeString(),
            method: request.method ?? '-',
            path: request.uri ?? '-',
            status: entry.status ?? 0,
            duration: Math.round((entry.duration ?? 0) * 1000 * 10) / 10,
            client_ip: request.client_ip ?? request.remote_ip ?? '-',
            size: entry.size ?? 0,
        };
    } catch {
        return null;
    }
}

function LogsLoadingSkeleton() {
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <Skeleton className="h-5 w-32" />
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-5 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-32 w-full" />
                </CardContent>
            </Card>
        </div>
    );
}

export default function LogsTab({ appId }: { appId: number }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const streamLogsRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(() => {
        fetch(`/apps/${appId}/logs`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setLogs(data.logs || []);
                setConsoleLogs(data.console_logs || []);
            })
            .catch(() => toast.error('Failed to load logs'))
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

    // Clean up WebSocket on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    const startStreaming = async () => {
        if (wsRef.current) return;

        try {
            const res = await fetch(`/apps/${appId}/log-session`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            if (!res.ok) {
                toast.error('Failed to start log stream');
                return;
            }
            const { session_id } = await res.json();
            const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${wsProtocol}//${location.host}/ws/logs/${session_id}`);
            wsRef.current = ws;

            ws.onopen = () => {
                setStreaming(true);
                // Stop auto-refresh while streaming
                setAutoRefresh(false);
            };
            ws.onmessage = (event) => {
                const parsed = parseCaddyLogLine(event.data);
                if (parsed) {
                    setLogs((prev) => {
                        const updated = [...prev, parsed];
                        // Keep last 500 entries in memory
                        return updated.length > 500 ? updated.slice(-500) : updated;
                    });
                }
                // Auto-scroll
                if (streamLogsRef.current) {
                    const el = streamLogsRef.current;
                    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                    if (isNearBottom) {
                        requestAnimationFrame(() => {
                            el.scrollTop = el.scrollHeight;
                        });
                    }
                }
            };
            ws.onclose = () => {
                setStreaming(false);
                wsRef.current = null;
            };
            ws.onerror = () => {
                toast.error('Log stream connection error');
                setStreaming(false);
                wsRef.current = null;
            };
        } catch {
            toast.error('Failed to start log stream');
        }
    };

    const stopStreaming = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setStreaming(false);
    };

    if (loading) {
        return <LogsLoadingSkeleton />;
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Recent Requests
                        {streaming && (
                            <span className="flex items-center gap-1.5 text-xs font-normal text-green-500">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                                </span>
                                Streaming
                            </span>
                        )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button
                            variant={streaming ? 'default' : 'outline'}
                            size="sm"
                            onClick={streaming ? stopStreaming : startStreaming}
                        >
                            <Radio className="mr-1 h-3 w-3" />
                            {streaming ? 'Stop Stream' : 'Stream'}
                        </Button>
                        {!streaming && (
                            <>
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
                            </>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {logs.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">No requests logged yet. Visit your app to generate some traffic.</p>
                    ) : (
                        <div ref={streamLogsRef} className="max-h-[600px] overflow-x-auto overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-background">
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
                    {consoleLogs.length === 0 ? (
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
