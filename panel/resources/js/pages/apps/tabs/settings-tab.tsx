import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type App } from '@/types';
import { router } from '@inertiajs/react';
import { Activity, Clock, FolderOpen, Globe, Hammer, ChevronRight, Plus, RefreshCw, Server, Shield, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function IpAllowlistCard({ app }: { app: App }) {
    const [ips, setIps] = useState<string[]>(app.ip_allowlist ?? []);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const addIp = () => { setIps([...ips, '']); setDirty(true); };
    const removeIp = (i: number) => { setIps(ips.filter((_, idx) => idx !== i)); setDirty(true); };
    const updateIp = (i: number, value: string) => {
        const updated = [...ips];
        updated[i] = value;
        setIps(updated);
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(`/apps/${app.id}/ip-allowlist`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ ip_allowlist: ips.filter((ip) => ip.trim() !== '') }),
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ text: data.message, type: 'success' });
                setDirty(false);
            } else {
                setMsg({ text: data.message || 'Failed to save.', type: 'error' });
            }
        } catch {
            setMsg({ text: 'Failed to save.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    IP Allowlist
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addIp}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add IP
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {msg && (
                    <div className={`rounded-lg border p-3 ${msg.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                )}

                {ips.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No IP restrictions. All traffic is allowed. Add IPs to restrict access.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {ips.map((ip, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input
                                    value={ip}
                                    onChange={(e) => updateIp(i, e.target.value)}
                                    placeholder="192.168.1.0/24 or 1.2.3.4"
                                    className="max-w-xs font-mono text-sm"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeIp(i)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-muted-foreground text-xs">
                    Restrict access to specific IP addresses or CIDR ranges. Applies to both HTTP traffic and port-forwarded connections. Leave empty to allow all traffic.
                </p>

                {dirty && (
                    <Button onClick={save} disabled={saving} size="sm">
                        {saving ? 'Saving...' : 'Save IP Allowlist'}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

function PortForwardingCard({ app }: { app: App }) {
    const [mappings, setMappings] = useState<Array<{ external: number; internal: number; protocol: 'tcp' | 'udp' }>>(
        app.port_mappings ?? [],
    );
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [dirty, setDirty] = useState(false);

    const addMapping = () => {
        setMappings([...mappings, { external: 0, internal: 0, protocol: 'tcp' }]);
        setDirty(true);
    };

    const removeMapping = (i: number) => {
        setMappings(mappings.filter((_, idx) => idx !== i));
        setDirty(true);
    };

    const updateMapping = (i: number, field: string, value: number | string) => {
        const updated = [...mappings];
        updated[i] = { ...updated[i], [field]: value };
        setMappings(updated);
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(`/apps/${app.id}/port-mappings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ port_mappings: mappings.filter((m) => m.external > 0 && m.internal > 0) }),
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ text: data.message, type: 'success' });
                setDirty(false);
            } else {
                setMsg({ text: data.message || 'Failed to save.', type: 'error' });
            }
        } catch {
            setMsg({ text: 'Failed to save port mappings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Port Forwarding
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addMapping}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add Port
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {msg && (
                    <div className={`rounded-lg border p-3 ${msg.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                )}

                {mappings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No ports forwarded. Add a mapping to expose a VM port on the server's public IP.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {mappings.map((m, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={m.external || ''}
                                    onChange={(e) => updateMapping(i, 'external', parseInt(e.target.value) || 0)}
                                    placeholder="External"
                                    className="w-28 font-mono text-sm"
                                />
                                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                                <Input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={m.internal || ''}
                                    onChange={(e) => updateMapping(i, 'internal', parseInt(e.target.value) || 0)}
                                    placeholder="Internal"
                                    className="w-28 font-mono text-sm"
                                />
                                <Select value={m.protocol} onValueChange={(v) => updateMapping(i, 'protocol', v)}>
                                    <SelectTrigger className="w-20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tcp">TCP</SelectItem>
                                        <SelectItem value="udp">UDP</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" onClick={() => removeMapping(i)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-muted-foreground text-xs">
                    Forward ports on the server's public IP directly to your VM. Each external port can only be used by one app.
                    Changes take effect immediately for running VMs.
                </p>

                {dirty && (
                    <Button onClick={save} disabled={saving} size="sm">
                        {saving ? 'Saving...' : 'Save Port Mappings'}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

function DangerZoneCard({ app }: { app: App }) {
    const handleDelete = () => {
        router.delete(`/apps/${app.id}`);
    };

    return (
        <Card className="border-destructive/30">
            <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Danger Zone
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex-1">
                        <h4 className="text-sm font-medium">Delete this app</h4>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Permanently destroy the VM, deployed code, environment variables, and all associated data. This action cannot be undone.
                        </p>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete app
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently destroy the VM and all associated data including env vars, deployed code, and persistent files. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete permanently
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}

export default function SettingsTab({ app }: { app: App }) {
    const [workerMode, setWorkerMode] = useState(app.worker_mode);
    const [workerScript, setWorkerScript] = useState(app.worker_script);
    const [workerCount, setWorkerCount] = useState(app.worker_count);
    const [mercureEnabled, setMercureEnabled] = useState(app.mercure_enabled);
    const [webRoot, setWebRoot] = useState(app.web_root || '/');
    const [vcpus, setVcpus] = useState(String(app.vcpus));
    const [memMib, setMemMib] = useState(String(app.mem_mib));
    const [buildCommand, setBuildCommand] = useState(app.build_command || '');
    const [cronEnabled, setCronEnabled] = useState(app.cron_enabled);
    const [saving, setSaving] = useState(false);
    const [generatingKeys, setGeneratingKeys] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const vmSizeChanged = vcpus !== String(app.vcpus) || memMib !== String(app.mem_mib);
    const hasChanges =
        workerMode !== app.worker_mode ||
        workerScript !== app.worker_script ||
        workerCount !== app.worker_count ||
        mercureEnabled !== app.mercure_enabled ||
        cronEnabled !== app.cron_enabled ||
        buildCommand !== (app.build_command || '') ||
        webRoot !== (app.web_root || '/') ||
        vmSizeChanged;

    const handleGenerateKeys = async () => {
        setGeneratingKeys(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/generate-mercure-keys`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'JWT keys generated. Redeploy to apply.', type: 'success' });
            } else {
                setMessage({ text: data.message || 'Failed to generate keys.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to generate keys.', type: 'error' });
        } finally {
            setGeneratingKeys(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({
                    worker_mode: workerMode,
                    worker_script: workerScript,
                    worker_count: workerCount,
                    mercure_enabled: mercureEnabled,
                    build_command: buildCommand || null,
                    cron_enabled: cronEnabled,
                    web_root: webRoot,
                    vcpus: parseInt(vcpus),
                    mem_mib: parseInt(memMib),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setMessage({ text: data.message || 'Settings saved.', type: 'success' });
                router.reload({ only: ['app'] });
            } else {
                const data = await res.json();
                setMessage({ text: data.message || 'Failed to save settings.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to save settings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        VM Resources
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="settings-mem">Memory</Label>
                            <Select value={memMib} onValueChange={setMemMib}>
                                <SelectTrigger id="settings-mem">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="256">256 MB</SelectItem>
                                    <SelectItem value="512">512 MB</SelectItem>
                                    <SelectItem value="1024">1024 MB</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="settings-vcpus">vCPUs</Label>
                            <Select value={vcpus} onValueChange={setVcpus}>
                                <SelectTrigger id="settings-vcpus">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 vCPU</SelectItem>
                                    <SelectItem value="2">2 vCPUs</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {vmSizeChanged && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-500">
                            Changing VM resources will destroy and recreate the VM with your code redeployed automatically.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Web Root
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-2">
                        <Label htmlFor="web-root">Document root directory</Label>
                        <Input
                            id="web-root"
                            value={webRoot}
                            onChange={(e) => setWebRoot(e.target.value)}
                            placeholder="public"
                            className="max-w-sm font-mono"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['/', 'public', 'public_html'].map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setWebRoot(preset)}
                                className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                                    webRoot === preset
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:border-primary/50'
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <p className="text-muted-foreground text-xs">
                        The directory inside your app served as the document root. Use <code className="bg-muted rounded px-1 py-0.5">/</code> for flat PHP apps,{' '}
                        <code className="bg-muted rounded px-1 py-0.5">public</code> for Laravel/Slim,{' '}
                        or <code className="bg-muted rounded px-1 py-0.5">public_html</code> for WordPress/Bedrock. Requires redeploy.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Hammer className="h-4 w-4" />
                        Build Command
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-2">
                        <Label htmlFor="build-command">Command to run after deploy</Label>
                        <Input
                            id="build-command"
                            value={buildCommand}
                            onChange={(e) => setBuildCommand(e.target.value)}
                            placeholder={
                                app.detected_framework === 'laravel'
                                    ? 'composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache && php artisan view:cache'
                                    : app.detected_framework && app.detected_framework !== 'vanilla'
                                        ? 'composer install --no-dev --optimize-autoloader'
                                        : 'e.g. composer install --no-dev'
                            }
                            className="max-w-full font-mono text-sm"
                        />
                    </div>
                    {app.detected_framework && app.detected_framework !== 'vanilla' && (
                        <p className="text-muted-foreground text-xs">
                            Detected framework: <strong>{app.detected_framework}</strong>.
                            {!buildCommand && ' The default build command will be used on next deploy.'}
                        </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                        Runs inside the VM after code is synced. Use this for <code className="bg-muted rounded px-1 py-0.5">composer install</code>,{' '}
                        cache warming, or other build steps. If the command fails, the deployment is marked as failed.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Worker Mode
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="worker-mode"
                            checked={workerMode}
                            onCheckedChange={(v) => setWorkerMode(v === true)}
                        />
                        <Label htmlFor="worker-mode" className="text-sm font-normal">
                            Enable worker mode
                        </Label>
                    </div>

                    {workerMode && (
                        <div className="space-y-3 pl-6">
                            <div>
                                <Label htmlFor="worker-script">Worker script</Label>
                                <Input
                                    id="worker-script"
                                    value={workerScript}
                                    onChange={(e) => setWorkerScript(e.target.value)}
                                    placeholder="public/index.php"
                                    className="mt-1 max-w-sm font-mono"
                                />
                            </div>
                            <div>
                                <Label htmlFor="worker-count">Worker count</Label>
                                <Input
                                    id="worker-count"
                                    type="number"
                                    min={1}
                                    max={16}
                                    value={workerCount}
                                    onChange={(e) => setWorkerCount(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)))}
                                    className="mt-1 max-w-[100px]"
                                />
                            </div>
                        </div>
                    )}

                    <p className="text-muted-foreground text-xs">
                        Worker mode keeps your PHP script in memory for faster response times. Your entry script must use{' '}
                        <code className="bg-muted rounded px-1 py-0.5">frankenphp_handle_request()</code>. Compatible with Laravel Octane.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Mercure (Real-time Push)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="mercure-enabled"
                            checked={mercureEnabled}
                            onCheckedChange={(v) => setMercureEnabled(v === true)}
                        />
                        <Label htmlFor="mercure-enabled" className="text-sm font-normal">
                            Enable Mercure
                        </Label>
                    </div>

                    {mercureEnabled && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateKeys}
                            disabled={generatingKeys}
                        >
                            <RefreshCw className={`mr-2 h-3 w-3 ${generatingKeys ? 'animate-spin' : ''}`} />
                            {generatingKeys ? 'Generating...' : 'Generate JWT Keys'}
                        </Button>
                    )}

                    <p className="text-muted-foreground text-xs">
                        Enables real-time push via Server-Sent Events. Use the button above to auto-generate{' '}
                        <code className="bg-muted rounded px-1 py-0.5">MERCURE_PUBLISHER_JWT_KEY</code> and{' '}
                        <code className="bg-muted rounded px-1 py-0.5">MERCURE_SUBSCRIBER_JWT_KEY</code>, or set them manually in the Environment tab.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Scheduled Tasks
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="cron-enabled"
                            checked={cronEnabled}
                            onCheckedChange={(v) => setCronEnabled(v === true)}
                        />
                        <Label htmlFor="cron-enabled" className="text-sm font-normal">
                            Enable Laravel Scheduler
                        </Label>
                    </div>

                    {cronEnabled && (
                        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                            <p className="text-sm">
                                Runs <code className="bg-muted rounded px-1 py-0.5">php artisan schedule:run</code> every minute inside your VM.
                            </p>
                        </div>
                    )}

                    <p className="text-muted-foreground text-xs">
                        Enables the Laravel task scheduler via cron. Define your scheduled tasks in{' '}
                        <code className="bg-muted rounded px-1 py-0.5">app/Console/Kernel.php</code> or using the{' '}
                        <code className="bg-muted rounded px-1 py-0.5">Schedule</code> facade. Requires redeploy.
                    </p>
                </CardContent>
            </Card>

            <IpAllowlistCard app={app} />

            <PortForwardingCard app={app} />

            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving || !hasChanges}>
                    {saving ? (vmSizeChanged ? 'Resizing VM...' : 'Saving...') : 'Save Settings'}
                </Button>
                {hasChanges && (
                    <p className="text-muted-foreground text-sm">You have unsaved changes.</p>
                )}
            </div>

            <DangerZoneCard app={app} />
        </div>
    );
}
