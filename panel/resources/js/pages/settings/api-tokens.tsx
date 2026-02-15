import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { FormEventHandler, useState } from 'react';

import HeadingSmall from '@/components/heading-small';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

interface Token {
    id: number;
    name: string;
    last_used_at: string | null;
    created_at: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'API Tokens',
        href: '/settings/api-tokens',
    },
];

export default function ApiTokens({ tokens }: { tokens: Token[] }) {
    const [name, setName] = useState('');
    const [newToken, setNewToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const createToken: FormEventHandler = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');

        try {
            const response = await fetch(route('api-tokens.store'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
                },
                body: JSON.stringify({ name }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.errors?.name?.[0] ?? data.message ?? 'Failed to create token.');
                return;
            }

            setNewToken(data.token);
            setName('');
            router.reload({ only: ['tokens'] });
        } catch {
            setError('Failed to create token.');
        } finally {
            setCreating(false);
        }
    };

    const deleteToken = async (id: number) => {
        setDeletingId(id);

        try {
            await fetch(route('api-tokens.destroy', id), {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
                },
            });

            router.reload({ only: ['tokens'] });
        } finally {
            setDeletingId(null);
        }
    };

    const copyToken = () => {
        if (newToken) {
            navigator.clipboard.writeText(newToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="API Tokens" />

            <SettingsLayout>
                <div className="space-y-6">
                    <HeadingSmall title="API Tokens" description="Create tokens to authenticate with the PHPless API" />

                    {newToken && (
                        <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                            <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-200">
                                Token created. Copy it now — it won't be shown again.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm break-all dark:bg-neutral-900">
                                    {newToken}
                                </code>
                                <Button variant="outline" size="sm" onClick={copyToken}>
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                        </div>
                    )}

                    <form onSubmit={createToken} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="token-name">Token name</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="token-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. CLI, CI/CD"
                                    required
                                    className="max-w-xs"
                                />
                                <Button disabled={creating || !name}>
                                    {creating ? 'Creating...' : 'Create token'}
                                </Button>
                            </div>
                            {error && <InputError message={error} />}
                        </div>
                    </form>
                </div>

                {tokens.length > 0 && (
                    <div className="space-y-4">
                        <HeadingSmall title="Active tokens" description="Revoke tokens you no longer need" />
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Last used</TableHead>
                                    <TableHead className="w-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tokens.map((token) => (
                                    <TableRow key={token.id}>
                                        <TableCell className="font-medium">{token.name}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {new Date(token.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {token.last_used_at
                                                ? new Date(token.last_used_at).toLocaleDateString()
                                                : 'Never'}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => deleteToken(token.id)}
                                                disabled={deletingId === token.id}
                                            >
                                                {deletingId === token.id ? 'Revoking...' : 'Revoke'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </SettingsLayout>
        </AppLayout>
    );
}
