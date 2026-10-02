import test from 'node:test';
import assert from 'node:assert/strict';
import { watchTimerVisibility } from '../src/timerVisibility.js';
import { newSession, pauseSession, settingsFor } from '../src/training.js';

function training({ withFloating = true } = {}) {
    const document = new EventTarget();
    document.visibilityState = 'visible';
    const window = new EventTarget();
    let visible = false;
    const listeners = new Set();
    const floating = withFloating ? {
        isVisible: () => visible,
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    } : undefined;
    const config = { ...settingsFor('co2'), prepTime: 0 };
    let session = { ...newSession(config, 'visibility-test'), status: 'running', startedAt: 1 };
    const unwatch = watchTimerVisibility(() => {
        session = pauseSession(session, session.remainingMs - 2000);
    }, { document, window, floating });
    return {
        session: () => session,
        hideTab: () => { document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); },
        setFloating: (next) => { visible = next; listeners.forEach((listener) => listener()); },
        leaveTab: () => window.dispatchEvent(new Event('pagehide')),
        unwatch,
    };
}

test('a hidden training tab without PiP interrupts the hold into paused recovery', () => {
    const app = training({ withFloating: false });
    app.hideTab();
    assert.equal(app.session().status, 'paused');
    assert.equal(app.session().phase, 'RB');
    assert.equal(app.session().results[0].ending, 'interrupted');
    app.unwatch();
});

test('a visible floating timer allows a hidden opener to keep its single active hold', () => {
    const app = training();
    app.setFloating(true);
    app.hideTab();
    assert.equal(app.session().status, 'running');
    assert.equal(app.session().phase, 'BH');
    assert.deepEqual(app.session().results, []);
    app.unwatch();
});

test('closing or hiding PiP with a hidden opener logs one interruption and pauses recovery', () => {
    const app = training();
    app.setFloating(true);
    app.hideTab();
    app.setFloating(false);
    app.setFloating(false);
    assert.equal(app.session().status, 'paused');
    assert.equal(app.session().phase, 'RB');
    assert.equal(app.session().results.length, 1);
    assert.equal(app.session().results[0].ending, 'interrupted');
    assert.equal(app.session().results[0].recordedSeconds, 2);
    app.unwatch();
});

test('closing PiP with a visible opener leaves the hold running', () => {
    const app = training();
    app.setFloating(true);
    app.setFloating(false);
    assert.equal(app.session().status, 'running');
    assert.deepEqual(app.session().results, []);
    app.unwatch();
});

test('leaving the opener still interrupts a hold even when PiP is visible', () => {
    const app = training();
    app.setFloating(true);
    app.leaveTab();
    assert.equal(app.session().status, 'paused');
    assert.equal(app.session().phase, 'RB');
    assert.equal(app.session().results[0].ending, 'interrupted');
    app.unwatch();
});

test('disposing the visibility watcher removes both documents and opener listeners', () => {
    const app = training();
    app.unwatch();
    app.hideTab();
    app.setFloating(false);
    app.leaveTab();
    assert.equal(app.session().status, 'running');
    assert.deepEqual(app.session().results, []);
});
