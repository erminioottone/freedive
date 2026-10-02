// Timings are user-selected training settings, not a physiological safety test.
export const PROTOCOL_VERSION = 3;
export const REP_COUNT = 8;
export const MAX_SECONDS = 600;

export const MODES = {
    co2: {
        label: 'CO₂ Table', icon: '↓', color: 'cyan',
        description: 'Repeat a fixed hold with recovery that decreases to your chosen minimum.',
        pattern: 'Fixed hold · decreasing recovery',
        holdLabel: 'Breath hold', recoveryLabel: 'Starting recovery',
        classes: 'border-cyan-700 bg-cyan-950/30', text: 'text-cyan-400',
    },
    o2: {
        label: 'O₂ Table', icon: '↑', color: 'purple',
        description: 'Increase holds within one table, up to your chosen ceiling, with fixed recovery.',
        pattern: 'Increasing hold · fixed recovery',
        holdLabel: 'Starting hold', recoveryLabel: 'Recovery between holds',
        classes: 'border-purple-700 bg-purple-950/30', text: 'text-purple-400',
    },
    fiph: {
        label: 'FIPH-inspired Pyramid', icon: '▲', color: 'amber',
        description: 'An adjustable dry pyramid inspired by the FIPH pool method. Hold plus recovery stays constant.',
        pattern: 'Pyramid hold · fixed total interval',
        holdLabel: 'Peak hold', recoveryLabel: 'Recovery at the peak',
        classes: 'border-amber-700 bg-amber-950/30', text: 'text-amber-400',
    },
};

export const DEFAULT_SETTINGS = {
    protocolVersion: PROTOCOL_VERSION,
    mode: 'co2', breathHold: 60, recovery: 120, prepTime: 120,
    maxHold: 90, minimumRecovery: 60, recoveryStep: 10, holdStep: 5,
};

export function settingsFor(mode, saved) {
    const defaults = { ...DEFAULT_SETTINGS, mode };
    if (!saved || saved.mode !== mode) return defaults;
    const values = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (key !== 'mode' && key !== 'protocolVersion' && Number.isInteger(saved[key])) {
            values[key] = saved[key];
        }
    }
    // Old weeks are deliberately not converted into progressively harder tables.
    if (saved.protocolVersion !== PROTOCOL_VERSION) {
        values.maxHold = values.breathHold || defaults.breathHold;
        values.minimumRecovery = Math.min(values.recovery || defaults.recovery, defaults.minimumRecovery);
    }
    return { ...defaults, ...values };
}

export function validateSettings(config) {
    const errors = [];
    if (!MODES[config.mode]) errors.push('Choose a training type.');
    const fields = [
        ['breathHold', 'Hold', 1, MAX_SECONDS],
        ['recovery', 'Recovery', 1, MAX_SECONDS],
        ['prepTime', 'Preparation', 0, MAX_SECONDS],
        ['maxHold', 'Hold ceiling', 1, MAX_SECONDS],
    ];
    if (config.mode === 'co2') fields.push(
        ['minimumRecovery', 'Minimum recovery', 1, MAX_SECONDS],
        ['recoveryStep', 'Recovery reduction', 0, MAX_SECONDS],
    );
    if (config.mode === 'o2') fields.push(['holdStep', 'Hold increase', 0, MAX_SECONDS]);
    for (const [key, label, min, max] of fields) {
        if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
            errors.push(label + ' must be a whole number between ' + min + ' and ' + max + ' seconds.');
        }
    }
    if (config.breathHold > config.maxHold) errors.push('The hold cannot exceed your chosen hold ceiling.');
    if (config.mode === 'co2' && config.minimumRecovery > config.recovery) {
        errors.push('Minimum recovery cannot exceed starting recovery.');
    }
    return errors;
}

// Illustrative dry timing pattern, not a verified reproduction of Trubridge's pool protocol.
const PYRAMID = [0.4, 0.55, 0.7, 0.85, 1, 0.85, 0.7, 0.55];

export function buildTable(config) {
    const errors = validateSettings(config);
    if (errors.length) throw new Error(errors.join(' '));
    return Array.from({ length: REP_COUNT }, (_, index) => {
        if (config.mode === 'co2') return {
            bh: config.breathHold,
            rb: Math.max(config.minimumRecovery, config.recovery - config.recoveryStep * index),
        };
        if (config.mode === 'o2') return {
            bh: Math.min(config.maxHold, config.breathHold + config.holdStep * index),
            rb: config.recovery,
        };
        const bh = Math.max(1, Math.min(config.breathHold, Math.round(config.breathHold * PYRAMID[index])));
        return { bh, rb: config.breathHold + config.recovery - bh };
    });
}

export const formatTime = (seconds) => {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
};

export function summarizeTable(table, prepTime = 0) {
    return {
        longestHold: Math.max(...table.map((row) => row.bh)),
        shortestRecovery: Math.min(...table.map((row) => row.rb)),
        duration: prepTime + table.reduce((sum, row) => sum + row.bh + row.rb, 0),
    };
}

export function newSession(config, id, now = Date.now()) {
    const table = buildTable(config);
    const phase = config.prepTime > 0 ? 'PREP' : 'BH';
    const duration = (phase === 'PREP' ? config.prepTime : table[0].bh) * 1000;
    return {
        protocolVersion: PROTOCOL_VERSION, id, config: { ...config }, table,
        phase, rep: 0, remainingMs: duration, phaseDurationMs: duration,
        status: 'ready', results: [], createdAt: now, startedAt: null,
        timestamp: now, message: '', effort: '', confirmation: '', notes: '',
    };
}

export function endHold(session, remainingMs, ending = 'early', pause = false) {
    if (session.phase !== 'BH') return session;
    const row = session.table[session.rep];
    const remaining = Math.max(0, Math.min(session.phaseDurationMs, remainingMs));
    const observedMs = Math.max(0, session.phaseDurationMs - remaining);
    const duration = row.rb * 1000 + (session.config.mode === 'fiph' ? remaining : 0);
    const result = {
        rep: session.rep + 1, plannedSeconds: row.bh,
        recordedSeconds: Math.round(observedMs / 100) / 10, ending,
    };
    return {
        ...session, phase: 'RB', remainingMs: duration, phaseDurationMs: duration,
        results: [...session.results.filter((item) => item.rep !== result.rep), result],
        status: pause ? 'paused' : session.status,
        message: pause ? 'Hold interrupted. Breathe normally. Resume recovery when ready.' : '',
    };
}

export function advancePhase(session) {
    if (session.phase === 'PREP') {
        const duration = session.table[0].bh * 1000;
        return { ...session, phase: 'BH', remainingMs: duration, phaseDurationMs: duration, message: '' };
    }
    if (session.phase === 'BH') return endHold(session, 0, 'timer');
    if (session.rep === session.table.length - 1) {
        return { ...session, status: 'finished', remainingMs: 0, message: 'Table finished. Confirm your actual completion below.' };
    }
    const rep = session.rep + 1;
    const duration = session.table[rep].bh * 1000;
    return { ...session, rep, phase: 'BH', remainingMs: duration, phaseDurationMs: duration, message: '' };
}

export function pauseSession(session, remainingMs, message = 'Paused. Resume when ready.') {
    if (session.status !== 'running') return session;
    if (session.phase === 'BH') return endHold(session, remainingMs, 'interrupted', true);
    return { ...session, remainingMs: Math.max(0, remainingMs), status: 'paused', message };
}

export function stopSession(session, remainingMs) {
    const stopped = session.phase === 'BH' && session.startedAt !== null
        ? endHold(session, remainingMs, 'stopped') : session;
    return { ...stopped, status: 'stopped', message: 'Session stopped. Breathe normally; the partial log has been kept.' };
}

export function restoreSession(saved, now = Date.now()) {
    if (!saved || saved.protocolVersion !== PROTOCOL_VERSION || !saved.config ||
        !saved.id || !saved.timestamp || now - saved.timestamp < 0 || now - saved.timestamp >= 86400000 ||
        !['ready', 'running', 'paused'].includes(saved.status)) return null;
    try {
        const table = buildTable(saved.config);
        if (JSON.stringify(table) !== JSON.stringify(saved.table) ||
            !Number.isInteger(saved.rep) || saved.rep < 0 || saved.rep >= table.length ||
            !['PREP', 'BH', 'RB'].includes(saved.phase) || !Array.isArray(saved.results) ||
            !Number.isFinite(saved.remainingMs) || !Number.isFinite(saved.phaseDurationMs) ||
            saved.remainingMs < 0 || saved.remainingMs > saved.phaseDurationMs || saved.phaseDurationMs <= 0) return null;
        const paused = { ...saved, status: 'paused' };
        // Never resume an interrupted hold as if the person remained in apnea.
        if (saved.phase === 'BH' && saved.startedAt !== null) {
            return endHold(paused, saved.remainingMs, 'interrupted', true);
        }
        return { ...paused, message: 'Saved session loaded. Resume when ready.' };
    } catch {
        return null;
    }
}

export const tableSignature = (config) => JSON.stringify(buildTable(config));

export function historyRecord(session) {
    return {
        id: session.id, protocolVersion: PROTOCOL_VERSION, timestamp: session.createdAt,
        mode: session.config.mode, config: session.config, tableSignature: tableSignature(session.config),
        results: session.results, totalReps: session.table.length,
        completed: session.status === 'finished', status: session.status,
        effort: session.effort, confirmation: session.confirmation, notes: session.notes,
    };
}
