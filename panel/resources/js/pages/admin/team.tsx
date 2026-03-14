import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ExternalLink } from 'lucide-react';

interface TeamDetail {
    id: number;
    name: string;
    slug: string;
    stripe_id: string | null;
    pm_type: string | null;
    pm_last_four: string | null;
    created_at: string;
}

interface Member {
    id: number;
    name: string;
    email: string;
    role: string;
}

interface SubscriptionDetail {
    status: string;
    trial_ends_at: string | null;
    ends_at: string | null;
    stripe_id: string;
}

interface DailyUsage {
    day: string;
    requests: number;
}

interface Invoice {
    id: string;
    date: string;
    total: string;
    status: string;
}

interface Props {
    team: TeamDetail;
    members: Member[];
    subscription: SubscriptionDetail | null;
    daily_usage: DailyUsage[];
    invoices: Invoice[];
    app_count: number;
}

function statusBadge(status: string | null) {
    if (!status) return <Badge variant="secondary">None</Badge>;
    const map: Record<string, 'default' | 'secondary' | 'destructive'> = {
        active: 'default',
        trialing: 'default',
        past_due: 'destructive',
        canceled: 'secondary',
    };
    return <Badge variant={map[status] ?? 'secondary'}>{status}</Badge>;
}

export default function AdminTeam({ team, members, subscription, daily_usage, invoices, app_count }: Props) {
    const totalRequests = daily_usage.reduce((sum, d) => sum + Number(d.requests), 0);
    const maxRequests = Math.max(...daily_usage.map((d) => Number(d.requests)), 1);

    return (
        <AppLayout>
            <Head title={`Admin · ${team.name}`} />
            <div className="px-4 py-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold">{team.name}</h1>
                        <p className="text-sm text-muted-foreground font-mono">{team.slug}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Apps</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{app_count}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Requests this month</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Members</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold">{members.length}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Subscription */}
                <Card>
                    <CardHeader>
                        <CardTitle>Subscription</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Status</span>
                            {statusBadge(subscription?.status ?? null)}
                        </div>
                        {subscription?.trial_ends_at && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Trial ends</span>
                                <span className="text-sm">{subscription.trial_ends_at}</span>
                            </div>
                        )}
                        {subscription?.ends_at && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Cancels on</span>
                                <span className="text-sm">{subscription.ends_at}</span>
                            </div>
                        )}
                        {team.stripe_id && (
                            <div className="flex items-center justify-between pt-2">
                                <span className="text-sm text-muted-foreground">Stripe customer</span>
                                <a
                                    href={`https://dashboard.stripe.com/customers/${team.stripe_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm flex items-center gap-1 hover:underline font-mono"
                                >
                                    {team.stripe_id} <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}
                        {team.pm_last_four && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Payment method</span>
                                <span className="text-sm">
                                    {team.pm_type} ···· {team.pm_last_four}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Usage chart */}
                {daily_usage.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Daily requests (this month)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-1 h-24">
                                {daily_usage.map((d) => (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                                        <div
                                            className="w-full bg-primary rounded-sm min-h-[2px]"
                                            style={{ height: `${(Number(d.requests) / maxRequests) * 100}%` }}
                                        />
                                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow whitespace-nowrap z-10">
                                            {d.day}: {Number(d.requests).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Members */}
                <Card>
                    <CardHeader>
                        <CardTitle>Members</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map((m) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="text-sm font-medium">{m.name}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{m.role}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Invoices */}
                {invoices.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoices</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((inv) => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="text-sm">{inv.date}</TableCell>
                                            <TableCell className="font-mono text-sm">{inv.total}</TableCell>
                                            <TableCell>{statusBadge(inv.status)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
