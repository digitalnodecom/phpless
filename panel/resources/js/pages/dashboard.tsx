import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type DashboardStats } from '@/types';
import { Head } from '@inertiajs/react';
import { Activity, Boxes, Server } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
];

export default function Dashboard({ stats }: { stats: DashboardStats }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-6 p-4">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Running Apps</CardTitle>
                            <Activity className="text-muted-foreground h-4 w-4" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {stats.runningApps}
                                <span className="text-muted-foreground text-sm font-normal"> / {stats.totalApps} total</span>
                            </div>
                            <p className="text-muted-foreground text-xs">
                                {stats.totalApps - stats.runningApps} stopped
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Plan</CardTitle>
                            <Boxes className="text-muted-foreground h-4 w-4" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold capitalize">Pay-as-you-go</div>
                            <p className="text-muted-foreground text-xs">Unlimited apps · billed by requests</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Engine Status</CardTitle>
                            <Server className="text-muted-foreground h-4 w-4" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Badge variant={stats.engineStatus === 'healthy' ? 'default' : 'destructive'}>
                                    {stats.engineStatus}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs">Firecracker VM Manager</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
