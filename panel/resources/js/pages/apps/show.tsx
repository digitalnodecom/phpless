import React, { Suspense, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { type App, type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { toast } from 'sonner';
import { ExternalLink, Pencil, RefreshCw, Terminal as TerminalIcon } from 'lucide-react';

const OverviewTab = React.lazy(() => import('./tabs/overview-tab'));
const AnalyticsTab = React.lazy(() => import('./tabs/analytics-tab'));
const LogsTab = React.lazy(() => import('./tabs/logs-tab'));
const DeploymentsTab = React.lazy(() => import('./tabs/deployments-tab'));
const FilesTab = React.lazy(() => import('./tabs/files-tab'));
const DomainsTab = React.lazy(() => import('./tabs/domains-tab'));
const EnvironmentTab = React.lazy(() => import('./tabs/environment-tab'));
const WorkersTab = React.lazy(() => import('./tabs/workers-tab'));
const TerminalTab = React.lazy(() => import('./tabs/terminal-tab'));
const SettingsTab = React.lazy(() => import('./tabs/settings-tab'));

function stateVariant(state: string) {
    switch (state) {
        case 'running':
            return 'default' as const;
        case 'creating':
        case 'starting':
            return 'secondary' as const;
        case 'stopped':
            return 'outline' as const;
        default:
            return 'destructive' as const;
    }
}

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function TabFallback() {
    return (
        <Card>
            <CardContent className="py-8">
                <div className="space-y-3">
                    <Skeleton className="mx-auto h-5 w-48" />
                    <Skeleton className="mx-auto h-4 w-32" />
                </div>
            </CardContent>
        </Card>
    );
}

export default function AppsShow({ app, serverIp }: { app: App; serverIp: string }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Apps', href: '/apps' },
        { title: app.name, href: `/apps/${app.id}` },
    ];

    const appUrl = `https://${app.slug}.phpless.digitalno.de`;
    const domain = 'phpless.digitalno.de';

    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(app.name);
    const [renamingName, setRenamingName] = useState(false);

    const [editingSlug, setEditingSlug] = useState(false);
    const [newSlug, setNewSlug] = useState(app.slug);
    const [slugError, setSlugError] = useState('');
    const [renamingSlug, setRenamingSlug] = useState(false);
    const [redeploying, setRedeploying] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [fileBrowserPath, setFileBrowserPath] = useState('');

    useEffect(() => {
        window.history.replaceState({ tab: 'overview', fileBrowserPath: '' }, '');
        const handlePopState = (e: PopStateEvent) => {
            if (e.state && 'tab' in e.state) {
                setActiveTab(e.state.tab as string);
                setFileBrowserPath((e.state.fileBrowserPath as string) ?? '');
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        window.history.pushState({ tab, fileBrowserPath: tab === 'files' ? fileBrowserPath : '' }, '');
    };

    const handleFilesNavigate = (path: string) => {
        setFileBrowserPath(path);
        window.history.pushState({ tab: 'files', fileBrowserPath: path }, '');
    };

    const saveField = async (field: 'name' | 'slug', value: string) => {
        const res = await fetch(`/apps/${app.id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ [field]: value }),
        });
        return res;
    };

    const handleRenameName = async () => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === app.name) { setEditingName(false); setNewName(app.name); return; }
        setRenamingName(true);
        try {
            const res = await saveField('name', trimmed);
            if (res.ok) { setEditingName(false); router.reload(); }
        } finally {
            setRenamingName(false);
        }
    };

    const handleRenameSlug = async () => {
        const trimmed = newSlug.trim().toLowerCase();
        if (!trimmed || trimmed === app.slug) { setEditingSlug(false); setNewSlug(app.slug); return; }
        setSlugError('');
        setRenamingSlug(true);
        try {
            const res = await saveField('slug', trimmed);
            if (res.ok) {
                setEditingSlug(false);
                router.reload();
            } else {
                const data = await res.json();
                setSlugError(data.errors?.slug?.[0] ?? 'That URL is already taken.');
            }
        } finally {
            setRenamingSlug(false);
        }
    };

    function handleRedeploy() {
        setRedeploying(true);
        router.post(`/apps/${app.id}/deploy`, {}, {
            onSuccess: () => toast.success('Deployed successfully.'),
            onError: (errors) => toast.error((errors as Record<string, string>).deploy || 'Deploy failed.'),
            onFinish: () => setRedeploying(false),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={app.name} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            {editingName ? (
                                <form onSubmit={(e) => { e.preventDefault(); handleRenameName(); }} className="flex items-center gap-2">
                                    <Input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="h-9 text-lg font-bold"
                                        autoFocus
                                        disabled={renamingName}
                                        onKeyDown={(e) => { if (e.key === 'Escape') { setEditingName(false); setNewName(app.name); } }}
                                    />
                                    <Button size="sm" type="submit" disabled={renamingName || !newName.trim()}>
                                        {renamingName ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button size="sm" variant="ghost" type="button" onClick={() => { setEditingName(false); setNewName(app.name); }}>
                                        Cancel
                                    </Button>
                                </form>
                            ) : (
                                <button onClick={() => setEditingName(true)} className="group flex items-center gap-2">
                                    <h1 className="text-2xl font-bold">{app.name}</h1>
                                    <Pencil className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                                </button>
                            )}
                            <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                            {app.detected_framework && app.detected_framework !== 'vanilla' && (
                                <Badge variant="outline" className="text-xs capitalize">{app.detected_framework}</Badge>
                            )}
                        </div>

                        {editingSlug ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleRenameSlug(); }} className="flex items-center gap-1">
                                <span className="text-muted-foreground font-mono text-sm">https://</span>
                                <Input
                                    value={newSlug}
                                    onChange={(e) => { setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '')); setSlugError(''); }}
                                    className="h-7 w-40 font-mono text-sm"
                                    autoFocus
                                    disabled={renamingSlug}
                                    onKeyDown={(e) => { if (e.key === 'Escape') { setEditingSlug(false); setNewSlug(app.slug); setSlugError(''); } }}
                                />
                                <span className="text-muted-foreground font-mono text-sm">.{domain}</span>
                                <Button size="sm" type="submit" disabled={renamingSlug || !newSlug.trim()} className="ml-1 h-7 text-xs">
                                    {renamingSlug ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" variant="ghost" type="button" onClick={() => { setEditingSlug(false); setNewSlug(app.slug); setSlugError(''); }} className="h-7 text-xs">
                                    Cancel
                                </Button>
                                {slugError && <span className="ml-1 text-xs text-red-500">{slugError}</span>}
                            </form>
                        ) : (
                            <button onClick={() => setEditingSlug(true)} className="group flex items-center gap-1">
                                <span className="text-muted-foreground font-mono text-sm">https://{app.slug}.{domain}</span>
                                <Pencil className="text-muted-foreground h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {app.vm_state === 'running' && (
                            <Button variant="outline" asChild>
                                <a href={appUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Visit
                                </a>
                            </Button>
                        )}
                        <Button variant="outline" onClick={handleRedeploy} disabled={redeploying}>
                            <RefreshCw className={`mr-2 h-4 w-4 ${redeploying ? 'animate-spin' : ''}`} />
                            {redeploying ? 'Deploying\u2026' : 'Redeploy'}
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                        <TabsTrigger value="deployments" data-value="deployments">Deployments</TabsTrigger>
                        <TabsTrigger value="files">Files</TabsTrigger>
                        <TabsTrigger value="domains">Domains</TabsTrigger>
                        <TabsTrigger value="environment">Environment</TabsTrigger>
                        <TabsTrigger value="workers">Workers</TabsTrigger>
                        <TabsTrigger value="terminal">
                            <TerminalIcon className="mr-1 h-3 w-3" />
                            Terminal
                        </TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <OverviewTab app={app} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="analytics" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <AnalyticsTab appId={app.id} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="logs" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <LogsTab appId={app.id} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="deployments" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <DeploymentsTab app={app} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="files" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <FilesTab app={app} currentPath={fileBrowserPath} onNavigate={handleFilesNavigate} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="domains" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <DomainsTab app={app} serverIp={serverIp} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="environment" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <EnvironmentTab app={app} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="workers" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <WorkersTab app={app} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="terminal" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <TerminalTab app={app} />
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="settings" className="mt-4">
                        <Suspense fallback={<TabFallback />}>
                            <SettingsTab app={app} />
                        </Suspense>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}
