import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { TeamSwitcher } from '@/components/team-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem } from '@/types';
import { usePage } from '@inertiajs/react';
import { BookOpen, Boxes, Code2, LayoutGrid, ShieldCheck } from 'lucide-react';
import { Link } from '@inertiajs/react';
import AppLogo from './app-logo';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: LayoutGrid,
    },
    {
        title: 'Apps',
        url: '/apps',
        icon: Boxes,
    },
];

const footerNavItems: NavItem[] = [
    {
        title: 'Documentation',
        url: '/docs',
        icon: BookOpen,
    },
    {
        title: 'API Reference',
        url: '/docs/api',
        icon: Code2,
    },
];

export function AppSidebar() {
    const { auth } = usePage<{ auth: { user: { is_admin: boolean } } }>().props;

    const allNavItems = auth.user.is_admin
        ? [...mainNavItems, { title: 'Admin', url: '/admin', icon: ShieldCheck }]
        : mainNavItems;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={allNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <TeamSwitcher />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
