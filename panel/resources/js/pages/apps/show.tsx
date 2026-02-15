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
import { type App, type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Code2, ExternalLink, Trash2 } from 'lucide-react';

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
