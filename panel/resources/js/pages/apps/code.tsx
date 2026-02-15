import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import CodeEditor from '@/components/code-editor';
import AppLayout from '@/layouts/app-layout';
import { type App, type BreadcrumbItem } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Loader2, Rocket, Save } from 'lucide-react';
import { useRef, useState } from 'react';

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

export default function AppsCode({ app, code }: { app: App; code: string }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Apps', href: '/apps' },
        { title: app.name, href: `/apps/${app.id}` },
        { title: 'Code', href: `/apps/${app.id}/code` },
    ];

    const codeRef = useRef(code);
    const [saving, setSaving] = useState(false);
    const [deploying, setDeploying] = useState(false);

    const flash = usePage().props.flash as { success?: string } | undefined;
    const errors = usePage().props.errors as Record<string, string> | undefined;

    function handleSave() {
        setSaving(true);
        router.put(
            `/apps/${app.id}/code`,
            { code: codeRef.current },
            {
                preserveScroll: true,
                onFinish: () => setSaving(false),
            },
        );
    }

    function handleDeploy() {
        setDeploying(true);
        router.post(
            `/apps/${app.id}/deploy`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setDeploying(false),
            },
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${app.name} — Code`} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{app.name}</h1>
                        <Badge variant={stateVariant(app.vm_state)}>{app.vm_state}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save
                        </Button>
                        <Button onClick={handleDeploy} disabled={deploying || app.vm_state !== 'running'}>
                            {deploying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                            Deploy
                        </Button>
                    </div>
                </div>

                {flash?.success && (
                    <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                        {flash.success}
                    </div>
                )}
                {errors?.deploy && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                        {errors.deploy}
                    </div>
                )}

                <div className="min-h-0 flex-1">
                    <CodeEditor value={code} onChange={(v) => (codeRef.current = v)} />
                </div>
            </div>
        </AppLayout>
    );
}
