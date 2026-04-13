import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type App, type Deployment } from '@/types';
import { router } from '@inertiajs/react';
import { toast } from 'sonner';
import { CheckCircle, ChevronDown, ChevronRight, Copy, GitBranch, Link2, Link2Off, Rocket, RotateCcw, Terminal as TerminalIcon, X } from 'lucide-react';
import { useState } from 'react';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function commitUrl(repo: string | null, sha: string): string | null {
    if (!repo) return null;
    let base = repo.trim();
    if (base.match(/^[\w.-]+\/[\w.-]+$/)) base = `https://github.com/${base}`;
    base = base.replace(/\.git$/, '');
    if (!base.startsWith('https://')) return null;
    return `${base}/commit/${sha}`;
}

function GitHubConnectCard({ app }: { app: App }) {
    const [repo, setRepo] = useState(app.github_repo || '');
    const [branch, setBranch] = useState(app.github_branch || 'main');
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
    const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [deploying, setDeploying] = useState(false);

    const isConnected = !!app.github_repo;

    const copy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleConnect = () => {
        if (!repo.trim()) return;
        setConnecting(true);
        fetch(`/apps/${app.id}/github/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '' },
            body: JSON.stringify({ github_repo: repo.trim(), github_branch: branch.trim() || 'main' }),
        })
            .then((r) => r.json())
            .then((data) => {
                setWebhookUrl(data.webhook_url);
                setWebhookSecret(data.webhook_secret);
                toast.success('GitHub connected');
                router.reload({ only: ['app'] });
            })
            .catch(() => toast.error('Failed to connect'))
            .finally(() => setConnecting(false));
    };

    const handleDisconnect = () => {
        setDisconnecting(true);
        fetch(`/apps/${app.id}/github/disconnect`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '' },
        })
            .then(() => {
                setWebhookUrl(null);
                setWebhookSecret(null);
                setRepo('');
                toast.success('GitHub disconnected');
                router.reload({ only: ['app'] });
            })
            .catch(() => toast.error('Failed to disconnect'))
            .finally(() => setDisconnecting(false));
    };

    const handleDeployFromGit = () => {
        setDeploying(true);
        fetch(`/apps/${app.id}/github/deploy`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '' },
        })
            .then((r) => r.json())
            .then(() => {
                toast.success('Deploy from GitHub queued');
                router.reload({ only: ['app'] });
            })
            .catch(() => toast.error('Failed to queue deploy'))
            .finally(() => setDeploying(false));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    GitHub Integration
                    {isConnected && <Badge variant="default" className="ml-2 text-xs">Connected</Badge>}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {isConnected ? (
                    <>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Repository:</span>
                                <code className="font-mono text-sm">{app.github_repo}</code>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Branch:</span>
                                <code className="font-mono text-sm">{app.github_branch}</code>
                            </div>
                        </div>

                        {(webhookUrl || webhookSecret) && (
                            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                                <p className="text-xs font-medium">Webhook Setup</p>
                                <p className="text-muted-foreground text-xs">Add this URL as a webhook in your GitHub repo settings (Settings &rarr; Webhooks &rarr; Add webhook).</p>
                                {webhookUrl && (
                                    <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-1.5">
                                        <code className="break-all font-mono text-xs">{webhookUrl}</code>
                                        <Button variant="ghost" size="sm" onClick={() => copy(webhookUrl, 'webhook-url')}>
                                            {copied === 'webhook-url' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                )}
                                {webhookSecret && (
                                    <>
                                        <p className="text-xs font-medium">Secret</p>
                                        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-1.5">
                                            <code className="break-all font-mono text-xs">{webhookSecret}</code>
                                            <Button variant="ghost" size="sm" onClick={() => copy(webhookSecret, 'webhook-secret')}>
                                                {copied === 'webhook-secret' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                        <p className="text-muted-foreground text-xs">Set Content type to <code className="text-xs">application/json</code> and paste this secret.</p>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button onClick={handleDeployFromGit} disabled={deploying} size="sm">
                                <Rocket className={`mr-2 h-3 w-3 ${deploying ? 'animate-spin' : ''}`} />
                                {deploying ? 'Deploying...' : 'Deploy from GitHub'}
                            </Button>
                            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting} size="sm">
                                <Link2Off className="mr-2 h-3 w-3" />
                                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-muted-foreground text-sm">
                            Connect a GitHub repository to enable automatic deployments on push.
                        </p>
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="github-repo" className="text-xs">Repository</Label>
                                <Input
                                    id="github-repo"
                                    placeholder="https://github.com/user/repo or user/repo"
                                    value={repo}
                                    onChange={(e) => setRepo(e.target.value)}
                                    className="mt-1 font-mono text-sm"
                                />
                            </div>
                            <div>
                                <Label htmlFor="github-branch" className="text-xs">Branch</Label>
                                <Input
                                    id="github-branch"
                                    placeholder="main"
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                    className="mt-1 font-mono text-sm"
                                />
                            </div>
                            <Button onClick={handleConnect} disabled={connecting || !repo.trim()} size="sm">
                                <Link2 className="mr-2 h-3 w-3" />
                                {connecting ? 'Connecting...' : 'Connect'}
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function DeploymentTable({ deployments, githubRepo, appId }: { deployments: Deployment[]; githubRepo: string | null; appId: number }) {
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [rollingBack, setRollingBack] = useState<number | null>(null);
    const [confirmId, setConfirmId] = useState<number | null>(null);

    // The most recent succeeded deployment is the currently active one
    const activeDeployment = deployments.find((d) => d.status === 'succeeded');

    const handleRollback = async (deploymentId: number) => {
        setRollingBack(deploymentId);
        setConfirmId(null);
        try {
            const res = await fetch(`/apps/${appId}/rollback/${deploymentId}`, {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': getCookie('XSRF-TOKEN'), Accept: 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message);
                router.reload();
            } else {
                toast.error(data.message || 'Rollback failed.');
            }
        } catch {
            toast.error('Rollback failed.');
        } finally {
            setRollingBack(null);
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Source</th>
                        <th className="pb-2 pr-4">Commit</th>
                        <th className="pb-2 pr-4">Message</th>
                        <th className="pb-2 pr-4">Author</th>
                        <th className="pb-2 pr-4">Deployed</th>
                        <th className="pb-2 pr-4">Duration</th>
                        <th className="pb-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {deployments.map((d) => {
                        const shortSha = d.commit_sha?.substring(0, 7);
                        const url = d.commit_sha ? commitUrl(githubRepo, d.commit_sha) : null;
                        const hasBuildOutput = !!d.build_output;
                        const isExpanded = expandedId === d.id;
                        const isActive = activeDeployment?.id === d.id;
                        const canRollback = d.status === 'succeeded' && !isActive && d.has_build;

                        return (
                            <React.Fragment key={d.id}>
                                <tr
                                    className={`border-b last:border-0 ${hasBuildOutput ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                                    onClick={() => hasBuildOutput && setExpandedId(isExpanded ? null : d.id)}
                                >
                                    <td className="py-2 pr-4">
                                        <div className="flex items-center gap-1">
                                            {hasBuildOutput && (
                                                isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                                            )}
                                            <Badge variant={d.status === 'succeeded' ? 'default' : d.status === 'failed' ? 'destructive' : 'secondary'}>
                                                {d.status}
                                            </Badge>
                                            {isActive && (
                                                <Badge variant="outline" className="ml-1 border-green-500/50 text-green-600 text-[10px] dark:text-green-400">active</Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-2 pr-4">
                                        <Badge variant="outline" className="font-mono text-xs">
                                            {d.source ?? 'api'}
                                        </Badge>
                                    </td>
                                    <td className="py-2 pr-4 font-mono text-xs">
                                        {shortSha ? (
                                            url ? (
                                                <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                                                    {shortSha}
                                                </a>
                                            ) : (
                                                shortSha
                                            )
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                    <td className="max-w-48 truncate py-2 pr-4 text-xs">
                                        {d.rollback_of ? (
                                            <span className="text-muted-foreground">
                                                <RotateCcw className="mr-1 inline h-3 w-3" />
                                                {d.commit_message || '-'}
                                            </span>
                                        ) : (
                                            d.commit_message || '-'
                                        )}
                                    </td>
                                    <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                                        {d.commit_author || d.triggered_by?.name || '\u2014'}
                                    </td>
                                    <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                                        {d.created_at ? new Date(d.created_at).toLocaleString() : '-'}
                                    </td>
                                    <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                                        {d.started_at && d.completed_at
                                            ? Math.round((new Date(d.completed_at).getTime() - new Date(d.started_at).getTime()) / 1000) + 's'
                                            : '-'}
                                    </td>
                                    <td className="py-2 text-right">
                                        {canRollback && (
                                            confirmId === d.id ? (
                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-6 px-2 text-xs"
                                                        disabled={rollingBack === d.id}
                                                        onClick={() => handleRollback(d.id)}
                                                    >
                                                        {rollingBack === d.id ? 'Rolling back...' : 'Confirm'}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-1"
                                                        onClick={() => setConfirmId(null)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={(e) => { e.stopPropagation(); setConfirmId(d.id); }}
                                                >
                                                    <RotateCcw className="mr-1 h-3 w-3" />
                                                    Rollback
                                                </Button>
                                            )
                                        )}
                                    </td>
                                </tr>
                                {isExpanded && d.build_output && (
                                    <tr>
                                        <td colSpan={8} className="px-2 pb-3 pt-1">
                                            {d.status === 'failed' && d.log && (
                                                <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
                                                    <p className="text-sm font-medium text-red-600 dark:text-red-400">{d.log}</p>
                                                </div>
                                            )}
                                            <div className="rounded border bg-muted/50 p-3">
                                                <p className="text-muted-foreground mb-1 text-xs font-medium">Build Output</p>
                                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">{d.build_output}</pre>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function DeploymentsTab({ app }: { app: App }) {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    const installCmd = 'brew install phpless-cli';
    const deployCmd = `phpless deploy . --app ${app.slug}`;

    return (
        <div className="space-y-4">
            <GitHubConnectCard app={app} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TerminalIcon className="h-4 w-4" />
                        Deploy via CLI
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                        Deploy your PHP app from your local machine using the PHPless CLI.
                    </p>
                    <div className="space-y-2">
                        <p className="text-xs font-medium">1. Install the CLI</p>
                        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                            <code className="font-mono text-sm">{installCmd}</code>
                            <Button variant="ghost" size="sm" onClick={() => copy(installCmd, 'install')}>
                                {copied === 'install' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                        <p className="text-xs font-medium">2. Deploy your app</p>
                        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                            <code className="font-mono text-sm">{deployCmd}</code>
                            <Button variant="ghost" size="sm" onClick={() => copy(deployCmd, 'deploy')}>
                                {copied === 'deploy' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Rocket className="h-4 w-4" />
                        Deployment History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!app.deployments || app.deployments.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">No deployments yet.</p>
                    ) : (
                        <DeploymentTable deployments={app.deployments} githubRepo={app.github_repo} appId={app.id} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
