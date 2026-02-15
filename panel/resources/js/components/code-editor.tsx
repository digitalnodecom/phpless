import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { php } from '@codemirror/lang-php';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export default function CodeEditor({ value, onChange }: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const isDark = document.documentElement.classList.contains('dark');

        const extensions = [
            basicSetup,
            php({ baseLanguage: html() }),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    onChange(update.state.doc.toString());
                }
            }),
            EditorView.theme({
                '&': { height: '100%' },
                '.cm-scroller': { overflow: 'auto' },
            }),
        ];

        if (isDark) {
            extensions.push(oneDark);
        }

        const state = EditorState.create({
            doc: value,
            extensions,
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-create editor when dark mode toggles
    useEffect(() => {
        const observer = new MutationObserver(() => {
            if (!viewRef.current || !containerRef.current) return;

            const isDark = document.documentElement.classList.contains('dark');
            const currentDoc = viewRef.current.state.doc.toString();

            viewRef.current.destroy();

            const extensions = [
                basicSetup,
                php({ baseLanguage: html() }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChange(update.state.doc.toString());
                    }
                }),
                EditorView.theme({
                    '&': { height: '100%' },
                    '.cm-scroller': { overflow: 'auto' },
                }),
            ];

            if (isDark) {
                extensions.push(oneDark);
            }

            const state = EditorState.create({
                doc: currentDoc,
                extensions,
            });

            viewRef.current = new EditorView({
                state,
                parent: containerRef.current,
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        return () => observer.disconnect();
    }, [onChange]);

    return <div ref={containerRef} className="h-full overflow-hidden rounded-md border" />;
}
