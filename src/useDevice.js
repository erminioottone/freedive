import { useCallback, useEffect, useRef, useState } from 'react';

export default function useDevice() {
    const audio = useRef(null);
    const lock = useRef(null);
    const lockRequest = useRef(0);
    const [audioStatus, setAudioStatus] = useState('unknown');
    const [wakeStatus, setWakeStatus] = useState('unknown');

    const ensureContext = useCallback(async () => {
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) { setAudioStatus('unavailable'); return null; }
            if (!audio.current || audio.current.state === 'closed') audio.current = new Audio();
            if (audio.current.state === 'suspended') await audio.current.resume();
            const ready = audio.current.state === 'running';
            setAudioStatus(ready ? 'ready' : 'unavailable');
            return ready ? audio.current : null;
        } catch { setAudioStatus('unavailable'); return null; }
    }, []);

    const playSound = useCallback(async (type = 'start') => {
        const context = await ensureContext();
        if (!context) return;
        try {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const frequencies = { start: 523, end: 880, rep: 440 };
            const length = type === 'end' ? 0.8 : 0.3;
            oscillator.type = type === 'end' ? 'triangle' : 'sine';
            oscillator.frequency.setValueAtTime(frequencies[type] || 523, context.currentTime);
            gain.gain.setValueAtTime(0.25, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + length);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
            oscillator.start();
            oscillator.stop(context.currentTime + length);
        } catch { setAudioStatus('unavailable'); }
    }, [ensureContext]);

    const releaseWakeLock = useCallback(async () => {
        lockRequest.current += 1;
        const previous = lock.current;
        lock.current = null;
        if (previous && !previous.released) await previous.release().catch(() => {});
        setWakeStatus('inactive');
    }, []);

    const requestWakeLock = useCallback(async () => {
        const request = ++lockRequest.current;
        if (!navigator.wakeLock) { setWakeStatus('unavailable'); return; }
        try {
            const next = await navigator.wakeLock.request('screen');
            if (request !== lockRequest.current) { await next.release(); return; }
            lock.current = next;
            setWakeStatus('active');
            next.addEventListener('release', () => {
                if (lock.current === next) { lock.current = null; setWakeStatus('inactive'); }
            });
        } catch { if (request === lockRequest.current) setWakeStatus('unavailable'); }
    }, []);

    useEffect(() => () => {
        lockRequest.current += 1;
        if (lock.current && !lock.current.released) void lock.current.release().catch(() => {});
        if (audio.current && audio.current.state !== 'closed') void audio.current.close().catch(() => {});
    }, []);

    return { audioStatus, wakeStatus, ensureContext, playSound, requestWakeLock, releaseWakeLock };
}
