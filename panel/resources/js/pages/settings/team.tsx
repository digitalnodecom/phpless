import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsLayout from '@/layouts/settings/layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type TeamInvitation, type TeamMember } from '@/types';
import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';

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
    flash?: { inviteUrl?: string; success?: string };
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Settings', href: '/settings/profile' },
    { title: 'Team', href: '/settings/team' },
];

export default function TeamSettings({ team, members, pendingInvitations, isOwner, flash }: Props) {
    const nameForm = useForm({ name: team.name });
    const inviteForm = useForm({ email: '' });
    const [copied, setCopied] = useState<number | string | null>(null);

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
        if (confirm('Remove this member from the team?')) {
            router.delete(route('settings.team.remove', userId));
        }
    }

    function revokeInvitation(invId: number) {
        if (confirm('Revoke this invitation?')) {
            router.delete(route('settings.team.invitations.destroy', invId));
        }
    }

    function leaveTeam() {
        if (confirm('Are you sure you want to leave this team?')) {
            router.post(route('settings.team.leave'));
        }
    }

    // If flash has an inviteUrl (just created), show it at top of invites
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
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${member.is_owner ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {member.is_owner ? 'Owner' : 'Member'}
                                    </span>
                                    {isOwner && !member.is_owner && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeMember(member.id)}
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
                            <Button variant="destructive" size="sm" onClick={leaveTeam}>
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

                            {/* Show newly created URL */}
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

                            {/* Pending invitations table */}
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
                                                onClick={() => revokeInvitation(inv.id)}
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
            </SettingsLayout>
        </AppLayout>
    );
}
