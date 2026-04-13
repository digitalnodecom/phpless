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
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import SettingsLayout from '@/layouts/settings/layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type StorageEndpoint } from '@/types';
import { Head } from '@inertiajs/react';
import { useState } from 'react';
import { Cloud, Plus, Trash2, Pencil, CheckCircle, XCircle, Star, HardDrive } from 'lucide-react';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

const PROVIDERS = [
    { value: 's3', label: 'Amazon S3' },
    { value: 'r2', label: 'Cloudflare R2' },
    { value: 'do-spaces', label: 'DigitalOcean Spaces' },
    { value: 'backblaze', label: 'Backblaze B2' },
    { value: 'minio', label: 'MinIO' },
    { value: 'custom', label: 'Custom S3-Compatible' },
] as const;

const PROVIDER_COLORS: Record<string, string> = {
    's3': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'r2': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'do-spaces': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'backblaze': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'minio': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    'custom': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(PROVIDERS.map(p => [p.value, p.label]));

const PROVIDER_DEFAULTS: Record<string, { endpoint_url: string; region: string; endpoint_hint: string; region_hint: string }> = {
    's3': { endpoint_url: '', region: 'us-east-1', endpoint_hint: 'Optional — uses AWS default', region_hint: 'e.g. us-east-1, eu-west-1' },
    'r2': { endpoint_url: 'https://<account_id>.r2.cloudflarestorage.com', region: 'auto', endpoint_hint: 'https://{account_id}.r2.cloudflarestorage.com', region_hint: 'Use "auto" for R2' },
    'do-spaces': { endpoint_url: 'https://<region>.digitaloceanspaces.com', region: 'nyc3', endpoint_hint: 'https://{region}.digitaloceanspaces.com', region_hint: 'e.g. nyc3, sfo3, ams3' },
    'backblaze': { endpoint_url: 'https://s3.<region>.backblazeb2.com', region: 'us-west-004', endpoint_hint: 'https://s3.{region}.backblazeb2.com', region_hint: 'e.g. us-west-004' },
    'minio': { endpoint_url: '', region: 'us-east-1', endpoint_hint: 'Your MinIO server URL (required)', region_hint: 'Usually us-east-1' },
    'custom': { endpoint_url: '', region: 'us-east-1', endpoint_hint: 'S3-compatible endpoint URL', region_hint: 'Region identifier' },
};

interface FormData {
    name: string;
    provider: string;
    endpoint_url: string;
    bucket: string;
    region: string;
    access_key_id: string;
    secret_access_key: string;
    path_prefix: string;
    is_default: boolean;
}

const EMPTY_FORM: FormData = {
    name: '',
    provider: 's3',
    endpoint_url: '',
    bucket: '',
    region: 'us-east-1',
    access_key_id: '',
    secret_access_key: '',
    path_prefix: '',
    is_default: false,
};

interface Props {
    endpoints: StorageEndpoint[];
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Team Settings', href: '/settings/team' },
    { title: 'Storage Endpoints', href: '/settings/team/storage' },
];

export default function TeamStorage({ endpoints: initialEndpoints }: Props) {
    const [endpoints, setEndpoints] = useState<StorageEndpoint[]>(initialEndpoints);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEndpoint, setEditingEndpoint] = useState<StorageEndpoint | null>(null);
    const [deletingEndpoint, setDeletingEndpoint] = useState<StorageEndpoint | null>(null);
    const [form, setForm] = useState<FormData>(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [testing, setTesting] = useState(false);

    function headers(json = true) {
        const h: Record<string, string> = { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') };
        if (json) h['Content-Type'] = 'application/json';
        return h;
    }

    async function fetchEndpoints() {
        const res = await fetch('/settings/team/storage', { headers: { Accept: 'application/json' } });
        const data = await res.json();
        setEndpoints(data.endpoints);
    }

    function openCreate() {
        setEditingEndpoint(null);
        setForm(EMPTY_FORM);
        setFormErrors({});
        setTestResult(null);
        setDialogOpen(true);
    }

    function openEdit(ep: StorageEndpoint) {
        setEditingEndpoint(ep);
        setForm({
            name: ep.name,
            provider: ep.provider,
            endpoint_url: ep.endpoint_url || '',
            bucket: ep.bucket,
            region: ep.region,
            access_key_id: ep.access_key_id,
            secret_access_key: '',
            path_prefix: ep.path_prefix || '',
            is_default: ep.is_default,
        });
        setFormErrors({});
        setTestResult(null);
        setDialogOpen(true);
    }

    function onProviderChange(provider: string) {
        const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
        setForm(prev => ({
            ...prev,
            provider,
            endpoint_url: defaults.endpoint_url,
            region: defaults.region,
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        const isEdit = !!editingEndpoint;
        const url = isEdit ? `/settings/team/storage/${editingEndpoint!.id}` : '/settings/team/storage';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: headers(),
            body: JSON.stringify(form),
        });

        if (!res.ok) {
            const data = await res.json();
            setFormErrors(data.errors || {});
            setSaving(false);
            return;
        }

        setSaving(false);
        setDialogOpen(false);
        fetchEndpoints();
    }

    async function handleDelete() {
        if (!deletingEndpoint) return;
        await fetch(`/settings/team/storage/${deletingEndpoint.id}`, {
            method: 'DELETE',
            headers: headers(false),
        });
        setDeletingEndpoint(null);
        fetchEndpoints();
    }

    async function handleSetDefault(ep: StorageEndpoint) {
        await fetch(`/settings/team/storage/${ep.id}/default`, {
            method: 'POST',
            headers: headers(false),
        });
        fetchEndpoints();
    }

    async function handleTest() {
        if (!editingEndpoint) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`/settings/team/storage/${editingEndpoint.id}/test`, {
                method: 'POST',
                headers: headers(false),
            });
            const data = await res.json();
            setTestResult(data);
        } catch {
            setTestResult({ success: false, message: 'Network error.' });
        }
        setTesting(false);
    }

    const providerHints = PROVIDER_DEFAULTS[form.provider] || PROVIDER_DEFAULTS.custom;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Storage Endpoints" />
            <SettingsLayout>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-medium">Storage Endpoints</h3>
                            <p className="text-sm text-muted-foreground">
                                Configure S3-compatible storage endpoints for database backups.
                            </p>
                        </div>
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="size-4 mr-1" />
                            Add
                        </Button>
                    </div>

                    {endpoints.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12">
                            <HardDrive className="h-10 w-10 text-muted-foreground mb-3" />
                            <p className="text-sm text-muted-foreground">No storage endpoints configured.</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Add an S3-compatible endpoint to enable off-site database backups.
                            </p>
                            <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
                                <Plus className="size-4 mr-1" />
                                Add Endpoint
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {endpoints.map(ep => (
                                <Card key={ep.id}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Cloud className="size-4 text-muted-foreground" />
                                                <CardTitle className="text-sm font-medium">{ep.name}</CardTitle>
                                                <Badge variant="secondary" className={PROVIDER_COLORS[ep.provider] || PROVIDER_COLORS.custom}>
                                                    {PROVIDER_LABELS[ep.provider] || ep.provider}
                                                </Badge>
                                                {ep.is_default && (
                                                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                        <Star className="size-3 mr-1" />
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {!ep.is_default && (
                                                    <Button variant="ghost" size="sm" onClick={() => handleSetDefault(ep)} title="Set as default">
                                                        <Star className="size-4" />
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => openEdit(ep)}>
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setDeletingEndpoint(ep)} className="text-destructive hover:text-destructive">
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            <div>
                                                <span className="font-medium text-foreground">Bucket:</span> {ep.bucket}
                                            </div>
                                            <div>
                                                <span className="font-medium text-foreground">Region:</span> {ep.region}
                                            </div>
                                            {ep.endpoint_url && (
                                                <div className="col-span-2 truncate">
                                                    <span className="font-medium text-foreground">Endpoint:</span> {ep.endpoint_url}
                                                </div>
                                            )}
                                            {ep.path_prefix && (
                                                <div className="col-span-2">
                                                    <span className="font-medium text-foreground">Prefix:</span> {ep.path_prefix}
                                                </div>
                                            )}
                                            <div>
                                                <span className="font-medium text-foreground">Secret:</span> {ep.masked_secret}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add/Edit Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingEndpoint ? 'Edit Storage Endpoint' : 'Add Storage Endpoint'}</DialogTitle>
                            <DialogDescription>
                                Configure an S3-compatible storage endpoint for database backups.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <Label htmlFor="ep-name">Name</Label>
                                <Input
                                    id="ep-name"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="My S3 Bucket"
                                />
                                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name[0]}</p>}
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="ep-provider">Provider</Label>
                                <Select value={form.provider} onValueChange={onProviderChange}>
                                    <SelectTrigger id="ep-provider">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDERS.map(p => (
                                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formErrors.provider && <p className="text-xs text-destructive">{formErrors.provider[0]}</p>}
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="ep-endpoint">Endpoint URL</Label>
                                <Input
                                    id="ep-endpoint"
                                    value={form.endpoint_url}
                                    onChange={e => setForm(f => ({ ...f, endpoint_url: e.target.value }))}
                                    placeholder={providerHints.endpoint_hint}
                                />
                                {formErrors.endpoint_url && <p className="text-xs text-destructive">{formErrors.endpoint_url[0]}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="ep-bucket">Bucket</Label>
                                    <Input
                                        id="ep-bucket"
                                        value={form.bucket}
                                        onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))}
                                        placeholder="my-bucket"
                                    />
                                    {formErrors.bucket && <p className="text-xs text-destructive">{formErrors.bucket[0]}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="ep-region">Region</Label>
                                    <Input
                                        id="ep-region"
                                        value={form.region}
                                        onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                                        placeholder={providerHints.region_hint}
                                    />
                                    {formErrors.region && <p className="text-xs text-destructive">{formErrors.region[0]}</p>}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="ep-access-key">Access Key ID</Label>
                                <Input
                                    id="ep-access-key"
                                    value={form.access_key_id}
                                    onChange={e => setForm(f => ({ ...f, access_key_id: e.target.value }))}
                                    placeholder="AKIA..."
                                />
                                {formErrors.access_key_id && <p className="text-xs text-destructive">{formErrors.access_key_id[0]}</p>}
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="ep-secret">Secret Access Key</Label>
                                <Input
                                    id="ep-secret"
                                    type="password"
                                    value={form.secret_access_key}
                                    onChange={e => setForm(f => ({ ...f, secret_access_key: e.target.value }))}
                                    placeholder={editingEndpoint ? 'Leave blank to keep current' : 'Enter secret key'}
                                />
                                {formErrors.secret_access_key && <p className="text-xs text-destructive">{formErrors.secret_access_key[0]}</p>}
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="ep-prefix">Path Prefix <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input
                                    id="ep-prefix"
                                    value={form.path_prefix}
                                    onChange={e => setForm(f => ({ ...f, path_prefix: e.target.value }))}
                                    placeholder="backups/"
                                />
                                {formErrors.path_prefix && <p className="text-xs text-destructive">{formErrors.path_prefix[0]}</p>}
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="ep-default"
                                    checked={form.is_default}
                                    onCheckedChange={(checked) => setForm(f => ({ ...f, is_default: !!checked }))}
                                />
                                <Label htmlFor="ep-default" className="font-normal">Set as default endpoint</Label>
                            </div>

                            {/* Test Connection (only for existing endpoints) */}
                            {editingEndpoint && (
                                <div className="space-y-2">
                                    <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                                        {testing ? 'Testing...' : 'Test Connection'}
                                    </Button>
                                    {testResult && (
                                        <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${testResult.success ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                                            {testResult.success ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
                                            {testResult.message}
                                        </div>
                                    )}
                                </div>
                            )}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={saving}>
                                    {saving ? 'Saving...' : editingEndpoint ? 'Update' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <AlertDialog open={deletingEndpoint !== null} onOpenChange={(open) => !open && setDeletingEndpoint(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete storage endpoint?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete <strong>{deletingEndpoint?.name}</strong>. Apps using this endpoint for backups will need to be reconfigured.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SettingsLayout>
        </AppLayout>
    );
}
