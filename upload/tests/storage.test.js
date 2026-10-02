import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { discardSession, loadData, loadHistory, saveConfig, saveFinishedSession, saveSession } from '../src/storage.js';

test('the existing database and timer-only history are preserved', async () => {
    await new Promise((resolve, reject) => {
        const request = indexedDB.open('ApneaTrainerDB', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore('config', { keyPath: 'id' });
            db.createObjectStore('session', { keyPath: 'id' });
            db.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
                .createIndex('timestamp', 'timestamp');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['config', 'history'], 'readwrite');
            tx.objectStore('config').put({ id: 'current', mode: 'co2', breathHold: 90, weeks: 6 });
            tx.objectStore('history').add({ timestamp: 1, mode: 'co2', weekName: 'Week 1', totalReps: 8, completed: true });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
    });
    assert.equal((await loadData('config')).breathHold, 90);
    assert.equal((await loadHistory())[0].weekName, 'Week 1');
    await saveConfig({ mode: 'fiph', breathHold: 60 });
    assert.equal((await loadHistory()).length, 1);
});

test('session snapshots retain their unique ID alongside the singleton store key', async () => {
    await saveSession({ id: 'session-a', remainingMs: 5000 });
    const stored = await loadData('session');
    assert.equal(stored.id, 'current');
    assert.equal(stored.snapshot.id, 'session-a');
});

test('each training type retains its own settings when switching modes', async () => {
    assert.equal((await loadData('config', 'mode-co2')).breathHold, 90);
    await saveConfig({ mode: 'co2', breathHold: 55 });
    await saveConfig({ mode: 'fiph', breathHold: 40 });
    assert.equal((await loadData('config', 'mode-co2')).breathHold, 55);
    assert.equal((await loadData('config', 'mode-fiph')).breathHold, 40);
    assert.equal((await loadData('config')).mode, 'fiph');
});

test('feedback on an older log cannot erase a newer session in another tab', async () => {
    await saveSession({ id: 'session-new', remainingMs: 5000 });
    await saveFinishedSession({ id: 'session-old', timestamp: 2, effort: '2' });
    assert.equal((await loadData('session')).snapshot.id, 'session-new');
});

test('finishing the matching session saves one log, deletes the snapshot, and updates feedback in place', async () => {
    await saveSession({ id: 'session-finished', remainingMs: 0 });
    await saveFinishedSession({ id: 'session-finished', timestamp: 3, effort: '' });
    assert.equal(await loadData('session'), null);
    await saveFinishedSession({ id: 'session-finished', timestamp: 3, effort: '3' });
    const matches = (await loadHistory()).filter((row) => row.id === 'session-finished');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].effort, '3');
});

test('queued snapshots persist in order and discard removes the active snapshot', async () => {
    await Promise.all([
        saveSession({ id: 'queued', remainingMs: 2000 }),
        saveSession({ id: 'queued', remainingMs: 1000 }),
    ]);
    assert.equal((await loadData('session')).snapshot.remainingMs, 1000);
    await discardSession();
    assert.equal(await loadData('session'), null);
});
