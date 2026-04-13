import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type App, type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Plus } from 'lucide-react';

function formatMb(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return mb >= 1000 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
}

function UsageBar({ used, total, label }: { used: number | null; total: number | null; label?: string }) {
    if (used === null || total === null || total === 0) {
        return <span className="text-muted-foreground text-xs">—</span>;
    }

    const pct = Math.min(100, Math.round((used / total) * 100));
    const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary/70';
    const textColor = pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-yellow-500' : 'text-muted-foreground';

    return (
        <div className="flex min-w-[110px] flex-col gap-1">
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs ${textColor}`}>
                {label ?? `${formatMb(used)} / ${formatMb(total)}`}
            </span>
        </div>
    );
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Apps', href: '/apps' },
];

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

export default function AppsIndex({ apps }: { apps: App[] }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Apps" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Apps</h1>
                    <Button asChild>
                        <Link href="/apps/create">
                            <Plus className="mr-2 h-4 w-4" />
                            Create App
                        </Link>
                    </Button>
                </div>

                {apps.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-12">
                        <div className="text-center">
                            <h3 className="text-lg font-medium">No apps yet</h3>
                            <p className="text-muted-foreground mt-1 text-sm">Create your first app to get started.</p>
                            <Button asChild className="mt-4">
                                <Link href="/apps/create">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create App
                                </Link>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>IP</TableHead>
                                    <TableHead>Resources</TableHead>
                                    <TableHead>RAM</TableHead>
                                    <TableHead>CPU</TableHead>
                                    <TableHead>Disk</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {apps.map((app) => (
                                    <TableRow key={app.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Link href={`/apps/${app.id}`} className="font-medium hover:underline">
                                                    {app.name}
                                                </Link>
                                                {app.detected_framework && app.detected_framework !== 'vanilla' && (
                                                    <Badge variant="outline" className="text-xs capitalize">{app.detected_framework}</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-sm">{app.slug}</TableCell>
                                        <TableCell>
                                            <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{app.vm_ip || '-'}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {app.vcpus} vCPU / {app.mem_mib} MB
                                        </TableCell>
                                        <TableCell>
                                            <UsageBar
                                                used={app.mem_used}
                                                total={app.mem_mib * 1024 * 1024}
                                                label={app.mem_used != null ? `${formatMb(app.mem_used)} / ${app.mem_mib} MB` : undefined}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {app.cpu_pct != null ? (
                                                <span className={`text-sm font-mono ${app.cpu_pct >= 80 ? 'text-red-500' : app.cpu_pct >= 50 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                                                    {app.cpu_pct.toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <UsageBar used={app.disk_used} total={app.disk_total} />
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {new Date(app.created_at).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
