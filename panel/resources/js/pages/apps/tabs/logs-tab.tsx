import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { type LogEntry } from '@/types';
import { Activity, ChevronLeft, ChevronRight, Download, History, Radio, RefreshCw, Search, Terminal as TerminalIcon } from 'lucide-react';
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

function statusBadgeVariant(status: number): 'destructive' | 'secondary' | 'outline' | 'default' {
    if (status >= 500) return 'destructive';
    if (status >= 400) return 'secondary';
    return 'outline';
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

interface SearchLog {
    id: number;
    logged_at: string;
    method: string;
    path: string;
    status_code: number;
    duration_ms: number;
    ip: string;
    user_agent: string;
    response_size: number;
}

interface SearchResult {
    logs: SearchLog[];
    total: number;
    page: number;
    per_page: number;
    last_page: number;
    retention_days: number;
}

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

function getTimeRangeDate(range: TimeRange): string | null {
    if (range === 'all') return null;
    const now = new Date();
    switch (range) {
        case '1h':
            now.setHours(now.getHours() - 1);
            break;
        case '24h':
            now.setDate(now.getDate() - 1);
            break;
        case '7d':
            now.setDate(now.getDate() - 7);
            break;
        case '30d':
            now.setDate(now.getDate() - 30);
            break;
    }
    return now.toISOString();
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
        </div>
    );
}

export default function LogsTab({ appId }: { appId: number }) {
    const [mode, setMode] = useState<'live' | 'history'>('history');

    // Live mode state
    const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
    const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
    const [liveLoading, setLiveLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const streamLogsRef = useRef<HTMLDivElement>(null);

    // History mode state
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [methodFilter, setMethodFilter] = useState('all');
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchLiveLogs = useCallback(() => {
        setLiveLoading(true);
        fetch(`/apps/${appId}/logs`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setLiveLogs(data.logs || []);
                setConsoleLogs(data.console_logs || []);
            })
            .catch(() => toast.error('Failed to load logs'))
            .finally(() => setLiveLoading(false));
    }, [appId]);

    const fetchSearchLogs = useCallback(
        (page = 1) => {
            setSearchLoading(true);
            const params = new URLSearchParams();
            if (searchQuery) params.set('q', searchQuery);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (methodFilter !== 'all') params.set('method', methodFilter);
            const from = getTimeRangeDate(timeRange);
            if (from) params.set('from', from);
            params.set('page', String(page));
            params.set('per_page', '50');

            fetch(`/apps/${appId}/logs/search?${params}`, { headers: { Accept: 'application/json' } })
                .then((r) => r.json())
                .then((data: SearchResult) => {
                    setSearchResult(data);
                    setCurrentPage(data.page);
                })
                .catch(() => toast.error('Failed to search logs'))
                .finally(() => setSearchLoading(false));
        },
        [appId, searchQuery, statusFilter, methodFilter, timeRange],
    );

    // Load history on mount and when filters change
    useEffect(() => {
        if (mode === 'history') {
            fetchSearchLogs(1);
        }
    }, [mode, statusFilter, methodFilter, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh for live mode
    useEffect(() => {
        if (autoRefresh && mode === 'live') {
            intervalRef.current = setInterval(fetchLiveLogs, 5000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoRefresh, fetchLiveLogs, mode]);

    // Cleanup WebSocket on unmount
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
                setAutoRefresh(false);
            };
            ws.onmessage = (event) => {
                const parsed = parseCaddyLogLine(event.data);
                if (parsed) {
                    setLiveLogs((prev) => {
                        const updated = [...prev, parsed];
                        return updated.length > 500 ? updated.slice(-500) : updated;
                    });
                }
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

    const handleExportCSV = () => {
        const params = new URLSearchParams();
        if (searchQuery) params.set('q', searchQuery);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (methodFilter !== 'all') params.set('method', methodFilter);
        const from = getTimeRangeDate(timeRange);
        if (from) params.set('from', from);
        window.open(`/apps/${appId}/logs/export?${params}`, '_blank');
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchSearchLogs(1);
    };

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
                <Button variant={mode === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setMode('history')}>
                    <History className="mr-1 h-3 w-3" />
                    History
                </Button>
                <Button
                    variant={mode === 'live' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                        setMode('live');
                        if (liveLogs.length === 0) fetchLiveLogs();
                    }}
                >
                    <Radio className="mr-1 h-3 w-3" />
                    Live
                </Button>
                {searchResult && (
                    <span className="text-muted-foreground ml-auto text-xs">
                        Logs retained for {searchResult.retention_days} days
                    </span>
                )}
            </div>

            {mode === 'history' ? (
                <>
                    {/* Search and filters */}
                    <Card>
                        <CardContent className="pt-4">
                            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                    <div className="relative">
                                        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                                        <Input
                                            placeholder="Search paths..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[130px]">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="2xx">2xx Success</SelectItem>
                                        <SelectItem value="3xx">3xx Redirect</SelectItem>
                                        <SelectItem value="4xx">4xx Client Error</SelectItem>
                                        <SelectItem value="5xx">5xx Server Error</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={methodFilter} onValueChange={setMethodFilter}>
                                    <SelectTrigger className="w-[110px]">
                                        <SelectValue placeholder="Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Methods</SelectItem>
                                        <SelectItem value="GET">GET</SelectItem>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="PUT">PUT</SelectItem>
                                        <SelectItem value="PATCH">PATCH</SelectItem>
                                        <SelectItem value="DELETE">DELETE</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Time range" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1h">Last hour</SelectItem>
                                        <SelectItem value="24h">Last 24h</SelectItem>
                                        <SelectItem value="7d">Last 7 days</SelectItem>
                                        <SelectItem value="30d">Last 30 days</SelectItem>
                                        <SelectItem value="all">All time</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button type="submit" size="sm" disabled={searchLoading}>
                                    <Search className="mr-1 h-3 w-3" />
                                    Search
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={handleExportCSV}>
                                    <Download className="mr-1 h-3 w-3" />
                                    CSV
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Results */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between py-3">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Activity className="h-4 w-4" />
                                {searchResult ? (
                                    <>
                                        {searchResult.total.toLocaleString()} results
                                        {searchResult.last_page > 1 && (
                                            <span className="text-muted-foreground font-normal">
                                                (page {searchResult.page} of {searchResult.last_page})
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    'Searching...'
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {searchLoading && !searchResult ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Skeleton key={i} className="h-5 w-full" />
                                    ))}
                                </div>
                            ) : !searchResult || searchResult.logs.length === 0 ? (
                                <p className="text-muted-foreground py-8 text-center text-sm">
                                    No log entries found matching your filters.
                                </p>
                            ) : (
                                <>
                                    <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="sticky top-0 bg-background">
                                                <tr className="text-muted-foreground border-b text-left text-xs">
                                                    <th className="pb-2 pr-4">Timestamp</th>
                                                    <th className="pb-2 pr-4">Method</th>
                                                    <th className="pb-2 pr-4">Path</th>
                                                    <th className="pb-2 pr-4">Status</th>
                                                    <th className="pb-2 pr-4">Duration</th>
                                                    <th className="pb-2 pr-4">Size</th>
                                                    <th className="pb-2">IP</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono text-xs">
                                                {searchResult.logs.map((log) => (
                                                    <tr key={log.id} className="border-b last:border-0">
                                                        <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">
                                                            {new Date(log.logged_at).toLocaleString()}
                                                        </td>
                                                        <td className="py-1.5 pr-4 font-medium">{log.method}</td>
                                                        <td className="max-w-[300px] truncate py-1.5 pr-4" title={log.path}>
                                                            {log.path}
                                                        </td>
                                                        <td className="py-1.5 pr-4">
                                                            <Badge
                                                                variant={statusBadgeVariant(log.status_code)}
                                                                className={`text-xs ${statusColor(log.status_code)}`}
                                                            >
                                                                {log.status_code}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-1.5 pr-4 whitespace-nowrap">{log.duration_ms}ms</td>
                                                        <td className="py-1.5 pr-4 whitespace-nowrap">{formatBytes(log.response_size)}</td>
                                                        <td className="text-muted-foreground py-1.5">{log.ip}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {searchResult.last_page > 1 && (
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-muted-foreground text-xs">
                                                Showing {(searchResult.page - 1) * searchResult.per_page + 1}-
                                                {Math.min(searchResult.page * searchResult.per_page, searchResult.total)} of{' '}
                                                {searchResult.total.toLocaleString()}
                                            </span>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={currentPage <= 1 || searchLoading}
                                                    onClick={() => fetchSearchLogs(currentPage - 1)}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                    Prev
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={currentPage >= searchResult.last_page || searchLoading}
                                                    onClick={() => fetchSearchLogs(currentPage + 1)}
                                                >
                                                    Next
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </>
            ) : (
                <>
                    {/* Live mode */}
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
                                        <Button variant="ghost" size="sm" onClick={fetchLiveLogs} disabled={liveLoading}>
                                            <RefreshCw className="mr-1 h-3 w-3" />
                                            Refresh
                                        </Button>
                                    </>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {liveLoading && liveLogs.length === 0 ? (
                                <LogsLoadingSkeleton />
                            ) : liveLogs.length === 0 ? (
                                <p className="text-muted-foreground py-8 text-center text-sm">
                                    No requests logged yet. Visit your app to generate some traffic.
                                </p>
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
                                            {liveLogs
                                                .slice()
                                                .reverse()
                                                .map((log, i) => (
                                                    <tr key={i} className="border-b last:border-0">
                                                        <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">
                                                            {log.timestamp}
                                                        </td>
                                                        <td className="py-1.5 pr-4 font-medium">{log.method}</td>
                                                        <td className="max-w-[300px] truncate py-1.5 pr-4">{log.path}</td>
                                                        <td className={`py-1.5 pr-4 font-medium ${statusColor(log.status)}`}>
                                                            {log.status}
                                                        </td>
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
                            <Button variant="ghost" size="sm" onClick={fetchLiveLogs}>
                                <RefreshCw className="mr-1 h-3 w-3" />
                                Refresh
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {consoleLogs.length === 0 ? (
                                <p className="text-muted-foreground py-4 text-center text-sm">
                                    No console output yet. Deploy your app to see startup logs.
                                </p>
                            ) : (
                                <pre className="bg-muted/50 max-h-96 overflow-y-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                                    {consoleLogs.join('\n')}
                                </pre>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
