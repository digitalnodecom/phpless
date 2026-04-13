import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsLayout from '@/layouts/settings/layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface TeamData {
    id: number;
    name: string;
    slug: string;
    owner_id: number;
}

interface Props {
    team: TeamData;
    isOwner: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Team Settings', href: '/settings/team' },
    { title: 'General', href: '/settings/team' },
];

export default function TeamGeneral({ team, isOwner }: Props) {
    const nameForm = useForm({ name: team.name });

    function submitName(e: React.FormEvent) {
        e.preventDefault();
        nameForm.put(route('settings.team.update'));
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Team Settings" />
            <SettingsLayout>
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

                <div className="space-y-2">
                    <div>
                        <h3 className="text-lg font-medium">Team Slug</h3>
                        <p className="text-sm text-muted-foreground">
                            Your team's unique identifier: <span className="font-mono font-medium">{team.slug}</span>
                        </p>
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
