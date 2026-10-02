export function watchTimerVisibility(onHidden, { document, window, floating }) {
    const hidden = () => {
        if (document.visibilityState === 'hidden' && !floating?.isVisible()) onHidden();
    };
    // Leaving the opener must still interrupt training, even with a visible PiP.
    const pageHidden = () => onHidden();
    const unsubscribe = floating?.subscribe(hidden);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pageHidden);
    return () => {
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('pagehide', pageHidden);
        unsubscribe?.();
    };
}
