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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsLayout from '@/layouts/settings/layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type TeamInvitation, type TeamMember } from '@/types';
import { Head, useForm, router } from '@inertiajs/react';
import { useState } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';

interface Props {
    team: { id: number; name: string; owner_id: number };
    members: TeamMember[];
    pendingInvitations: TeamInvitation[];
    isOwner: boolean;
    userRole?: string;
    flash?: { inviteUrl?: string; success?: string };
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
    { title: 'Team Settings', href: '/settings/team' },
    { title: 'Members', href: '/settings/team/members' },
];

export default function TeamMembers({ team, members, pendingInvitations, isOwner, flash }: Props) {
    const inviteForm = useForm({ email: '' });
    const [copied, setCopied] = useState<number | string | null>(null);
    const [removingMember, setRemovingMember] = useState<number | null>(null);
    const [revokingInvite, setRevokingInvite] = useState<number | null>(null);
    const [showLeaveDialog, setShowLeaveDialog] = useState(false);

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
            <Head title="Team Members" />
            <SettingsLayout>
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
