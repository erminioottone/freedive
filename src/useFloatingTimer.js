import { useCallback, useEffect, useRef, useState } from 'react';

export default function useFloatingTimer() {
    const supported = typeof window.documentPictureInPicture?.requestWindow === 'function';
    const [container, setContainer] = useState(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const pip = useRef(null);
    const detach = useRef(null);
    const listeners = useRef(new Set());
    const alive = useRef(false);
    const opening = useRef(false);
    const generation = useRef(0);

    const notify = useCallback(() => { listeners.current.forEach((listener) => listener()); }, []);
    const subscribe = useCallback((listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
    }, []);
    const isVisible = useCallback(() => Boolean(pip.current && !pip.current.closed &&
        pip.current.document.visibilityState === 'visible'), []);

    const close = useCallback(() => {
        generation.current += 1;
        opening.current = false;
        const previous = pip.current;
        detach.current?.();
        detach.current = null;
        pip.current = null;
        if (alive.current) { setContainer(null); setPending(false); }
        notify();
        if (previous && !previous.closed) previous.close();
    }, [notify]);

    useEffect(() => {
        alive.current = true;
        window.addEventListener('pagehide', close);
        return () => {
            alive.current = false;
            window.removeEventListener('pagehide', close);
            close();
        };
    }, [close]);

    const open = useCallback(async () => {
        if (!supported || opening.current || pip.current) return;
        opening.current = true;
        const request = generation.current;
        setPending(true);
        setError('');
        let next;
        try {
            // Call directly from the button gesture, before any other awaited work.
            next = await window.documentPictureInPicture.requestWindow({ width: 360, height: 540 });
            if (!alive.current || request !== generation.current) { next.close(); return; }
            const doc = next.document;
            doc.title = 'Freedive · Floating timer';
            doc.documentElement.lang = document.documentElement.lang || 'en';
            for (const sheet of document.styleSheets) {
                try {
                    const style = doc.createElement('style');
                    style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
                    style.media = sheet.media.mediaText;
                    doc.head.append(style);
                } catch {
                    if (sheet.href) {
                        const link = doc.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = sheet.href;
                        link.media = sheet.media.mediaText;
                        doc.head.append(link);
                    }
                }
            }
            const root = doc.createElement('div');
            doc.body.append(root);
            pip.current = next;
            const closed = () => { if (pip.current === next) close(); };
            next.addEventListener('pagehide', closed);
            doc.addEventListener('visibilitychange', notify);
            detach.current = () => {
                next.removeEventListener('pagehide', closed);
                doc.removeEventListener('visibilitychange', notify);
            };
            setContainer(root);
            notify();
        } catch {
            if (next && !next.closed) next.close();
            if (alive.current && request === generation.current) {
                close();
                setError('Could not open the floating timer. Keep the training tab visible, or try the button again.');
            }
        } finally {
            if (request === generation.current) {
                opening.current = false;
                if (alive.current) setPending(false);
            }
        }
    }, [close, notify, supported]);

    return { supported, container, pending, error, open, close, isVisible, subscribe };
}
