import { Button } from '@/components/ui/button';
import { type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';

interface InvitationData {
    id: number;
    token: string;
    team: { name: string };
    email: string | null;
    expires_at: string;
    is_expired: boolean;
    is_accepted: boolean;
}

interface Props {
    invitation: InvitationData;
    alreadyMember: boolean;
}

export default function InvitationShow({ invitation, alreadyMember }: Props) {
    const { auth } = usePage<SharedData>().props;
    const { post, processing } = useForm({});

    function accept() {
        post(route('invitations.accept', invitation.token));
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <Head title={`Join ${invitation.team.name}`} />

            <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm space-y-6 text-center">
                <div>
                    <h1 className="text-2xl font-bold">Team Invitation</h1>
                    <p className="text-muted-foreground mt-1">
                        You've been invited to join{' '}
                        <span className="font-semibold text-foreground">{invitation.team.name}</span>
                    </p>
                </div>

                {invitation.is_expired ? (
                    <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
                        This invitation has expired.
                    </div>
                ) : invitation.is_accepted ? (
                    <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
                        This invitation has already been accepted.
                    </div>
                ) : alreadyMember ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            You're already a member of <strong>{invitation.team.name}</strong>.
                        </p>
                        <Button asChild className="w-full">
                            <Link href={route('dashboard')}>Go to Dashboard</Link>
                        </Button>
                    </div>
                ) : auth?.user ? (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Accepting as <strong>{auth.user.email}</strong>
                        </p>
                        <Button className="w-full" onClick={accept} disabled={processing}>
                            {processing ? 'Joining...' : 'Accept Invitation'}
                        </Button>
                        <Button variant="ghost" asChild className="w-full">
                            <Link href={route('dashboard')}>Decline</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Log in or create an account to accept this invitation.
                        </p>
                        <Button asChild className="w-full">
                            <Link href={`/login?redirect=${encodeURIComponent(route('invitations.show', invitation.token))}`}>
                                Log in to accept
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
