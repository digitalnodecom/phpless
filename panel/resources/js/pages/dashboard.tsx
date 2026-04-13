import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type DashboardStats } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Activity, Boxes, ExternalLink, Globe, Rocket, Server, Terminal } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
];

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-8 py-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight">Welcome to PHPless</h2>
                <p className="text-muted-foreground mt-2 text-lg">Deploy your first PHP app in seconds</p>
            </div>

            <div className="grid w-full max-w-3xl gap-4 md:grid-cols-3">
                <Card className="relative overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
                            <Rocket className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base">1. Create an app</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-muted-foreground text-sm">Pick a name and configure your PHP environment.</p>
                        <Button asChild size="sm">
                            <Link href="/apps/create">Create app</Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
                            <Terminal className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base">2. Deploy your code</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground text-sm">Use the CLI to deploy in one command.</p>
                        <code className="bg-muted mt-3 block rounded px-3 py-2 text-sm">phpless deploy</code>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <div className="bg-primary/10 text-primary mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
                            <Globe className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-base">3. Visit your app</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground text-sm">Your app is instantly available at its URL.</p>
                        <code className="bg-muted mt-3 block rounded px-3 py-2 text-sm">my-app.phpless.app</code>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatsCards({ stats }: { stats: DashboardStats }) {
    return (
        <>
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

            <div className="flex gap-2">
                <Button asChild size="sm">
                    <Link href="/apps/create">
                        <Rocket className="mr-2 h-4 w-4" />
                        Create new app
                    </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                    <a href="/docs/api" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View docs
                    </a>
                </Button>
            </div>
        </>
    );
}

export default function Dashboard({ stats }: { stats: DashboardStats }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-6 p-4">
                {stats.totalApps === 0 ? <EmptyState /> : <StatsCards stats={stats} />}
            </div>
        </AppLayout>
    );
}
