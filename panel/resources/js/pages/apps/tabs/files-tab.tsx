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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { type App, type FileItem } from '@/types';
import { ChevronRight, Download, File as FileIcon, Folder, FolderOpen, Lock, LockOpen, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function FilesLoadingSkeleton() {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-20" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="ml-auto h-4 w-16" />
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function FilesTab({ app, currentPath, onNavigate }: { app: App; currentPath: string; onNavigate: (path: string) => void }) {
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showWriteDialog, setShowWriteDialog] = useState(false);
    const [writePath, setWritePath] = useState('');
    const [writeContent, setWriteContent] = useState('');
    const [writing, setWriting] = useState(false);
    const [deletingItem, setDeletingItem] = useState<FileItem | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchItems = useCallback((path: string) => {
        setLoading(true);
        const url = `/apps/${app.id}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`;
        fetch(url, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setItems(data.items || []))
            .catch(() => toast.error('Failed to load files'))
            .finally(() => setLoading(false));
    }, [app.id]);

    useEffect(() => {
        fetchItems(currentPath);
    }, [fetchItems, currentPath]);

    const navigate = (path: string) => {
        onNavigate(path);
        setMessage(null);
    };

    const breadcrumbSegments = currentPath ? currentPath.split('/') : [];

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            formData.append('path', uploadPath);
            const res = await fetch(`/apps/${app.id}/files/upload`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'File uploaded.', type: 'success' });
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Upload failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Upload failed.', type: 'error' });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleWrite = async () => {
        setWriting(true);
        setMessage(null);
        try {
            const fullPath = currentPath ? `${currentPath}/${writePath}` : writePath;
            const res = await fetch(`/apps/${app.id}/files/write`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
                body: JSON.stringify({ path: fullPath, content: writeContent }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'File saved.', type: 'success' });
                setShowWriteDialog(false);
                setWritePath('');
                setWriteContent('');
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Failed to save file.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Failed to save file.', type: 'error' });
        } finally {
            setWriting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingItem) return;
        setMessage(null);
        try {
            const res = await fetch(`/apps/${app.id}/files?path=${encodeURIComponent(deletingItem.path)}`, {
                method: 'DELETE',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Deleted.', type: 'success' });
                fetchItems(currentPath);
            } else {
                setMessage({ text: data.message || 'Delete failed.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Delete failed.', type: 'error' });
        } finally {
            setDeletingItem(null);
        }
    };

    const handleTogglePersistent = async (item: FileItem) => {
        const res = await fetch(`/apps/${app.id}/files/persistent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            body: JSON.stringify({ path: item.path, persistent: !item.is_persistent }),
        });
        if (res.ok) {
            fetchItems(currentPath);
        }
    };

    const handleDownload = (item: FileItem) => {
        window.open(`/apps/${app.id}/files/download?path=${encodeURIComponent(item.path)}`);
    };

    if (loading) {
        return <FilesLoadingSkeleton />;
    }

    return (
        <div className="space-y-4">
            {message && (
                <div className={`rounded-lg border p-3 ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-1 font-mono text-sm">
                        <button
                            onClick={() => navigate('')}
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                            <FolderOpen className="h-4 w-4" />
                            <span>app</span>
                        </button>
                        {breadcrumbSegments.map((seg, i) => {
                            const path = breadcrumbSegments.slice(0, i + 1).join('/');
                            return (
                                <span key={path} className="flex items-center gap-1">
                                    <ChevronRight className="text-muted-foreground h-3 w-3" />
                                    <button
                                        onClick={() => navigate(path)}
                                        className={i === breadcrumbSegments.length - 1
                                            ? 'text-foreground font-medium'
                                            : 'text-muted-foreground hover:text-foreground'}
                                    >
                                        {seg}
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setWritePath(''); setWriteContent(''); setShowWriteDialog(true); }}>
                            <Plus className="mr-1 h-3 w-3" />
                            New File
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            <Upload className="mr-1 h-3 w-3" />
                            {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                        <Button variant="ghost" size="sm" onClick={() => fetchItems(currentPath)}>
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {items.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            {currentPath ? 'Empty directory.' : 'No files yet. Deploy your app to see files here.'}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-muted-foreground border-b text-left text-xs">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">Size</th>
                                        <th className="pb-2 pr-4">Modified</th>
                                        <th className="pb-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono text-xs">
                                    {items.map((item) => (
                                        <tr key={item.path} className="border-b last:border-0">
                                            <td className="py-1.5 pr-4">
                                                {item.type === 'dir' ? (
                                                    <button
                                                        onClick={() => navigate(item.path)}
                                                        className="hover:text-primary flex cursor-pointer items-center gap-1.5"
                                                    >
                                                        <Folder className="h-3.5 w-3.5 text-blue-400" />
                                                        {item.name}/
                                                    </button>
                                                ) : (
                                                    <span className="flex items-center gap-1.5">
                                                        <FileIcon className="text-muted-foreground h-3.5 w-3.5" />
                                                        {item.name}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">
                                                {item.type === 'dir' ? '\u2014' : formatBytes(item.size)}
                                            </td>
                                            <td className="text-muted-foreground py-1.5 pr-4 whitespace-nowrap">{item.modified_at}</td>
                                            <td className="py-1.5">
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleTogglePersistent(item)}
                                                        title={item.is_persistent ? 'Persistent (survives redeploys \u2014 click to unpin)' : 'Not persistent (click to pin)'}
                                                    >
                                                        {item.is_persistent
                                                            ? <Lock className="h-3 w-3 text-amber-500" />
                                                            : <LockOpen className="text-muted-foreground h-3 w-3" />
                                                        }
                                                    </Button>
                                                    {item.type === 'file' && (
                                                        <Button variant="ghost" size="sm" onClick={() => handleDownload(item)} title="Download">
                                                            <Download className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={() => setDeletingItem(item)} title="Delete">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* New File Dialog */}
            <Dialog open={showWriteDialog} onOpenChange={setShowWriteDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New Text File</DialogTitle>
                        <DialogDescription>
                            Create or overwrite a file.{currentPath && <> Path will be relative to <code className="font-mono">{currentPath}/</code>.</>}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="write-path">Filename</Label>
                            <Input
                                id="write-path"
                                placeholder="index.php"
                                value={writePath}
                                onChange={(e) => setWritePath(e.target.value)}
                                className="font-mono"
                            />
                        </div>
                        <div>
                            <Label htmlFor="write-content">Content</Label>
                            <Textarea
                                id="write-content"
                                placeholder="<?php echo 'Hello world';"
                                value={writeContent}
                                onChange={(e) => setWriteContent(e.target.value)}
                                rows={8}
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowWriteDialog(false)}>Cancel</Button>
                        <Button onClick={handleWrite} disabled={writing || !writePath.trim()}>
                            {writing ? 'Saving...' : 'Save File'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deletingItem?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove <code className="font-mono">{deletingItem?.path}</code> from the build directory. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
