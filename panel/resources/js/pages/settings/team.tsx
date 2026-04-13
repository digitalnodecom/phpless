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
import { Textarea } from '@/components/ui/textarea';
import SettingsLayout from '@/layouts/settings/layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type EnvironmentVariable, type TeamInvitation, type TeamMember } from '@/types';
import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import { Copy, Check, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';

interface TeamData {
    id: number;
    name: string;
    slug: string;
    owner_id: number;
}

interface Props {
    team: TeamData;
    members: TeamMember[];
    pendingInvitations: TeamInvitation[];
    isOwner: boolean;
    userRole?: string;
    flash?: { inviteUrl?: string; success?: string };
    envVars?: EnvironmentVariable[];
}

const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
    owner: 'bg-primary/10 text-primary',
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    member: 'bg-muted text-muted-foreground',
    viewer: 'bg-muted text-muted-foreground',
};

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Settings', href: '/settings/profile' },
    { title: 'Team', href: '/settings/team' },
];

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function TeamEnvSection({ initialVars }: { initialVars: EnvironmentVariable[] }) {
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
        <>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium">Environment Variables</h3>
                        <p className="text-sm text-muted-foreground">
                            Shared across all apps in your team. App-level variables override team-level on key collision.
                        </p>
                    </div>
                    <Button size="sm" onClick={openAdd}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add Variable
                    </Button>
                </div>

                {vars.length === 0 ? (
                    <p className="text-muted-foreground py-4 text-center text-sm">
                        No team environment variables configured. Variables added here will be available to all apps in the team.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-muted-foreground border-b text-left text-xs">
                                    <th className="px-4 pb-2 pt-3 pr-4">Key</th>
                                    <th className="px-4 pb-2 pt-3 pr-4">Value</th>
                                    <th className="px-4 pb-2 pt-3 pr-4">Secret</th>
                                    <th className="px-4 pb-2 pt-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vars.map((v) => (
                                    <tr key={v.id} className="border-b last:border-0">
                                        <td className="px-4 py-2 pr-4 font-mono text-xs font-medium">{v.key}</td>
                                        <td className="px-4 py-2 pr-4 font-mono text-xs">
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
                                        <td className="px-4 py-2 pr-4">
                                            {v.is_secret && <Badge variant="outline">Secret</Badge>}
                                        </td>
                                        <td className="px-4 py-2">
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
        </>
    );
}

export default function TeamSettings({ team, members, pendingInvitations, isOwner, userRole, flash, envVars }: Props) {
    const nameForm = useForm({ name: team.name });
    const inviteForm = useForm({ email: '' });
    const [copied, setCopied] = useState<number | string | null>(null);
    const [removingMember, setRemovingMember] = useState<number | null>(null);
    const [revokingInvite, setRevokingInvite] = useState<number | null>(null);
    const [showLeaveDialog, setShowLeaveDialog] = useState(false);

    function submitName(e: React.FormEvent) {
        e.preventDefault();
        nameForm.put(route('settings.team.update'));
    }

    function submitInvite(e: React.FormEvent) {
        e.preventDefault();
        inviteForm.post(route('settings.team.invitations.store'), {
            onSuccess: () => inviteForm.reset(),
        });
    }

    function copyUrl(url: string, key: number | string) {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        });
    }

    function removeMember(userId: number) {
        router.delete(route('settings.team.remove', userId), {
            onFinish: () => setRemovingMember(null),
        });
    }

    function revokeInvitation(invId: number) {
        router.delete(route('settings.team.invitations.destroy', invId), {
            onFinish: () => setRevokingInvite(null),
        });
    }

    function leaveTeam() {
        router.post(route('settings.team.leave'));
    }

    const newInviteUrl = (flash as any)?.inviteUrl as string | undefined;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Team Settings" />
            <SettingsLayout>
                {/* Team Name */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">Team Name</h3>
                        <p className="text-sm text-muted-foreground">The name of your team visible to all members.</p>
                    </div>
                    <form onSubmit={submitName} className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="team-name">Name</Label>
                            <Input
                                id="team-name"
                                value={nameForm.data.name}
                                onChange={e => nameForm.setData('name', e.target.value)}
                                disabled={!isOwner || nameForm.processing}
                                className="max-w-sm"
                            />
                            {nameForm.errors.name && (
                                <p className="text-sm text-destructive">{nameForm.errors.name}</p>
                            )}
                        </div>
                        {isOwner && (
                            <Button type="submit" disabled={nameForm.processing}>
                                Save
                            </Button>
                        )}
                    </form>
                </div>

                <hr />

                {/* Members */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">Members</h3>
                        <p className="text-sm text-muted-foreground">People who have access to this team.</p>
                    </div>
                    <div className="rounded-md border divide-y">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="text-sm font-medium">{member.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isOwner && !member.is_owner ? (
                                        <select
                                            value={member.role}
                                            onChange={(e) => {
                                                router.put(route('settings.team.role', member.id), { role: e.target.value }, { preserveScroll: true });
                                            }}
                                            className="text-xs rounded border bg-background px-2 py-1"
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="member">Member</option>
                                            <option value="viewer">Viewer</option>
                                        </select>
                                    ) : (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role] || ROLE_COLORS.member}`}>
                                            {ROLE_LABELS[member.role] || member.role}
                                        </span>
                                    )}
                                    {isOwner && !member.is_owner && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setRemovingMember(member.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {!isOwner && (
                        <div className="pt-2">
                            <Button variant="destructive" size="sm" onClick={() => setShowLeaveDialog(true)}>
                                Leave Team
                            </Button>
                        </div>
                    )}
                </div>

                {/* Invitations (owner only) */}
                {isOwner && (
                    <>
                        <hr />
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-medium">Invite Link</h3>
                                <p className="text-sm text-muted-foreground">Generate a shareable link. Anyone with the link can join your team. Links expire after 7 days.</p>
                            </div>

                            {newInviteUrl && (
                                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                                    <span className="flex-1 truncate text-sm font-mono">{newInviteUrl}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyUrl(newInviteUrl, 'new')}
                                    >
                                        {copied === 'new' ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                                    </Button>
                                </div>
                            )}

                            <form onSubmit={submitInvite} className="flex items-end gap-2">
                                <div className="flex-1 space-y-1">
                                    <Label htmlFor="invite-email">Label (optional)</Label>
                                    <Input
                                        id="invite-email"
                                        placeholder="e.g. colleague@example.com"
                                        value={inviteForm.data.email}
                                        onChange={e => inviteForm.setData('email', e.target.value)}
                                        disabled={inviteForm.processing}
                                        className="max-w-sm"
                                    />
                                </div>
                                <Button type="submit" disabled={inviteForm.processing}>
                                    Create invite link
                                </Button>
                            </form>

                            {pendingInvitations.length > 0 && (
                                <div className="rounded-md border divide-y">
                                    {pendingInvitations.map(inv => (
                                        <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                                            <div className="flex-1 min-w-0">
                                                {inv.email && (
                                                    <p className="text-sm font-medium truncate">{inv.email}</p>
                                                )}
                                                <p className="text-xs text-muted-foreground font-mono truncate">{inv.url}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyUrl(inv.url, inv.id)}
                                            >
                                                {copied === inv.id ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setRevokingInvite(inv.id)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Environment Variables */}
                <hr />
                <TeamEnvSection initialVars={envVars ?? []} />

                {/* Remove Member AlertDialog */}
                <AlertDialog open={removingMember !== null} onOpenChange={(open) => !open && setRemovingMember(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This member will lose access to all team resources. They can be re-invited later.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removingMember !== null && removeMember(removingMember)}>
                                Remove
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Revoke Invitation AlertDialog */}
                <AlertDialog open={revokingInvite !== null} onOpenChange={(open) => !open && setRevokingInvite(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
                            <AlertDialogDescription>
                                The invite link will no longer work. You can create a new one if needed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revokingInvite !== null && revokeInvitation(revokingInvite)}>
                                Revoke
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Leave Team AlertDialog */}
                <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Leave this team?</AlertDialogTitle>
                            <AlertDialogDescription>
                                You will lose access to all team apps and resources. You'll need a new invitation to rejoin.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={leaveTeam}>Leave Team</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SettingsLayout>
        </AppLayout>
    );
}
