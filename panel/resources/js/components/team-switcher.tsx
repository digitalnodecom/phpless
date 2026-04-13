import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { Check, ChevronsUpDown, Plus, Settings2, Users } from 'lucide-react';
import { useState } from 'react';

export function TeamSwitcher() {
    const { currentTeam, userTeams } = usePage<SharedData>().props;
    const { state } = useSidebar();
    const isMobile = useIsMobile();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!currentTeam) return null;

    function switchTeam(teamId: number) {
        // Defer navigation so Radix dropdown can finish closing and clean up
        // pointer-events on document.body before Inertia swaps the page.
        setTimeout(() => {
            router.post(route('teams.switch', teamId), {}, {
                onFinish: () => {
                    // Safety net: Radix Dropdown can leave pointer-events:none on body
                    // if the page swaps mid-close. Reset it.
                    document.body.style.pointerEvents = '';
                },
            });
        }, 0);
    }

    function createTeam(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        setError(null);
        router.post(
            route('teams.store'),
            { name: teamName },
            {
                onSuccess: () => {
                    setDialogOpen(false);
                    setTeamName('');
                },
                onError: (errors) => {
                    setError(errors.name || 'Failed to create team');
                },
                onFinish: () => setCreating(false),
            },
        );
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                    <Users className="size-4" />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{currentTeam.name}</span>
                                    <span className="text-muted-foreground truncate text-xs">
                                        {userTeams?.length ?? 1} team{(userTeams?.length ?? 1) !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <ChevronsUpDown className="ml-auto size-4" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            align="start"
                            side={isMobile ? 'bottom' : state === 'collapsed' ? 'right' : 'top'}
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-xs">Your Teams</DropdownMenuLabel>
                            <DropdownMenuGroup>
                                {(userTeams ?? []).map((team) => (
                                    <DropdownMenuItem
                                        key={team.id}
                                        onSelect={() => switchTeam(team.id)}
                                        className="cursor-pointer gap-2"
                                    >
                                        <div className="bg-muted flex size-6 items-center justify-center rounded">
                                            <Users className="size-3" />
                                        </div>
                                        <span className="flex-1">{team.name}</span>
                                        {currentTeam.id === team.id && <Check className="size-4 text-primary" />}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild className="cursor-pointer gap-2">
                                <Link href="/settings/team">
                                    <div className="bg-muted flex size-6 items-center justify-center rounded">
                                        <Settings2 className="size-3" />
                                    </div>
                                    <span className="text-muted-foreground">Team settings</span>
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer gap-2"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setDialogOpen(true);
                                }}
                            >
                                <div className="bg-muted flex size-6 items-center justify-center rounded">
                                    <Plus className="size-3" />
                                </div>
                                <span className="text-muted-foreground">Create new team</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create a new team</DialogTitle>
                        <DialogDescription>
                            Teams are isolated workspaces. Apps, environment variables, and members are scoped per team.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createTeam} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="team-name">Team Name</Label>
                            <Input
                                id="team-name"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="Acme Inc"
                                autoFocus
                                required
                            />
                            {error && <p className="text-destructive text-sm">{error}</p>}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating || teamName.trim() === ''}>
                                {creating ? 'Creating...' : 'Create Team'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
