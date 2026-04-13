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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { type App, type EnvironmentVariable } from '@/types';
import { router } from '@inertiajs/react';
import { Eye, EyeOff, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function EnvironmentLoadingSkeleton() {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-8 w-28" />
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-5 w-12" />
                            <Skeleton className="ml-auto h-8 w-16" />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function EnvironmentTab({ app }: { app: App }) {
    const [appVars, setAppVars] = useState<EnvironmentVariable[]>([]);
    const [teamVars, setTeamVars] = useState<EnvironmentVariable[]>([]);
    const [loading, setLoading] = useState(true);
    const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingVar, setEditingVar] = useState<EnvironmentVariable | null>(null);
    const [deletingVar, setDeletingVar] = useState<EnvironmentVariable | null>(null);
    const [formKey, setFormKey] = useState('');
    const [formValue, setFormValue] = useState('');
    const [formSecret, setFormSecret] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [deploying, setDeploying] = useState(false);

    const fetchVars = useCallback(() => {
        setLoading(true);
        fetch(`/apps/${app.id}/env`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setAppVars(data.app_vars || []);
                setTeamVars(data.team_vars || []);
            })
            .catch(() => toast.error('Failed to load environment variables'))
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchVars();
    }, [fetchVars]);

    const toggleReveal = (id: number) => {
        setRevealedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const openAdd = () => {
        setFormKey('');
        setFormValue('');
        setFormSecret(false);
        setFormErrors({});
        setShowAddDialog(true);
    };

    const openEdit = (v: EnvironmentVariable) => {
        setEditingVar(v);
        setFormValue(v.is_secret ? '' : v.value);
        setFormSecret(v.is_secret);
        setFormErrors({});
    };

    const handleAdd = async () => {
        setSaving(true);
        setFormErrors({});
        try {
            const res = await fetch(`/apps/${app.id}/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ key: formKey, value: formValue, is_secret: formSecret }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setShowAddDialog(false);
            setHasChanges(true);
            fetchVars();
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = async () => {
        if (!editingVar) return;
        setSaving(true);
        setFormErrors({});
        try {
            const res = await fetch(`/apps/${app.id}/env/${editingVar.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ value: formValue, is_secret: formSecret }),
            });
            if (!res.ok) {
                const data = await res.json();
                setFormErrors(data.errors || {});
                return;
            }
            setEditingVar(null);
            setHasChanges(true);
            fetchVars();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingVar) return;
        await fetch(`/apps/${app.id}/env/${deletingVar.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
        });
        setDeletingVar(null);
        setHasChanges(true);
        fetchVars();
    };

    const mergedMap = new Map<string, EnvironmentVariable>();
    for (const v of teamVars) mergedMap.set(v.key, v);
    for (const v of appVars) mergedMap.set(v.key, v);
    const merged = Array.from(mergedMap.values()).sort((a, b) => a.key.localeCompare(b.key));

    if (loading) {
        return <EnvironmentLoadingSkeleton />;
    }

    return (
        <div className="space-y-4">
            {hasChanges && (
                <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <p className="text-sm font-medium">Environment variables have been updated. Deploy now to apply changes.</p>
                    <Button size="sm" disabled={deploying} onClick={() => {
                        setDeploying(true);
                        router.post(`/apps/${app.id}/deploy`, {}, {
                            onSuccess: () => { setHasChanges(false); toast.success('Deployed successfully.'); },
                            onError: (errors) => toast.error(errors.deploy || 'Deploy failed.'),
                            onFinish: () => setDeploying(false),
                        });
                    }}>
                        <Rocket className={`mr-2 h-3 w-3 ${deploying ? 'animate-spin' : ''}`} />
                        {deploying ? 'Deploying\u2026' : 'Deploy Now'}
                    </Button>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Environment Variables</CardTitle>
                    <Button size="sm" onClick={openAdd}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add Variable
                    </Button>
                </CardHeader>
                <CardContent>
                    {merged.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            No environment variables configured. Add variables to inject them into your app's runtime.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Key</th>
                                        <th className="pb-2 pr-4">Value</th>
                                        <th className="pb-2 pr-4">Source</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {merged.map((v) => (
                                        <tr key={`${v.source}-${v.id}`} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs font-medium">{v.key}</td>
                                            <td className="py-2 pr-4 font-mono text-xs">
                                                {v.is_secret ? (
                                                    <span className="flex items-center gap-2">
                                                        {revealedIds.has(v.id) ? v.value || '(encrypted)' : '********'}
                                                        <button onClick={() => toggleReveal(v.id)} className="text-muted-foreground hover:text-foreground">
                                                            {revealedIds.has(v.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="max-w-[300px] truncate">{v.value}</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge variant={v.source === 'app' ? 'default' : 'secondary'}>{v.source === 'app' ? 'App' : 'Team'}</Badge>
                                            </td>
                                            <td className="py-2">
                                                {v.source === 'app' && (
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => setDeletingVar(v)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Environment Variable</DialogTitle>
                        <DialogDescription>Add an app-level environment variable. It will be injected as a key-value pair in the .env file.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="env-key">Key</Label>
                            <Input
                                id="env-key"
                                placeholder="MY_API_KEY"
                                value={formKey}
                                onChange={(e) => setFormKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                className="font-mono"
                            />
                            {formErrors.key && <p className="mt-1 text-xs text-red-500">{formErrors.key[0]}</p>}
                        </div>
                        <div>
                            <Label htmlFor="env-value">Value</Label>
                            <Textarea id="env-value" placeholder="Enter value..." value={formValue} onChange={(e) => setFormValue(e.target.value)} rows={3} className="font-mono" />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="env-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="env-secret" className="text-sm font-normal">
                                Mark as secret (value will be masked in the UI)
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAdd} disabled={saving || !formKey || !formValue}>
                            {saving ? 'Adding...' : 'Add Variable'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingVar} onOpenChange={(open) => !open && setEditingVar(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Environment Variable</DialogTitle>
                        <DialogDescription>
                            Update the value for <span className="font-mono font-semibold">{editingVar?.key}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="edit-value">Value</Label>
                            <Textarea
                                id="edit-value"
                                placeholder="Enter new value..."
                                value={formValue}
                                onChange={(e) => setFormValue(e.target.value)}
                                rows={3}
                                className="font-mono"
                            />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="edit-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="edit-secret" className="text-sm font-normal">
                                Mark as secret
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingVar(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEdit} disabled={saving || !formValue}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingVar} onOpenChange={(open) => !open && setDeletingVar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deletingVar?.key}?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove this environment variable. You'll need to redeploy for changes to take effect.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
