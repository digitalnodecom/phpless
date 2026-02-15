import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { type App, type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Plus } from 'lucide-react';

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
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {apps.map((app) => (
                                    <TableRow key={app.id}>
                                        <TableCell>
                                            <Link href={`/apps/${app.id}`} className="font-medium hover:underline">
                                                {app.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-sm">{app.slug}</TableCell>
                                        <TableCell>
                                            <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{app.vm_ip || '-'}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {app.vcpus} vCPU / {app.mem_mib} MB
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
