import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { type App } from '@/types';
import { CheckCircle, Database, ExternalLink, Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className={`mt-1 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
        </div>
    );
}

function GetStartedCard({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-onboarding-dismissed-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-onboarding-dismissed-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-primary/30 bg-primary/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Rocket className="h-4 w-4" />
                    Get Started
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <p className="text-sm font-medium">Deploy via CLI</p>
                        <code className="bg-muted mt-1 block rounded px-3 py-2 text-xs">phpless init && phpless deploy</code>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Deploy via upload</p>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Upload a zip in the{' '}
                            <button onClick={() => document.querySelector<HTMLButtonElement>('[data-value="deployments"]')?.click()} className="text-primary underline underline-offset-2">
                                Deployments
                            </button>{' '}
                            tab.
                        </p>
                    </div>
                    <div>
                        <p className="text-sm font-medium">Connect GitHub</p>
                        <p className="text-muted-foreground mt-1 text-sm">Coming soon — push to deploy.</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function FirstDeployBanner({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-first-deploy-seen-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    const hasSuccessfulDeploy = app.deployments?.some((d) => d.status === 'completed' || d.status === 'success');
    const isFirstDeploy = hasSuccessfulDeploy && (app.deployments?.filter((d) => d.status === 'completed' || d.status === 'success').length ?? 0) <= 1;

    if (dismissed || !isFirstDeploy) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-first-deploy-seen-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    const appUrl = `https://${app.slug}.phpless.digitalno.de`;

    return (
        <Card className="border-green-500/30 bg-green-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <CheckCircle className="h-6 w-6 shrink-0 text-green-500" />
                <div className="flex-1">
                    <p className="font-medium">Your app is live!</p>
                    <p className="text-muted-foreground text-sm">Visit it at {appUrl}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                    <a href={appUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Visit app
                    </a>
                </Button>
            </CardContent>
        </Card>
    );
}

function SqliteBackupBanner({ app }: { app: App }) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(`phpless-sqlite-backup-banner-${app.id}`) === '1';
        } catch {
            return false;
        }
    });

    const unbackedDbs = (app.sqlite_databases ?? []).filter((db) => !db.backup_enabled);
    if (dismissed || unbackedDbs.length === 0) return null;

    const handleDismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(`phpless-sqlite-backup-banner-${app.id}`, '1');
        } catch { /* ignore */ }
    };

    return (
        <Card className="border-blue-500/30 bg-blue-500/5 relative mb-4">
            <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-3"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
            <CardContent className="flex items-center gap-4 py-4">
                <Database className="h-6 w-6 shrink-0 text-blue-500" />
                <div className="flex-1">
                    <p className="font-medium">SQLite database detected</p>
                    <p className="text-muted-foreground text-sm">
                        {unbackedDbs.length === 1
                            ? `Found at ${unbackedDbs[0].path}. Enable backups to protect your data.`
                            : `${unbackedDbs.length} databases found without backups enabled.`}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.querySelector<HTMLButtonElement>('[value="database"]')?.click()}
                >
                    Enable backups
                </Button>
            </CardContent>
        </Card>
    );
}

export default function OverviewTab({ app }: { app: App }) {
    const appUrl = `https://${app.slug}.phpless.digitalno.de`;

    return (
        <>
            <FirstDeployBanner app={app} />
            <SqliteBackupBanner app={app} />
            {(!app.deployments || app.deployments.length === 0) && <GetStartedCard app={app} />}
            <Card>
                <CardHeader>
                    <CardTitle>VM Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <InfoRow label="VM ID" value={app.vm_id || '-'} mono />
                        <InfoRow label="IP Address" value={app.vm_ip || '-'} mono />
                        <InfoRow label="vCPUs" value={String(app.vcpus)} />
                        <InfoRow label="Memory" value={`${app.mem_mib} MB`} />
                        <InfoRow label="PHP Version" value={app.php_version} />
                        <InfoRow label="URL" value={appUrl} mono />
                    </div>
                    <Separator />
                    <div className="grid gap-4 md:grid-cols-2">
                        <InfoRow label="Slug" value={app.slug} mono />
                        <InfoRow label="Created" value={new Date(app.created_at).toLocaleString()} />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
