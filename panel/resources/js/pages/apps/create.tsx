import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Apps', href: '/apps' },
    { title: 'Create', href: '/apps/create' },
];

export default function AppsCreate() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        slug: '',
        vcpus: '1',
        mem_mib: '128',
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
                    <Card>
                        <CardHeader>
                            <CardTitle>Create App</CardTitle>
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
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        Your app will be available at <span className="font-mono">{data.slug || 'slug'}.phpless.digitalno.de</span>
                                    </p>
                                    {errors.slug && <p className="text-destructive text-sm">{errors.slug}</p>}
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="mem_mib">Memory</Label>
                                        <Select value={data.mem_mib} onValueChange={(value) => setData('mem_mib', value)}>
                                            <SelectTrigger id="mem_mib">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="128">128 MB</SelectItem>
                                                <SelectItem value="256">256 MB</SelectItem>
                                                <SelectItem value="512">512 MB</SelectItem>
                                                <SelectItem value="1024">1024 MB</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.mem_mib && <p className="text-destructive text-sm">{errors.mem_mib}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="vcpus">vCPUs</Label>
                                        <Select value={data.vcpus} onValueChange={(value) => setData('vcpus', value)}>
                                            <SelectTrigger id="vcpus">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 vCPU</SelectItem>
                                                <SelectItem value="2">2 vCPUs</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.vcpus && <p className="text-destructive text-sm">{errors.vcpus}</p>}
                                    </div>
                                </div>

                                <Button type="submit" disabled={processing} className="w-full">
                                    {processing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating VM...
                                        </>
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
