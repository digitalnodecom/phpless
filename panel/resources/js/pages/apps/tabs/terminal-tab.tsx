import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type App } from '@/types';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Terminal as TerminalIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!);
    return '';
}

export default function TerminalTab({ app }: { app: App }) {
    const termRef = useRef<HTMLDivElement>(null);
    const termInstance = useRef<XTerm | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

    useEffect(() => {
        if (!termRef.current) return;
        const term = new XTerm({
            theme: { background: '#1a1a1a', foreground: '#f0f0f0', cursor: '#f0f0f0' },
            fontFamily: '"Cascadia Code", "Fira Code", monospace',
            fontSize: 14,
            cursorBlink: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termRef.current);
        fitAddon.fit();
        termInstance.current = term;

        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
            termInstance.current = null;
        };
    }, []);

    const disconnect = () => {
        wsRef.current?.close();
        wsRef.current = null;
        setStatus('disconnected');
    };

    const connect = async () => {
        setStatus('connecting');
        try {
            const res = await fetch(`/apps/${app.id}/terminal-session`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': getCookie('XSRF-TOKEN') },
            });
            if (!res.ok) {
                const data = await res.json();
                termInstance.current?.writeln('\r\n\x1b[31mError: ' + (data.message || 'Failed to create session') + '\x1b[0m');
                setStatus('disconnected');
                return;
            }
            const { session_id } = await res.json();
            const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${wsProtocol}//${location.host}/ws/terminal/${session_id}`);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            const term = termInstance.current!;

            ws.onopen = () => setStatus('connected');
            ws.onclose = () => {
                setStatus('disconnected');
                wsRef.current = null;
                term.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m');
            };
            ws.onerror = () => {
                setStatus('disconnected');
                term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m');
            };
            ws.onmessage = (e) => {
                if (e.data instanceof ArrayBuffer) {
                    term.write(new Uint8Array(e.data));
                } else {
                    term.write(e.data as string);
                }
            };

            term.onData((d) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(d));
                }
            });
            term.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                }
            });
        } catch {
            termInstance.current?.writeln('\r\n\x1b[31m[Connection failed]\x1b[0m');
            setStatus('disconnected');
        }
    };

    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4" />
                    Terminal
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Badge variant={status === 'connected' ? 'default' : status === 'connecting' ? 'secondary' : 'outline'}>
                        {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting\u2026' : 'Disconnected'}
                    </Badge>
                    {status !== 'connected' ? (
                        <Button size="sm" onClick={connect} disabled={status === 'connecting'}>
                            Connect
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={disconnect}>
                            Disconnect
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="rounded-b-lg bg-[#1a1a1a] p-2" ref={termRef} style={{ minHeight: '420px' }} />
            </CardContent>
        </Card>
    );
}
