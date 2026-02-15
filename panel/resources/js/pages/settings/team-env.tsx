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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type EnvironmentVariable } from '@/types';
import { Head } from '@inertiajs/react';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Settings', href: '/settings/team/env' },
];

export default function TeamSettings({ vars: initialVars }: { vars: EnvironmentVariable[] }) {
    const [vars, setVars] = useState<EnvironmentVariable[]>(initialVars);
    const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingVar, setEditingVar] = useState<EnvironmentVariable | null>(null);
    const [deletingVar, setDeletingVar] = useState<EnvironmentVariable | null>(null);
    const [formKey, setFormKey] = useState('');
    const [formValue, setFormValue] = useState('');
    const [formSecret, setFormSecret] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    const fetchVars = async () => {
        const res = await fetch('/settings/team/env', { headers: { Accept: 'application/json' } });
        const data = await res.json();
        setVars(data.vars || []);
    };

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
            const res = await fetch('/settings/team/env', {
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
            const res = await fetch(`/settings/team/env/${editingVar.id}`, {
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
            fetchVars();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingVar) return;
        await fetch(`/settings/team/env/${deletingVar.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
        });
        setDeletingVar(null);
        fetchVars();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Settings" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <p className="text-muted-foreground text-sm">Manage your team settings and configuration.</p>
                </div>

                <Tabs defaultValue="environment">
                    <TabsList>
                        <TabsTrigger value="environment">Environment</TabsTrigger>
                    </TabsList>

                    <TabsContent value="environment" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Team Environment Variables</CardTitle>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                        Shared across all apps in your team. App-level variables override team-level on key collision.
                                    </p>
                                </div>
                                <Button size="sm" onClick={openAdd}>
                                    <Plus className="mr-2 h-3 w-3" />
                                    Add Variable
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {vars.length === 0 ? (
                                    <p className="text-muted-foreground py-4 text-center text-sm">
                                        No team environment variables configured. Variables added here will be available to all apps in the team.
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-muted-foreground border-b text-left text-xs">
                                                    <th className="pb-2 pr-4">Key</th>
                                                    <th className="pb-2 pr-4">Value</th>
                                                    <th className="pb-2 pr-4">Secret</th>
                                                    <th className="pb-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {vars.map((v) => (
                                                    <tr key={v.id} className="border-b last:border-0">
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
                                                                <span className="max-w-[400px] truncate">{v.value}</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-4">
                                                            {v.is_secret && <Badge variant="outline">Secret</Badge>}
                                                        </td>
                                                        <td className="py-2">
                                                            <div className="flex items-center gap-1">
                                                                <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                                                                    <Pencil className="h-3 w-3" />
                                                                </Button>
                                                                <Button variant="ghost" size="sm" onClick={() => setDeletingVar(v)}>
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
                    </TabsContent>
                </Tabs>
            </div>

            {/* Add Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Team Variable</DialogTitle>
                        <DialogDescription>This variable will be available to all apps in the team unless overridden at the app level.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="team-env-key">Key</Label>
                            <Input
                                id="team-env-key"
                                placeholder="STRIPE_SECRET_KEY"
                                value={formKey}
                                onChange={(e) => setFormKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                                className="font-mono"
                            />
                            {formErrors.key && <p className="mt-1 text-xs text-red-500">{formErrors.key[0]}</p>}
                        </div>
                        <div>
                            <Label htmlFor="team-env-value">Value</Label>
                            <Textarea id="team-env-value" placeholder="Enter value..." value={formValue} onChange={(e) => setFormValue(e.target.value)} rows={3} className="font-mono" />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="team-env-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="team-env-secret" className="text-sm font-normal">
                                Mark as secret
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
                        <DialogTitle>Edit Team Variable</DialogTitle>
                        <DialogDescription>
                            Update the value for <span className="font-mono font-semibold">{editingVar?.key}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="team-edit-value">Value</Label>
                            <Textarea
                                id="team-edit-value"
                                placeholder="Enter new value..."
                                value={formValue}
                                onChange={(e) => setFormValue(e.target.value)}
                                rows={3}
                                className="font-mono"
                            />
                            {formErrors.value && <p className="mt-1 text-xs text-red-500">{formErrors.value[0]}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="team-edit-secret" checked={formSecret} onCheckedChange={(v) => setFormSecret(v === true)} />
                            <Label htmlFor="team-edit-secret" className="text-sm font-normal">
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
                        <AlertDialogDescription>
                            This will remove this team-level variable. All apps using it will need to be redeployed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
