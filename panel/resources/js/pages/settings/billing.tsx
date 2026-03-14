import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { type Invoice, type Subscription } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { CreditCard, ExternalLink, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

interface UsageData {
    requests_this_month: number;
    free_allowance: number;
    free_remaining: number;
    billable_requests: number;
    estimated_cost: number;
}

interface Props {
    subscription: Subscription | null;
    payment_method: { type: string | null; last_four: string | null };
    invoices: Invoice[];
}

function statusBadge(status: string | null) {
    if (!status) return <Badge variant="secondary">Inactive</Badge>;
    const map: Record<string, 'default' | 'secondary' | 'destructive'> = {
        active: 'default',
        trialing: 'default',
        past_due: 'destructive',
        canceled: 'secondary',
        incomplete: 'secondary',
    };
    return <Badge variant={map[status] ?? 'secondary'}>{status}</Badge>;
}

export default function Billing({ subscription, payment_method, invoices }: Props) {
    const { props } = usePage<{ flash?: { checkout?: string } }>();
    const [usage, setUsage] = useState<UsageData | null>(null);

    useEffect(() => {
        fetch('/settings/billing/usage')
            .then((r) => r.json())
            .then(setUsage)
            .catch(() => {});
    }, []);

    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';

    function handleSubscribe() {
        router.post('/settings/billing/checkout');
    }

    function handlePortal() {
        router.post('/settings/billing/portal');
    }

    return (
        <AppLayout>
            <Head title="Billing" />
            <SettingsLayout>
                <div className="space-y-6">
                    {/* Plan overview */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5" />
                                Pay-as-you-go
                            </CardTitle>
                            <CardDescription>1,000 requests/month free · $0.0001 per request after that</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Subscription status</span>
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

                            <div className="flex gap-2 pt-2">
                                {!isActive ? (
                                    <Button onClick={handleSubscribe}>Subscribe</Button>
                                ) : (
                                    <Button variant="outline" onClick={handlePortal}>
                                        Manage Billing
                                        <ExternalLink className="ml-2 h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Usage this month */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Usage this month</CardTitle>
                            <CardDescription>Resets on the 1st of each month.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {usage ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Total requests</span>
                                        <span className="font-mono text-sm">{usage.requests_this_month.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Free allowance remaining</span>
                                        <span className="font-mono text-sm">{usage.free_remaining.toLocaleString()}</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{
                                                width: `${Math.min(100, (usage.requests_this_month / usage.free_allowance) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Billable requests</span>
                                        <span className="font-mono text-sm">{usage.billable_requests.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Estimated cost</span>
                                        <span className="font-mono text-sm font-medium">${usage.estimated_cost.toFixed(4)}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Loading usage…</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payment method */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Payment method
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {payment_method.last_four ? (
                                <p className="text-sm">
                                    {payment_method.type} ending in <span className="font-mono">{payment_method.last_four}</span>
                                </p>
                            ) : (
                                <p className="text-sm text-muted-foreground">No payment method on file.</p>
                            )}
                            {isActive && (
                                <Button variant="outline" size="sm" className="mt-3" onClick={handlePortal}>
                                    Update payment method
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Invoice history */}
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
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoices.map((inv) => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="text-sm">{inv.date}</TableCell>
                                                <TableCell className="font-mono text-sm">{inv.total}</TableCell>
                                                <TableCell>{statusBadge(inv.status)}</TableCell>
                                                <TableCell>
                                                    {inv.pdf && (
                                                        <a
                                                            href={inv.pdf}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                                                        >
                                                            PDF <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
