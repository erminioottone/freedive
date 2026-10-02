import test from 'node:test';
import assert from 'node:assert/strict';
import {
    advancePhase, buildTable, DEFAULT_SETTINGS, endHold, historyRecord, newSession,
    pauseSession, PROTOCOL_VERSION, restoreSession, settingsFor, stopSession,
    summarizeTable, validateSettings,
} from '../src/training.js';

const config = (changes = {}) => ({ ...DEFAULT_SETTINGS, ...changes });
const running = (changes = {}) => ({ ...newSession(config({ prepTime: 0, ...changes }), 'test', 1000), status: 'running', startedAt: 1000 });

test('CO₂ holds stay fixed and recovery stops at the chosen minimum', () => {
    const rows = buildTable(config());
    assert.deepEqual(rows.map((row) => row.bh), Array(8).fill(60));
    assert.deepEqual(rows.map((row) => row.rb), [120, 110, 100, 90, 80, 70, 60, 60]);
});

test('O₂ holds never exceed the explicit ceiling and recovery stays fixed', () => {
    const rows = buildTable(config({ mode: 'o2', maxHold: 73 }));
    assert.deepEqual(rows.map((row) => row.bh), [60, 65, 70, 73, 73, 73, 73, 73]);
    assert.deepEqual(rows.map((row) => row.rb), Array(8).fill(120));
});

test('FIPH stays positive, within its peak, and on a fixed cycle across the supported range', () => {
    for (let peak = 1; peak <= 600; peak++) {
        const rows = buildTable(config({ mode: 'fiph', breathHold: peak, maxHold: peak, recovery: 17 }));
        assert.equal(rows.length, 8);
        assert.equal(rows[4].bh, peak);
        for (const row of rows) {
            assert.ok(row.bh >= 1 && row.bh <= peak);
            assert.ok(row.rb >= 17);
            assert.equal(row.bh + row.rb, peak + 17);
        }
    }
});

test('timings do not escalate with week numbers or elapsed time', () => {
    const baseline = buildTable(config());
    assert.deepEqual(buildTable(config({ weeks: 10, selectedWeek: 10 })), baseline);
    assert.deepEqual(newSession(config(), 'a', 1000).table, newSession(config(), 'b', 999999999).table);
});

test('invalid durations and inconsistent ceilings are rejected rather than silently rounded', () => {
    for (const bad of [NaN, Infinity, 0, -1, 600.5, 601, '60']) {
        assert.throws(() => buildTable(config({ breathHold: bad })));
    }
    assert.throws(() => buildTable(config({ mode: 'unknown' })));
    assert.throws(() => buildTable(config({ maxHold: 59 })));
    assert.throws(() => buildTable(config({ minimumRecovery: 121 })));
    assert.throws(() => buildTable(config({ holdStep: -1, mode: 'o2' })));
    assert.equal(validateSettings(config({ prepTime: 0, recoveryStep: 0 })).length, 0);
});

test('summary includes preparation and the final recovery', () => {
    const rows = buildTable(config());
    assert.deepEqual(summarizeTable(rows, 120), { longestHold: 60, shortestRecovery: 60, duration: 1290 });
});

test('legacy settings retain the starting hold without importing weekly overload', () => {
    const migrated = settingsFor('co2', { mode: 'co2', breathHold: 90, recovery: 120, prepTime: 60, weeks: 6, selectedWeek: 6 });
    assert.equal(migrated.protocolVersion, PROTOCOL_VERSION);
    assert.equal(migrated.maxHold, 90);
    assert.ok(buildTable(migrated).every((row) => row.bh === 90));
});

test('ending a FIPH hold early replaces remaining hold time with recovery', () => {
    let session = running({ mode: 'fiph', breathHold: 90, maxHold: 90, recovery: 45 });
    session = { ...session, rep: 4, phaseDurationMs: 90000, remainingMs: 90000 };
    const ended = endHold(session, 50000);
    assert.equal(ended.phase, 'RB');
    assert.equal(ended.remainingMs, 95000);
    assert.deepEqual(ended.results[0], { rep: 5, plannedSeconds: 90, recordedSeconds: 40, ending: 'early' });
    assert.equal(ended.results[0].recordedSeconds * 1000 + ended.remainingMs, 135000);
});

test('pausing during apnea ends the hold and pauses recovery', () => {
    const paused = pauseSession(running(), 15000);
    assert.equal(paused.status, 'paused');
    assert.equal(paused.phase, 'RB');
    assert.equal(paused.results[0].recordedSeconds, 45);
    assert.equal(paused.results[0].ending, 'interrupted');
    assert.equal(paused.remainingMs, 120000);
});

test('pausing recovery preserves its remaining time without creating a hold result', () => {
    const paused = pauseSession({ ...running(), phase: 'RB', phaseDurationMs: 120000 }, 7000);
    assert.equal(paused.remainingMs, 7000);
    assert.equal(paused.results.length, 0);
});

test('restoring an interrupted hold cannot resume apnea', () => {
    const saved = { ...running(), timestamp: 2000, remainingMs: 30000 };
    const restored = restoreSession(saved, 3000);
    assert.equal(restored.phase, 'RB');
    assert.equal(restored.status, 'paused');
    assert.equal(restored.results[0].ending, 'interrupted');
    assert.equal(restoreSession(restored, 3000).results.length, 1);
});

test('legacy, expired and mismatched snapshots do not resume', () => {
    const saved = { ...running(), timestamp: 2000 };
    assert.equal(restoreSession({ ...saved, protocolVersion: 1 }, 3000), null);
    assert.equal(restoreSession(saved, 2000 + 86400000), null);
    assert.equal(restoreSession({ ...saved, table: [{ bh: 2000, rb: 0 }] }, 3000), null);
});

test('stopping during apnea retains the partial hold', () => {
    const stopped = stopSession(running(), 20000);
    const record = historyRecord(stopped);
    assert.equal(record.completed, false);
    assert.equal(record.results[0].recordedSeconds, 40);
    assert.equal(record.results[0].ending, 'stopped');
});

test('a complete timer sequence records timed holds without asserting physical completion', () => {
    let session = running();
    for (let index = 0; index < 16; index++) session = advancePhase(session);
    assert.equal(session.status, 'finished');
    assert.equal(session.results.length, 8);
    assert.ok(session.results.every((result) => result.ending === 'timer'));
    assert.equal(historyRecord(session).confirmation, '');
});
