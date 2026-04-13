import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';

const accountNavItems: NavItem[] = [
    {
        title: 'Profile',
        url: '/settings/profile',
        icon: null,
    },
    {
        title: 'Password',
        url: '/settings/password',
        icon: null,
    },
    {
        title: 'Appearance',
        url: '/settings/appearance',
        icon: null,
    },
    {
        title: 'API Tokens',
        url: '/settings/api-tokens',
        icon: null,
    },
];

const teamNavItems: NavItem[] = [
    {
        title: 'General',
        url: '/settings/team',
        icon: null,
    },
    {
        title: 'Members',
        url: '/settings/team/members',
        icon: null,
    },
    {
        title: 'Environment Variables',
        url: '/settings/team/env',
        icon: null,
    },
    {
        title: 'Storage Endpoints',
        url: '/settings/team/storage',
        icon: null,
    },
    {
        title: 'Billing',
        url: '/settings/team/billing',
        icon: null,
    },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const currentPath = window.location.pathname;
    const isTeamSettings = currentPath.startsWith('/settings/team');

    const navItems = isTeamSettings ? teamNavItems : accountNavItems;
    const title = isTeamSettings ? 'Team Settings' : 'Account Settings';
    const description = isTeamSettings
        ? 'Manage your team configuration and members'
        : 'Manage your profile and account settings';

    return (
        <div className="px-4 py-6">
            <Heading title={title} description={description} />

            <div className="flex flex-col space-y-8 lg:flex-row lg:space-y-0 lg:space-x-12">
                <aside className="w-full max-w-xl lg:w-48">
                    <nav className="flex flex-col space-y-1 space-x-0">
                        {navItems.map((item) => (
                            <Button
                                key={item.url}
                                size="sm"
                                variant="ghost"
                                asChild
                                className={cn('w-full justify-start', {
                                    'bg-muted': currentPath === item.url,
                                })}
                            >
                                <Link href={item.url} prefetch>
                                    {item.title}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                </aside>

                <Separator className="my-6 md:hidden" />

                <div className="flex-1 md:max-w-2xl">
                    <section className="max-w-xl space-y-12">{children}</section>
                </div>
            </div>
        </div>
    );
}
