import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { type App, type Domain } from '@/types';
import { CheckCircle, Clock, Copy, ExternalLink, Globe, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function DomainsLoadingSkeleton() {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-8 w-28" />
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-5 w-20" />
                            <Skeleton className="ml-auto h-8 w-24" />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function DomainsTab({ app, serverIp }: { app: App; serverIp: string }) {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [formDomain, setFormDomain] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [verifying, setVerifying] = useState<number | null>(null);
    const [deletingDomain, setDeletingDomain] = useState<Domain | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const fetchDomains = useCallback(() => {
        setLoading(true);
        fetch(`/apps/${app.id}/domains`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setDomains(data.domains || []))
            .catch(() => toast.error('Failed to load domains'))
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchDomains();
    }, [fetchDomains]);

    const handleAdd = async () => {
        setSaving(true);
        setFormErrors({});
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ domain: formDomain }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setShowAddDialog(false);
            setFormDomain('');
            fetchDomains();
        } finally {
            setSaving(false);
        }
    };

    const handleVerify = async (domain: Domain) => {
        setVerifying(domain.id);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/domains/${domain.id}/verify`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Domain verified!', type: 'success' });
                fetchDomains();
            } else {
                setMessage({ text: data.message || 'DNS verification failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to verify domain.', type: 'error' });
        } finally {
            setVerifying(null);
        }
    };

    const handleDelete = async () => {
        if (!deletingDomain) return;
        await fetch(`/apps/${app.id}/domains/${deletingDomain.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
        });
        setDeletingDomain(null);
        setMessage(null);
        fetchDomains();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (loading) {
        return <DomainsLoadingSkeleton />;
    }

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Custom Domains
                    </CardTitle>
                    <Button size="sm" onClick={() => { setFormDomain(''); setFormErrors({}); setShowAddDialog(true); }}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add Domain
                    </Button>
                </CardHeader>
                <CardContent>
                    {domains.length === 0 ? (
                        <div className="py-4 text-center">
                            <p className="text-muted-foreground text-sm">
                                No custom domains configured. Your app is available at{' '}
                                <a href={`https://${app.slug}.phpless.digitalno.de`} target="_blank" rel="noopener noreferrer" className="font-mono underline">
                                    {app.slug}.phpless.digitalno.de
                                </a>
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Domain</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2 pr-4">Added</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {domains.map((d) => (
                                        <tr key={d.id} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs font-medium">{d.domain}</td>
                                            <td className="py-2 pr-4">
                                                {d.dns_verified ? (
                                                    <Badge variant="default" className="gap-1">
                                                        <CheckCircle className="h-3 w-3" />
                                                        Verified
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Pending DNS
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
                                            <td className="py-2">
                                                <div className="flex items-center gap-1">
                                                    {!d.dns_verified && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleVerify(d)}
                                                            disabled={verifying === d.id}
                                                        >
                                                            <RefreshCw className={`mr-1 h-3 w-3 ${verifying === d.id ? 'animate-spin' : ''}`} />
                                                            {verifying === d.id ? 'Verifying...' : 'Verify DNS'}
                                                        </Button>
                                                    )}
                                                    {d.dns_verified && (
                                                        <Button variant="outline" size="sm" asChild>
                                                            <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer">
                                                                <ExternalLink className="mr-1 h-3 w-3" />
                                                                Visit
                                                            </a>
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={() => setDeletingDomain(d)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DNS Instructions */}
            {domains.some((d) => !d.dns_verified) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">DNS Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-muted-foreground text-sm">
                            Point your domain to PHPless by adding one of the following DNS records at your domain registrar:
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-xs font-medium">Option 1: A Record</p>
                                    <p className="font-mono text-sm">A &rarr; {serverIp}</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(serverIp)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <p className="text-xs font-medium">Option 2: CNAME Record</p>
                                    <p className="font-mono text-sm">CNAME &rarr; {app.slug}.phpless.digitalno.de</p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${app.slug}.phpless.digitalno.de`)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-muted-foreground text-xs">
                            DNS changes can take up to 48 hours to propagate, but usually take only a few minutes. Click "Verify DNS" once your records are set.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Add Domain Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Custom Domain</DialogTitle>
                        <DialogDescription>Enter the domain you want to point to this app. You'll need to configure DNS after adding it.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="domain-input">Domain</Label>
                            <Input
                                id="domain-input"
                                placeholder="example.com"
                                value={formDomain}
                                onChange={(e) => setFormDomain(e.target.value.toLowerCase())}
                                className="font-mono"
                            />
                            {formErrors.domain && <p className="mt-1 text-xs text-red-500">{formErrors.domain[0]}</p>}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                        <Button onClick={handleAdd} disabled={saving || !formDomain}>
                            {saving ? 'Adding...' : 'Add Domain'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingDomain} onOpenChange={(open) => !open && setDeletingDomain(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove {deletingDomain?.domain}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the custom domain and its SSL certificate. Traffic to this domain will no longer be routed to your app.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Remove Domain</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
