import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type App, type WorkerDef, type WorkerStatus } from '@/types';
import { Plus, Rocket, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

export default function WorkersTab({ app }: { app: App }) {
    const [defs, setDefs] = useState<WorkerDef[]>(app.workers ?? []);
    const [statuses, setStatuses] = useState<WorkerStatus[]>([]);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logWorker, setLogWorker] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (app.vm_state !== 'running') return;
        let cancelled = false;
        const poll = () => {
            fetch(`/apps/${app.id}/workers/status`)
                .then((r) => r.json())
                .then((data) => { if (!cancelled) setStatuses(data.workers ?? []); })
                .catch(() => toast.error('Failed to fetch worker status'));
        };
        poll();
        const interval = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [app.id, app.vm_state]);

    const addWorker = () => {
        setDefs([...defs, { name: `worker-${defs.length + 1}`, command: '', processes: 1 }]);
        setDirty(true);
    };

    const removeWorker = (index: number) => {
        setDefs(defs.filter((_, i) => i !== index));
        setDirty(true);
    };

    const updateWorker = (index: number, field: keyof WorkerDef, value: string | number) => {
        const updated = [...defs];
        updated[index] = { ...updated[index], [field]: value };
        setDefs(updated);
        setDirty(true);
    };

    const save = () => {
        setSaving(true);
        fetch(`/apps/${app.id}/workers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ workers: defs }),
        })
            .then((r) => r.json())
            .then((data) => {
                toast.success(data.message);
                setDirty(false);
            })
            .catch(() => toast.error('Failed to save workers'))
            .finally(() => setSaving(false));
    };

    const viewLogs = (name: string, index: number = 0) => {
        setLogWorker(`${name}:${index}`);
        fetch(`/apps/${app.id}/workers/logs?name=${name}&index=${index}&lines=200`)
            .then((r) => r.json())
            .then((data) => setLogLines(data.lines ?? []))
            .catch(() => setLogLines(['Failed to load logs']));
    };

    const formatUptime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const stateColor = (state: string) => {
        switch (state) {
            case 'running': return 'default' as const;
            case 'backoff': return 'destructive' as const;
            case 'stopped': return 'outline' as const;
            default: return 'secondary' as const;
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Worker Definitions</CardTitle>
                    <div className="flex gap-2">
                        {dirty && (
                            <Button onClick={save} disabled={saving} size="sm">
                                <Rocket className="mr-1 h-3 w-3" />
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                        )}
                        <Button onClick={addWorker} variant="outline" size="sm">
                            <Plus className="mr-1 h-3 w-3" />
                            Add Worker
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {defs.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            No workers configured. Add a worker to run background processes like queue workers.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {defs.map((def, i) => (
                                <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                                    <div className="grid flex-1 gap-3 md:grid-cols-[1fr_2fr_80px]">
                                        <div>
                                            <Label className="text-xs">Name</Label>
                                            <Input
                                                value={def.name}
                                                onChange={(e) => updateWorker(i, 'name', e.target.value)}
                                                placeholder="queue"
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Command</Label>
                                            <Input
                                                value={def.command}
                                                onChange={(e) => updateWorker(i, 'command', e.target.value)}
                                                placeholder="php artisan queue:work --sleep=3 --tries=3"
                                                className="mt-1 font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Processes</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={8}
                                                value={def.processes}
                                                onChange={(e) => updateWorker(i, 'processes', parseInt(e.target.value) || 1)}
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="mt-5 shrink-0" onClick={() => removeWorker(i)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                    {dirty && (
                        <p className="text-muted-foreground mt-3 text-xs">
                            Save your changes, then redeploy the app to apply the new worker configuration.
                        </p>
                    )}
                </CardContent>
            </Card>

            {defs.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Live Status</CardTitle>
                        {statuses.length > 0 && (
                            <Badge variant="default" className="text-xs">
                                {statuses.filter((s) => s.state === 'running').length}/{statuses.length} running
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent>
                        {statuses.length === 0 ? (
                            <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-900/20">
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    {app.vm_state !== 'running'
                                        ? 'VM is not running. Start the app to see worker status.'
                                        : 'No worker status available. Redeploy the app to start workers with the current configuration.'}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">State</th>
                                        <th className="pb-2 pr-4">PID</th>
                                        <th className="pb-2 pr-4">Uptime</th>
                                        <th className="pb-2 pr-4">Restarts</th>
                                        <th className="pb-2">Logs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statuses.map((s, i) => (
                                        <tr key={i} className="border-b last:border-0">
                                            <td className="py-2 pr-4 font-mono text-xs">
                                                {s.name}{s.index > 0 ? `:${s.index}` : ''}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <Badge variant={stateColor(s.state)}>{s.state}</Badge>
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 font-mono text-xs">
                                                {s.pid || '\u2014'}
                                            </td>
                                            <td className="text-muted-foreground py-2 pr-4 text-xs">
                                                {s.state === 'running' ? formatUptime(s.uptime_seconds) : '\u2014'}
                                            </td>
                                            <td className="py-2 pr-4 text-xs">
                                                {s.restarts > 0 ? (
                                                    <span className="text-orange-500">{s.restarts}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => viewLogs(s.name, s.index)}>
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            )}

            {logWorker && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="font-mono text-sm">Logs: {logWorker}</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setLogWorker(null)}>Close</Button>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
                            {logLines.length > 0 ? logLines.join('\n') : 'No logs yet'}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
