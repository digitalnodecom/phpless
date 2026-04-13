import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface PlanLimits {
    name: string;
    label: string;
    app_limit: number;
    max_mem_mib: number;
    max_vcpus: number;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Apps', href: '/apps' },
    { title: 'Create', href: '/apps/create' },
];

const ALL_MEM_OPTIONS = [128, 256, 512, 1024];
const ALL_VCPU_OPTIONS = [1, 2];

export default function AppsCreate({ plan, app_count }: { plan: PlanLimits; app_count: number }) {
    const atLimit = app_count >= plan.app_limit;
    const memOptions = ALL_MEM_OPTIONS.filter((m) => m <= plan.max_mem_mib);
    const vcpuOptions = ALL_VCPU_OPTIONS.filter((v) => v <= plan.max_vcpus);

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        slug: '',
        vcpus: String(vcpuOptions[0] ?? 1),
        mem_mib: String(memOptions[0] ?? 128),
    });

    function generateSlug(name: string) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function handleNameChange(value: string) {
        setData((prev) => ({
            ...prev,
            name: value,
            slug: prev.slug === '' || prev.slug === generateSlug(prev.name) ? generateSlug(value) : prev.slug,
        }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        post('/apps');
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create App" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="mx-auto w-full max-w-2xl">
                    {atLimit && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                                Your {plan.label} plan allows {plan.app_limit} {plan.app_limit === 1 ? 'app' : 'apps'}.
                                You&apos;ve used {app_count} of {plan.app_limit}.{' '}
                                <Link href="/settings/team/billing" className="underline font-medium">
                                    Upgrade your plan
                                </Link>{' '}
                                to create more.
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Create App
                                {plan.name === 'sandbox' && <Badge variant="secondary">Sandbox</Badge>}
                            </CardTitle>
                            <CardDescription>Launch a new Firecracker microVM with FrankenPHP.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">App Name</Label>
                                    <Input
                                        id="name"
                                        value={data.name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        placeholder="My App"
                                        required
                                        disabled={atLimit}
                                    />
                                    {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="slug">Slug</Label>
                                    <Input
                                        id="slug"
                                        value={data.slug}
                                        onChange={(e) => setData('slug', e.target.value)}
                                        placeholder="my-app"
                                        required
                                        disabled={atLimit}
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        Your app will be available at <span className="font-mono">{data.slug || 'slug'}.phpless.digitalno.de</span>
                                    </p>
                                    {errors.slug && <p className="text-destructive text-sm">{errors.slug}</p>}
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="mem_mib">Memory</Label>
                                        <Select value={data.mem_mib} onValueChange={(value) => setData('mem_mib', value)} disabled={atLimit}>
                                            <SelectTrigger id="mem_mib">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {memOptions.map((m) => (
                                                    <SelectItem key={m} value={String(m)}>
                                                        {m} MB
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {plan.max_mem_mib < 1024 && (
                                            <p className="text-muted-foreground text-xs">
                                                {plan.label} plan: up to {plan.max_mem_mib} MB
                                            </p>
                                        )}
                                        {errors.mem_mib && <p className="text-destructive text-sm">{errors.mem_mib}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="vcpus">vCPUs</Label>
                                        <Select value={data.vcpus} onValueChange={(value) => setData('vcpus', value)} disabled={atLimit}>
                                            <SelectTrigger id="vcpus">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {vcpuOptions.map((v) => (
                                                    <SelectItem key={v} value={String(v)}>
                                                        {v} vCPU{v > 1 ? 's' : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.vcpus && <p className="text-destructive text-sm">{errors.vcpus}</p>}
                                    </div>
                                </div>

                                <Button type="submit" disabled={processing || atLimit} className="w-full">
                                    {processing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating VM...
                                        </>
                                    ) : atLimit ? (
                                        'App limit reached'
                                    ) : (
                                        'Create App'
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
