import { useCallback, useEffect, useRef, useState } from 'react';
import { advancePhase, endHold, historyRecord, pauseSession, stopSession } from './training.js';
import { discardSession, saveFinishedSession, saveSession } from './storage.js';
import { watchTimerVisibility } from './timerVisibility.js';

export default function useTrainingSession(initialSession, device, floating) {
    const [session, setSession] = useState(initialSession);
    const [storageError, setStorageError] = useState('');
    const current = useRef(initialSession);
    const deadline = useRef(null);
    const startPending = useRef(false);
    const isFloatingVisible = floating?.isVisible;
    const subscribeFloating = floating?.subscribe;

    const remaining = useCallback(() => deadline.current === null
        ? current.current.remainingMs : Math.max(0, deadline.current - performance.now()), []);

    const persist = useCallback(async (snapshot) => {
        try {
            if (['finished', 'stopped'].includes(snapshot.status)) {
                if (snapshot.startedAt !== null) await saveFinishedSession(historyRecord(snapshot));
                else await discardSession();
            } else {
                await saveSession({ ...snapshot, status: snapshot.status === 'running' ? 'paused' : snapshot.status, timestamp: Date.now() });
            }
            setStorageError('');
        } catch {
            setStorageError('Could not save on this device. Keep this page open; your log is still available here.');
        }
    }, []);

    const apply = useCallback((next, save = false) => {
        current.current = { ...next, timestamp: Date.now() };
        setSession(current.current);
        if (save) void persist(current.current);
    }, [persist]);

    const pause = useCallback((message) => {
        const snapshot = pauseSession(current.current, remaining(), message);
        deadline.current = null;
        apply(snapshot, true);
        void device.releaseWakeLock();
        return snapshot;
    }, [apply, device.releaseWakeLock, remaining]);

    useEffect(() => {
        const tick = setInterval(() => {
            if (current.current.status !== 'running' || deadline.current === null) return;
            const time = performance.now();
            // A stalled browser must not jump into a new hold unexpectedly.
            if (time - deadline.current > 2000) {
                pause('Timer interrupted. Breathe normally and resume when ready.');
                return;
            }
            const left = Math.max(0, deadline.current - time);
            if (left > 0) { apply({ ...current.current, remainingMs: left }); return; }
            const next = advancePhase(current.current);
            deadline.current = next.status === 'finished' ? null : time + next.remainingMs;
            apply(next, true);
            device.playSound(next.phase === 'BH' && next.status !== 'finished' ? 'rep' : 'end');
            if (next.status === 'finished') void device.releaseWakeLock();
        }, 250);
        return () => clearInterval(tick);
    }, [apply, device.playSound, device.releaseWakeLock, pause]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (current.current.status === 'running') void persist({ ...current.current, remainingMs: remaining() });
        }, 10000);
        const unwatch = watchTimerVisibility(() => {
            if (current.current.status === 'running') {
                pause('Timer hidden. Breathe normally and resume when ready.');
            }
        }, { document, window, floating: isFloatingVisible ? { isVisible: isFloatingVisible, subscribe: subscribeFloating } : undefined });
        return () => {
            clearInterval(timer);
            unwatch();
        };
    }, [isFloatingVisible, pause, persist, remaining, subscribeFloating]);

    const start = useCallback(async () => {
        if (startPending.current || ['running', 'finished', 'stopped'].includes(current.current.status)) return;
        startPending.current = true;
        try {
            // Audio is unlocked by this explicit user gesture; neither API may block the timer.
            void device.ensureContext();
            void device.requestWakeLock();
            const next = { ...current.current, status: 'running', startedAt: current.current.startedAt ?? Date.now(), message: '' };
            deadline.current = performance.now() + next.remainingMs;
            apply(next, true);
            device.playSound('start');
        } finally { startPending.current = false; }
    }, [apply, device.ensureContext, device.playSound, device.requestWakeLock]);

    const early = useCallback(() => {
        if (current.current.phase !== 'BH' || current.current.status !== 'running') return;
        const next = endHold(current.current, remaining());
        deadline.current = performance.now() + next.remainingMs;
        apply(next, true);
        device.playSound('end');
    }, [apply, device.playSound, remaining]);

    const stop = useCallback(() => {
        if (['finished', 'stopped'].includes(current.current.status)) return;
        const next = stopSession(current.current, remaining());
        deadline.current = null;
        apply(next, true);
        device.playSound('end');
        void device.releaseWakeLock();
    }, [apply, device.playSound, device.releaseWakeLock, remaining]);

    const exit = useCallback(async () => {
        const snapshot = current.current.status === 'running' ? pause() : current.current;
        await persist(snapshot);
        void device.releaseWakeLock();
    }, [device.releaseWakeLock, pause, persist]);

    const feedback = useCallback((key, value) => {
        apply({ ...current.current, [key]: value }, true);
    }, [apply]);

    return { session, storageError, start, pause, early, stop, exit, feedback };
}
