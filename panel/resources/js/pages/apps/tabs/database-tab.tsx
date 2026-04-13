import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type App, type SqliteDatabase, type StorageEndpoint } from '@/types';
import { router } from '@inertiajs/react';
import { Cloud, Database, Download, HardDrive, RotateCcw, Shield } from 'lucide-react';
import { useState } from 'react';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

export default function DatabaseTab({ app, storageEndpoints = [] }: { app: App; storageEndpoints?: StorageEndpoint[] }) {
    const [databases, setDatabases] = useState<SqliteDatabase[]>(app.sqlite_databases ?? []);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [manualPath, setManualPath] = useState('');
    const [showManualAdd, setShowManualAdd] = useState(false);
    const [savingEndpoint, setSavingEndpoint] = useState(false);

    const hasBackups = databases.some((db) => db.backup_enabled);
    const activeEndpoint = storageEndpoints.find((ep) => ep.id === app.storage_endpoint_id);
    const defaultEndpoint = storageEndpoints.find((ep) => ep.is_default);
    const effectiveEndpoint = activeEndpoint ?? defaultEndpoint;

    const handleStorageEndpointChange = async (value: string) => {
        setSavingEndpoint(true);
        const endpointId = value === 'none' ? null : value === 'team-default' ? null : parseInt(value);
        try {
            const res = await fetch(`/apps/${app.id}/storage-endpoint`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ storage_endpoint_id: endpointId }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Storage endpoint updated. Redeploy to apply.', type: 'success' });
                router.reload({ only: ['app'] });
            } else {
                setMessage({ text: data.message || 'Failed to update.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to update storage endpoint.', type: 'error' });
        } finally {
            setSavingEndpoint(false);
        }
    };

    const handleScanVm = async () => {
        setScanning(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/databases/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setDatabases(data.databases ?? []);
                setMessage({ text: data.message, type: 'success' });
                setDirty(false);
                router.reload({ only: ['app'] });
            } else {
                setMessage({ text: data.message || 'Scan failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to scan VM.', type: 'error' });
        } finally {
            setScanning(false);
        }
    };

    const handleManualAdd = () => {
        const path = manualPath.trim().replace(/^\/+/, '');
        if (!path) return;
        if (databases.some((db) => db.path === path)) {
            setMessage({ text: 'This path is already tracked.', type: 'error' });
            return;
        }
        setDatabases([...databases, { path, persistent: true, backup_enabled: false, detected_at: new Date().toISOString() }]);
        setManualPath('');
        setShowManualAdd(false);
        setDirty(true);
    };

    const updateDb = (index: number, updates: Partial<SqliteDatabase>) => {
        const updated = [...databases];
        updated[index] = { ...updated[index], ...updates };
        // Enabling backup auto-enables persistent
        if (updates.backup_enabled && !updated[index].persistent) {
            updated[index].persistent = true;
        }
        setDatabases(updated);
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/databases`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({
                    databases: databases.map((db) => ({
                        path: db.path,
                        persistent: db.persistent,
                        backup_enabled: db.backup_enabled,
                    })),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Database settings saved.', type: 'success' });
                setDirty(false);
                router.reload({ only: ['app'] });
            } else {
                setMessage({ text: data.message || 'Failed to save.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to save database settings.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadBackup = (path: string) => {
        window.open(`/apps/${app.id}/databases/backup?path=${encodeURIComponent(path)}`);
    };

    const handleRestore = async (path: string) => {
        setConfirmRestore(null);
        setRestoring(path);
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/databases/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ path }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Database restored successfully.', type: 'success' });
            } else {
                setMessage({ text: data.message || 'Restore failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Restore failed.', type: 'error' });
        } finally {
            setRestoring(null);
        }
    };

    if (databases.length === 0) {
        return (
            <div className="space-y-4">
                {message && (
                    <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <p className="text-sm font-medium">{message.text}</p>
                    </div>
                )}
                <Card>
                    <CardContent className="py-12 text-center">
                        <Database className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
                        <h3 className="text-lg font-medium">No SQLite databases detected</h3>
                        <p className="text-muted-foreground mt-1 mb-4 text-sm">
                            Databases are auto-detected on deploy. If your database was created after deploy (e.g., by migrations), scan the running VM or add the path manually.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            <Button variant="outline" onClick={handleScanVm} disabled={scanning || app.vm_state !== 'running'}>
                                {scanning ? 'Scanning...' : 'Scan Running VM'}
                            </Button>
                            <Button variant="outline" onClick={() => setShowManualAdd(true)}>
                                Add Manually
                            </Button>
                        </div>
                        {showManualAdd && (
                            <div className="mt-4 flex items-center justify-center gap-2">
                                <input
                                    type="text"
                                    value={manualPath}
                                    onChange={(e) => setManualPath(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                                    placeholder="e.g., database/database.sqlite"
                                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                                />
                                <Button size="sm" onClick={handleManualAdd}>Add</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleScanVm} disabled={scanning || app.vm_state !== 'running'}>
                    {scanning ? 'Scanning...' : 'Scan VM'}
                </Button>
                {!showManualAdd ? (
                    <Button variant="outline" size="sm" onClick={() => setShowManualAdd(true)}>
                        Add Manually
                    </Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={manualPath}
                            onChange={(e) => setManualPath(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                            placeholder="e.g., database/database.sqlite"
                            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        />
                        <Button size="sm" onClick={handleManualAdd}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowManualAdd(false); setManualPath(''); }}>Cancel</Button>
                    </div>
                )}
            </div>

            {hasBackups && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                            {effectiveEndpoint ? <Cloud className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
                            Backup Destination
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                {effectiveEndpoint ? (
                                    <p className="text-sm">
                                        <span className="font-medium">{effectiveEndpoint.name}</span>
                                        <span className="text-muted-foreground"> — {effectiveEndpoint.bucket} ({effectiveEndpoint.provider})</span>
                                        {!activeEndpoint && defaultEndpoint && (
                                            <Badge variant="secondary" className="ml-2">Team Default</Badge>
                                        )}
                                    </p>
                                ) : (
                                    <p className="text-muted-foreground text-sm">
                                        Local only — no S3 storage endpoint configured. Backups are stored inside the VM only.
                                    </p>
                                )}
                            </div>
                        </div>
                        {storageEndpoints.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Select
                                    value={app.storage_endpoint_id ? String(app.storage_endpoint_id) : 'team-default'}
                                    onValueChange={handleStorageEndpointChange}
                                    disabled={savingEndpoint}
                                >
                                    <SelectTrigger className="w-64">
                                        <SelectValue placeholder="Select storage endpoint" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="team-default">
                                            Team Default{defaultEndpoint ? ` (${defaultEndpoint.name})` : ' (None)'}
                                        </SelectItem>
                                        {storageEndpoints.map((ep) => (
                                            <SelectItem key={ep.id} value={String(ep.id)}>
                                                {ep.name} — {ep.bucket}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="none">None (Local only)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-muted-foreground text-xs">Redeploy after changing to apply.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {databases.map((db, index) => (
                <Card key={db.path}>
                    <CardHeader className="flex flex-row items-start justify-between">
                        <div className="flex items-center gap-3">
                            <Database className="h-5 w-5 shrink-0 text-blue-500" />
                            <div>
                                <CardTitle className="font-mono text-sm">{db.path}</CardTitle>
                                {db.detected_at && (
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        Detected {new Date(db.detected_at).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            <Badge variant="secondary">Detected</Badge>
                            {db.persistent && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Persistent</Badge>}
                            {db.backup_enabled && (
                                <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-400">
                                    <Shield className="mr-1 h-3 w-3" />
                                    Backed Up
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">Persistent</p>
                                    <p className="text-muted-foreground text-xs">Survives redeployments</p>
                                </div>
                                <Switch
                                    checked={db.persistent}
                                    onCheckedChange={(checked: boolean) => updateDb(index, { persistent: checked, ...(checked ? {} : { backup_enabled: false }) })}
                                    disabled={db.backup_enabled}
                                />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <p className="text-sm font-medium">Backups</p>
                                    <p className="text-muted-foreground text-xs">Litestream continuous replication</p>
                                </div>
                                <Switch
                                    checked={db.backup_enabled}
                                    onCheckedChange={(checked: boolean) => updateDb(index, { backup_enabled: checked })}
                                />
                            </div>
                        </div>

                        {db.backup_enabled && (
                            <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                                <Shield className="h-4 w-4 shrink-0 text-purple-500" />
                                <p className="text-muted-foreground flex-1 text-xs">
                                    Continuous replication is active. Backups are streamed in real-time
                                    {effectiveEndpoint ? ` to ${effectiveEndpoint.name} (S3) + local.` : ' to local storage.'}
                                </p>
                                <Button variant="outline" size="sm" onClick={() => handleDownloadBackup(db.path)}>
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Download
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmRestore(db.path)}
                                    disabled={restoring === db.path}
                                >
                                    <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${restoring === db.path ? 'animate-spin' : ''}`} />
                                    {restoring === db.path ? 'Restoring...' : 'Restore'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            {dirty && (
                <div className="flex items-center gap-3">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Database Settings'}
                    </Button>
                    <p className="text-muted-foreground text-sm">You have unsaved changes.</p>
                </div>
            )}

            {/* Restore confirmation dialog */}
            <AlertDialog open={!!confirmRestore} onOpenChange={(open) => !open && setConfirmRestore(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore database?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will restore <code className="font-mono">{confirmRestore}</code> from the latest Litestream backup,
                            overwriting the current database file. The app may experience brief downtime during restore.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirmRestore && handleRestore(confirmRestore)}>
                            Restore
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
