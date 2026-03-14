import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { ExternalLink } from 'lucide-react';

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

export default function AdminIndex({ teams }: { teams: TeamRow[] }) {
    return (
        <AppLayout>
            <Head title="Admin" />
            <div className="px-4 py-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold">Admin</h1>
                    <p className="text-sm text-muted-foreground mt-1">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
                </div>

                <div className="rounded-lg border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Team</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Subscription</TableHead>
                                <TableHead className="text-right">Requests (this month)</TableHead>
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
        </AppLayout>
    );
}
