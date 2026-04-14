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
import { type App, type PreviewEnvironment } from '@/types';
import { router } from '@inertiajs/react';
import { Clock, ExternalLink, GitBranch, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function expiresIn(dateStr: string | null): string {
    if (!dateStr) return 'no expiry';
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'expired';
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m`;
    }
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

function PreviewRow({ preview, app }: { preview: PreviewEnvironment; app: App }) {
    const [deleting, setDeleting] = useState(false);
    const domain = 'phpless.digitalno.de';
    const previewUrl = `https://${preview.slug}.${domain}`;
    const shortSha = preview.commit_sha?.substring(0, 7);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const res = await fetch(`/apps/${app.id}/previews/${preview.id}`, {
                method: 'DELETE',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            if (res.ok) {
                toast.success(`Preview for ${preview.branch} destroyed.`);
                router.reload({ only: ['app'] });
            } else {
                const data = await res.json();
                toast.error(data.message || 'Failed to destroy preview.');
            }
        } catch {
            toast.error('Failed to destroy preview.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <tr className="border-b last:border-0">
            <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                    <GitBranch className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="font-mono text-sm font-medium">{preview.branch}</span>
                </div>
            </td>
            <td className="py-3 pr-4">
                <Badge variant={preview.vm_state === 'running' ? 'default' : preview.vm_state === 'error' ? 'destructive' : 'secondary'}>
                    {preview.vm_state}
                </Badge>
            </td>
            <td className="py-3 pr-4">
                {preview.vm_state === 'running' ? (
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-500 hover:underline"
                    >
                        {preview.slug}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                ) : (
                    <span className="text-muted-foreground text-sm">{preview.slug}</span>
                )}
            </td>
            <td className="py-3 pr-4 font-mono text-xs">{shortSha || '-'}</td>
            <td className="text-muted-foreground max-w-48 truncate py-3 pr-4 text-xs">{preview.commit_message || '-'}</td>
            <td className="text-muted-foreground py-3 pr-4 text-xs whitespace-nowrap">{timeAgo(preview.created_at)}</td>
            <td className="py-3 pr-4">
                <div className="flex items-center gap-1 text-xs">
                    <Clock className="text-muted-foreground h-3 w-3" />
                    <span className={`${preview.expires_at && new Date(preview.expires_at).getTime() - Date.now() < 3600000 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                        {expiresIn(preview.expires_at)}
                    </span>
                </div>
            </td>
            <td className="py-3 text-right">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={deleting}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Destroy preview?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will destroy the VM and remove the preview for branch <strong>{preview.branch}</strong>. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Destroy
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </td>
        </tr>
    );
}

export default function PreviewsTab({ app }: { app: App }) {
    const previews = app.preview_environments ?? [];

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Preview Environments
                        {previews.length > 0 && (
                            <Badge variant="secondary" className="ml-2">{previews.length}/{app.preview_max || 3}</Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!app.preview_enabled ? (
                        <div className="py-6 text-center">
                            <GitBranch className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                            <p className="text-muted-foreground text-sm">
                                Preview environments are disabled. Enable them in the Settings tab.
                            </p>
                        </div>
                    ) : previews.length === 0 ? (
                        <div className="py-6 text-center">
                            <GitBranch className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                            <p className="text-muted-foreground text-sm">
                                No preview environments. Push to a non-default branch to create one.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Branch</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2 pr-4">URL</th>
                                        <th className="pb-2 pr-4">Commit</th>
                                        <th className="pb-2 pr-4">Message</th>
                                        <th className="pb-2 pr-4">Created</th>
                                        <th className="pb-2 pr-4">Expires</th>
                                        <th className="pb-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previews.map((p) => (
                                        <PreviewRow key={p.id} preview={p} app={app} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
