import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { Activity, Boxes, Cpu, ExternalLink, HardDrive, MemoryStick, Server, Users } from 'lucide-react';

interface TeamRow {
    id: number;
    name: string;
    slug: string;
    owner_name: string;
    owner_email: string;
    stripe_id: string | null;
    subscription_status: string | null;
    requests_this_month: number;
    app_count: number;
    created_at: string;
}

interface HostStats {
    mem_total?: number;
    mem_free?: number;
    mem_available?: number;
    mem_used?: number;
    disk_total?: number;
    disk_free?: number;
    disk_used?: number;
    cpu_count?: number;
    cpu_pct?: number;
    load_1?: number;
    load_5?: number;
    load_15?: number;
}

interface VmStats {
    total: number;
    running: number;
    mem_allocated: number;
    mem_used: number;
    disk_used: number;
    disk_total: number;
    cpu_pct_sum: number;
}

interface AdminStats {
    host: HostStats;
    vms: VmStats;
    total_apps: number;
    total_users: number;
    total_teams: number;
    total_requests_this_month: number;
}

function formatBytes(bytes: number | undefined): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function statusBadge(status: string | null) {
    if (!status) return <Badge variant="secondary">No subscription</Badge>;
    const map: Record<string, 'default' | 'secondary' | 'destructive'> = {
        active: 'default',
        trialing: 'default',
        past_due: 'destructive',
        canceled: 'secondary',
    };
    return <Badge variant={map[status] ?? 'secondary'}>{status}</Badge>;
}

function ProgressBar({ used, total, color }: { used: number; total: number; color?: string }) {
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    const barColor = color ?? (pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary');
    return (
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

function StatCard({ icon: Icon, title, value, subtitle, children }: { icon: React.ElementType; title: string; value: string; subtitle?: string; children?: React.ReactNode }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <Icon className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {subtitle && <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>}
                {children && <div className="mt-3">{children}</div>}
            </CardContent>
        </Card>
    );
}

export default function AdminIndex({ teams, stats }: { teams: TeamRow[]; stats: AdminStats }) {
    const h = stats.host;
    const v = stats.vms;

    return (
        <AppLayout>
            <Head title="Admin" />
            <div className="px-4 py-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">Platform Overview</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {stats.total_teams} team{stats.total_teams !== 1 ? 's' : ''} · {stats.total_users} user{stats.total_users !== 1 ? 's' : ''} ·{' '}
                        {stats.total_apps} app{stats.total_apps !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Host metrics */}
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Host</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            icon={MemoryStick}
                            title="Host RAM"
                            value={formatBytes(h.mem_used)}
                            subtitle={`${formatBytes(h.mem_total)} total · ${formatBytes(h.mem_available)} available`}
                        >
                            <ProgressBar used={h.mem_used ?? 0} total={h.mem_total ?? 0} />
                        </StatCard>

                        <StatCard
                            icon={Cpu}
                            title="Host CPU"
                            value={`${(h.cpu_pct ?? 0).toFixed(1)}%`}
                            subtitle={`${h.cpu_count ?? '?'} cores · load ${(h.load_1 ?? 0).toFixed(2)}, ${(h.load_5 ?? 0).toFixed(2)}, ${(h.load_15 ?? 0).toFixed(2)}`}
                        >
                            <ProgressBar used={h.cpu_pct ?? 0} total={100} />
                        </StatCard>

                        <StatCard
                            icon={HardDrive}
                            title="Host Disk"
                            value={formatBytes(h.disk_used)}
                            subtitle={`${formatBytes(h.disk_total)} total · ${formatBytes(h.disk_free)} free`}
                        >
                            <ProgressBar used={h.disk_used ?? 0} total={h.disk_total ?? 0} />
                        </StatCard>

                        <StatCard
                            icon={Activity}
                            title="Load Average"
                            value={(h.load_1 ?? 0).toFixed(2)}
                            subtitle={`5m: ${(h.load_5 ?? 0).toFixed(2)} · 15m: ${(h.load_15 ?? 0).toFixed(2)}`}
                        >
                            <ProgressBar used={h.load_1 ?? 0} total={(h.cpu_count ?? 1) * 2} />
                        </StatCard>
                    </div>
                </div>

                {/* VM aggregate metrics */}
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">VMs</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            icon={Server}
                            title="Running VMs"
                            value={`${v.running} / ${v.total}`}
                            subtitle={v.running === v.total ? 'All VMs running' : `${v.total - v.running} stopped or in error`}
                        />

                        <StatCard
                            icon={MemoryStick}
                            title="VM RAM Used"
                            value={formatBytes(v.mem_used)}
                            subtitle={`${formatBytes(v.mem_allocated)} allocated across all VMs`}
                        >
                            <ProgressBar used={v.mem_used} total={v.mem_allocated} />
                        </StatCard>

                        <StatCard
                            icon={HardDrive}
                            title="VM Disk Used"
                            value={formatBytes(v.disk_used)}
                            subtitle={`${formatBytes(v.disk_total)} allocated across all VMs`}
                        >
                            <ProgressBar used={v.disk_used} total={v.disk_total} />
                        </StatCard>

                        <StatCard
                            icon={Cpu}
                            title="VM CPU (sum)"
                            value={`${v.cpu_pct_sum.toFixed(1)}%`}
                            subtitle="Combined across all running VMs"
                        />
                    </div>
                </div>

                {/* Platform totals */}
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Platform</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard icon={Users} title="Users" value={String(stats.total_users)} subtitle={`${stats.total_teams} teams`} />
                        <StatCard icon={Boxes} title="Apps" value={String(stats.total_apps)} subtitle={`${v.running} running`} />
                        <StatCard
                            icon={Activity}
                            title="Requests this month"
                            value={stats.total_requests_this_month.toLocaleString()}
                        />
                        <StatCard
                            icon={Server}
                            title="RAM Overcommit"
                            value={h.mem_total ? `${((v.mem_allocated / h.mem_total) * 100).toFixed(0)}%` : '—'}
                            subtitle={`${formatBytes(v.mem_allocated)} allocated of ${formatBytes(h.mem_total)}`}
                        />
                    </div>
                </div>

                {/* Teams table */}
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Teams</h2>
                    <div className="rounded-lg border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Team</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead>Subscription</TableHead>
                                    <TableHead className="text-right">Requests (month)</TableHead>
                                    <TableHead className="text-right">Apps</TableHead>
                                    <TableHead>Joined</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {teams.map((team) => (
                                    <TableRow key={team.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{team.name}</p>
                                                <p className="text-xs text-muted-foreground font-mono">{team.slug}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-sm">{team.owner_name}</p>
                                                <p className="text-xs text-muted-foreground">{team.owner_email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>{statusBadge(team.subscription_status)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {team.requests_this_month.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">{team.app_count}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{team.created_at}</TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/admin/teams/${team.id}`}
                                                className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                                            >
                                                View <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
