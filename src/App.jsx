import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
    buildTable, formatTime, historyRecord, MODES, newSession, PROTOCOL_VERSION,
    restoreSession, settingsFor, stopSession, tableSignature, validateSettings,
} from './training.js';
import { discardSession, loadData, loadHistory, saveConfig, saveFinishedSession, saveSession } from './storage.js';
import useDevice from './useDevice.js';
import useTrainingSession from './useTrainingSession.js';
import useFloatingTimer from './useFloatingTimer.js';
import { buttonClass, inputClass, TablePreview, TimeInput, TimerDisplay, TrainingNotice } from './components.jsx';

const effortLabels = { 1: 'Easy', 2: 'Comfortable', 3: 'Challenging', 4: 'Very hard', 5: 'Too hard' };

function History({ rows }) {
    return <details className="rounded-xl border border-gray-700 p-4">
        <summary className="cursor-pointer font-medium text-gray-300">Training history ({rows.length})</summary>
        <p className="mt-3 text-xs text-gray-500">Recorded times come from the timer. Completion is confirmed by you.</p>
        {rows.length === 0 && <p className="mt-3 text-sm text-gray-400">Your sessions will appear here.</p>}
        <div className="mt-3 space-y-3">{rows.map((row) => <details key={row.id} className="rounded-lg bg-gray-900 p-3 text-sm">
            <summary className="cursor-pointer">
                <span className={MODES[row.mode]?.text || 'text-gray-300'}>{MODES[row.mode]?.label || row.mode || 'Training'}</span>
                <span className="ml-2 text-xs text-gray-500">{new Date(row.timestamp).toLocaleDateString()}</span>
                <span className="mt-1 block text-xs text-gray-400">{row.protocolVersion === PROTOCOL_VERSION
                    ? (row.completed ? 'Table finished' : 'Stopped') + ' · ' + row.results.length + '/' + row.totalReps + ' logged holds · ' +
                        (row.confirmation === 'all' ? 'Completion confirmed' : row.confirmation === 'some' ? 'Some holds ended early' : 'Completion unconfirmed')
                    : 'Earlier timer-only record · ' + (row.weekName || '')}</span>
            </summary>
            {row.protocolVersion === PROTOCOL_VERSION && <div className="mt-3 space-y-2 text-xs text-gray-400">
                <p>Difficulty: {effortLabels[row.effort] || 'Not recorded'}</p>
                {row.results.map((result) => <p key={result.rep}>Rep {result.rep}: {formatTime(result.recordedSeconds)} recorded / {formatTime(result.plannedSeconds)} planned · {result.ending}</p>)}
                {row.notes && <p className="whitespace-pre-wrap">{row.notes}</p>}
            </div>}
        </details>)}</div>
    </details>;
}

function Home({ savedConfig, savedSession, history, onMode, onResume }) {
    return <div className="space-y-5">
        <header className="py-4 text-center">
            <h1 className="text-4xl font-bold">Apnea Trainer</h1>
            <p className="mt-2 text-sm text-gray-400">Choose your table. You control the timings.</p>
        </header>
        {savedSession && <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-600 bg-gray-900 p-4">
            <div><p className="text-sm font-semibold">Saved session</p><p className="text-xs text-gray-400">{MODES[savedSession.config.mode].label}</p></div>
            <button className={buttonClass + ' bg-white text-black'} onClick={onResume}>Resume</button>
        </div>}
        {Object.entries(MODES).map(([mode, metadata]) => <button key={mode} aria-label={metadata.label}
            aria-describedby={'mode-description-' + mode} onClick={() => onMode(mode)}
            className={'w-full rounded-2xl border-2 p-5 text-left transition-colors hover:brightness-125 ' + metadata.classes}>
            <div className="flex items-center justify-between gap-2"><h2 className={'text-2xl font-bold ' + metadata.text}>{metadata.label}</h2>
                <span className={'text-2xl ' + metadata.text} aria-hidden="true">{metadata.icon}</span></div>
            <p id={'mode-description-' + mode} className="mt-2 text-sm leading-relaxed text-gray-400">{metadata.description}</p>
            <p className="mt-3 text-xs text-gray-500">8 repetitions · repeatable settings · no weekly escalation</p>
        </button>)}
        {savedConfig && <p className="text-center text-xs text-gray-500">Your last timings are kept for the same training type.</p>}
        <TrainingNotice />
        <History rows={history} />
    </div>;
}

function Setup({ mode, savedConfig, history, onStart, onBack }) {
    const [config, setConfig] = useState(() => settingsFor(mode, savedConfig));
    const [starting, setStarting] = useState(false);
    const device = useDevice();
    const metadata = MODES[mode];
    const errors = useMemo(() => validateSettings(config), [config]);
    const table = useMemo(() => errors.length ? null : buildTable(config), [config, errors]);
    const repeats = table ? history.filter((row) => row.mode === mode && row.tableSignature === tableSignature(config)).slice(0, 5) : [];
    const update = (key, value) => setConfig((previous) => ({ ...previous, [key]: value }));
    const time = (key, label, hint, allowZero = false) => <TimeInput key={key} label={label} hint={hint} value={config[key]}
        allowZero={allowZero} onChange={(value) => update(key, value)} />;
    const start = async () => {
        if (starting || errors.length) return;
        setStarting(true);
        try { await onStart(config); } finally { setStarting(false); }
    };
    return <div className="space-y-5">
        <header className="flex items-center gap-3">
            <button className={buttonClass + ' bg-gray-900 text-gray-300'} onClick={onBack}>← Back</button>
            <h1 className={'text-2xl font-bold ' + metadata.text}>{metadata.label}</h1>
        </header>
        <p className="text-sm leading-relaxed text-gray-400">These are example timings. Choose comfortable settings before training.
            Repeat this table until you deliberately change its timings.</p>
        {mode === 'fiph' && <p className="rounded-xl border border-amber-800 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">
            This is a custom dry adaptation of a pool training concept, not a validated individual protocol.
            It does not guarantee CO₂ accumulation or exclude hypoxia.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
            {time('prepTime', 'Preparation', 'Normal, relaxed breathing.', true)}
            {time('breathHold', metadata.holdLabel, mode === 'o2' ? 'The first hold in the table.' : 'Choose a comfortable, submaximal hold.')}
            {time('recovery', metadata.recoveryLabel, mode === 'fiph' ? 'Other repetitions receive more recovery.' : 'Breathe normally during recovery.')}
            {time('maxHold', 'Hold ceiling', 'Your chosen duration limit. It is not a physiological safety guarantee.')}
            {mode === 'co2' && time('minimumRecovery', 'Minimum recovery', 'Recovery will not drop below this chosen value.')}
            {mode === 'co2' && time('recoveryStep', 'Recovery reduction per rep', 'Zero keeps recovery fixed.', true)}
            {mode === 'o2' && time('holdStep', 'Hold increase per rep', 'Holds stop increasing at your ceiling. Zero keeps holds fixed.', true)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <button className={buttonClass + ' bg-gray-800 text-gray-200'} onClick={() => device.playSound('end')}>Test audio cue</button>
            <span className="text-xs text-gray-400">{device.audioStatus === 'ready' ? 'Audio enabled on this browser' : device.audioStatus === 'unavailable' ? 'Audio unavailable — keep the timer visible' : 'Check your volume before starting'}</span>
        </div>
        {errors.length > 0 ? <div role="alert" className="rounded-xl border border-red-800 p-3 text-sm text-red-300">
            {errors.map((error) => <p key={error}>{error}</p>)}
        </div> : <>
            <h2 className="text-lg font-semibold">Review your table</h2>
            <TablePreview table={table} mode={mode} prepTime={config.prepTime} />
            {mode === 'o2' && table.some((row, index) => index > 0 && row.bh === table[index - 1].bh) && config.holdStep > 0 &&
                <p className="text-xs text-purple-300">Later holds stop increasing at your chosen ceiling.</p>}
        </>}
        <TrainingNotice />
        <button disabled={starting || errors.length > 0} className={buttonClass + ' w-full bg-green-500 text-black hover:bg-green-400'} onClick={start}>
            {starting ? 'Preparing…' : 'Use these timings'}
        </button>
        {repeats.length > 0 && <section className="rounded-xl border border-gray-700 p-4">
            <h2 className="text-sm font-semibold">Recent repeats of these timings</h2>
            <p className="mt-1 text-xs text-gray-500">Compare completion and comfort using the same table.</p>
            {repeats.map((row) => <p key={row.id} className="mt-2 text-xs text-gray-300">
                {new Date(row.timestamp).toLocaleDateString()} · {row.results.length}/{row.totalReps} logged · {effortLabels[row.effort] || 'Difficulty not recorded'}
            </p>)}
        </section>}
    </div>;
}

function TrainingControls({ controller }) {
    const { session } = controller;
    const running = session.status === 'running';
    return <div className="space-y-3">
        {session.phase === 'BH' && running && <button className={buttonClass + ' w-full bg-orange-500 text-black hover:bg-orange-400'} onClick={controller.early}>End hold now</button>}
        <div className="grid grid-cols-2 gap-3">
            <button className={buttonClass + ' bg-green-500 text-black hover:bg-green-400'} onClick={running ? () => controller.pause() : controller.start}>
                {running ? 'Pause' : session.status === 'ready' ? 'Start' : 'Resume'}
            </button>
            <button className={buttonClass + ' bg-red-600 text-white hover:bg-red-500'} onClick={controller.stop}>Stop session</button>
        </div>
    </div>;
}

function FloatingTraining({ controller }) {
    const { session, storageError } = controller;
    const done = ['finished', 'stopped'].includes(session.status);
    return <main aria-label="Floating training timer" className="space-y-3 p-4">
        <h1 className={'text-center text-lg font-bold ' + MODES[session.config.mode].text}>{MODES[session.config.mode].label}</h1>
        {session.message && <p role="status" className="text-sm text-orange-200">{session.message}</p>}
        {storageError && <p role="alert" className="text-sm text-red-300">{storageError}</p>}
        {done ? <>
            <h2 className="text-center text-xl font-semibold">{session.status === 'finished' ? 'Table finished' : 'Session stopped'}</h2>
            <p className="text-center text-sm text-gray-400">Return to the training tab to review your log and save feedback.</p>
        </> : <>
            <TimerDisplay session={session} compact />
            {session.status === 'ready' && <p className="text-center text-sm text-gray-400">Ready to start</p>}
            <TrainingControls controller={controller} />
            <p className="text-center text-xs leading-relaxed text-gray-400">Keep this timer visible. Closing it while the training tab is hidden pauses the session.</p>
        </>}
    </main>;
}

function Training({ initialSession, onExit, onRepeat }) {
    const device = useDevice();
    const floating = useFloatingTimer();
    const controller = useTrainingSession(initialSession, device, floating);
    const { session } = controller;
    const done = ['finished', 'stopped'].includes(session.status);
    const canConfirmAll = session.results.length === session.table.length && session.results.every((result) => result.ending === 'timer');
    const leave = async () => { await controller.exit(); await onExit(); };
    return <div className="space-y-4">
        <header className="flex items-center justify-between gap-2">
            <button className={buttonClass + ' bg-gray-900 text-gray-300'} onClick={leave}>Save & exit</button>
            <h1 className={'text-right text-lg font-bold ' + MODES[session.config.mode].text}>{MODES[session.config.mode].label}</h1>
        </header>
        {session.message && <p role="status" className="rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-orange-200">{session.message}</p>}
        {controller.storageError && <p role="alert" className="rounded-xl border border-red-700 p-3 text-sm text-red-300">{controller.storageError}</p>}
        {!done && <>
            <TimerDisplay session={session} />
            <TrainingControls controller={controller} />
            <div className="space-y-2 text-center">
                {floating.supported ? <>
                    <button className={buttonClass + ' w-full border border-gray-600 bg-gray-900 text-gray-200'}
                        disabled={floating.pending} onClick={floating.container ? floating.close : floating.open}>
                        {floating.pending ? 'Opening floating timer…' : floating.container ? 'Close floating timer' : 'Floating timer'}
                    </button>
                    <p className="text-xs text-gray-400">{floating.container
                        ? 'The floating timer stays visible when you switch tabs. Both views control the same session.'
                        : 'Open the floating timer before switching tabs to keep training visible and running.'}</p>
                </> : <p className="text-xs text-gray-400">Floating timer is unavailable in this browser. Keep the training tab visible.</p>}
                {floating.error && <p role="alert" className="text-sm text-orange-200">{floating.error}</p>}
            </div>
            <p className="text-center text-xs text-gray-400">Pausing or leaving during a hold ends that hold and pauses recovery.</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{device.audioStatus === 'ready' ? 'Audio enabled' : device.audioStatus === 'unavailable' ? 'Audio unavailable' : 'Audio starts with your gesture'}</span>
                <span>{device.wakeStatus === 'active' ? 'Screen lock active' : 'Keep your screen awake and visible'}</span>
            </div>
        </>}
        {done && <section className="space-y-3 rounded-xl border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-xl font-semibold">{session.status === 'finished' ? 'Table finished' : 'Session stopped'}</h2>
            <p className="text-xs leading-relaxed text-gray-400">Times are recorded by the timer. Confirm what you actually completed;
                an interrupted hold may use its last saved time.</p>
            <label className="block space-y-1 text-sm text-gray-300"><span>Actual completion</span>
                <select aria-label="Actual completion" className={inputClass} value={session.confirmation} onChange={(event) => controller.feedback('confirmation', event.target.value)}>
                    <option value="">Not confirmed</option>
                    {canConfirmAll && <option value="all">I completed every planned hold</option>}
                    <option value="some">Some holds ended early / were interrupted</option>
                    <option value="unsure">I am not sure</option>
                </select>
            </label>
            <label className="block space-y-1 text-sm text-gray-300"><span>How difficult was this session?</span>
                <select aria-label="How difficult was this session?" className={inputClass} value={session.effort} onChange={(event) => controller.feedback('effort', event.target.value)}>
                    <option value="">Choose difficulty</option>
                    {Object.entries(effortLabels).map(([value, label]) => <option key={value} value={value}>{value} — {label}</option>)}
                </select>
            </label>
            <label className="block space-y-1 text-sm text-gray-300"><span>Notes (optional)</span>
                <textarea aria-label="Notes (optional)" className={inputClass} maxLength="500" rows="3" value={session.notes}
                    onChange={(event) => controller.feedback('notes', event.target.value)} />
            </label>
            <p className="text-xs text-gray-500">Your log updates as you make changes.</p>
            <button className={buttonClass + ' w-full bg-green-500 text-black'} onClick={async () => {
                await controller.exit(); onRepeat(session.config);
            }}>Review these timings again</button>
        </section>}
        <TablePreview table={session.table} mode={session.config.mode} prepTime={session.config.prepTime}
            activeRep={!done && session.phase !== 'PREP' ? session.rep : undefined} results={session.results} />
        {session.config.mode === 'fiph' && <p className="text-xs text-amber-300">Ending a hold early adds its remaining time to recovery, preserving the fixed cycle. Pauses interrupt the cycle.</p>}
        {floating.container && createPortal(<FloatingTraining controller={controller} />, floating.container)}
    </div>;
}

export default function App() {
    const [screen, setScreen] = useState('home');
    const [mode, setMode] = useState('co2');
    const [savedConfig, setSavedConfig] = useState(null);
    const [modeConfigs, setModeConfigs] = useState({});
    const [savedSession, setSavedSession] = useState(null);
    const [activeSession, setActiveSession] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [offline, setOffline] = useState(!navigator.onLine);
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

    const refresh = async () => {
        try {
            const [config, stored, rows, preferences] = await Promise.all([
                loadData('config'), loadData('session'), loadHistory(),
                Promise.all(Object.keys(MODES).map(async (key) => [key, await loadData('config', 'mode-' + key)])),
            ]);
            const resumed = restoreSession(stored?.snapshot);
            setSavedConfig(config);
            setModeConfigs(Object.fromEntries(preferences));
            setSavedSession(resumed);
            setHistory(rows);
            if (stored && !resumed) {
                await discardSession();
                setNotice('Your earlier history is kept. The previous timer cannot resume; review your timings before starting a new table.');
            } else if (config && config.protocolVersion !== PROTOCOL_VERSION) {
                setNotice('Your earlier history and starting settings are kept. Automatic weekly escalation has been removed; review the new table before starting.');
            }
        } catch { setNotice('Local saving is unavailable in this browser. You can use the timer, but logs may not survive closing the page.'); }
    };
    useEffect(() => {
        let alive = true;
        void refresh().finally(() => { if (alive) setLoading(false); });
        const online = () => setOffline(!navigator.onLine);
        window.addEventListener('online', online);
        window.addEventListener('offline', online);
        return () => { alive = false; window.removeEventListener('online', online); window.removeEventListener('offline', online); };
    }, []);

    const begin = async (config) => {
        const next = newSession(config, crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random());
        try {
            // Keep a partial log before replacing a previous unfinished session.
            if (savedSession?.startedAt !== null && savedSession?.startedAt !== undefined) {
                await saveFinishedSession(historyRecord(stopSession(savedSession, savedSession.remainingMs)));
            }
            await saveConfig(config);
            await saveSession(next);
        } catch { setNotice('Could not save locally. Keep this page open to retain the current session.'); }
        setSavedConfig(config);
        setModeConfigs((previous) => ({ ...previous, [config.mode]: config }));
        setSavedSession(null);
        setActiveSession(next);
        setScreen('training');
    };
    const exit = async () => { await refresh(); setScreen('home'); };
    const select = (chosen) => { setMode(chosen); setScreen('setup'); };
    const repeat = async (config) => {
        await refresh(); setSavedConfig(config);
        setModeConfigs((previous) => ({ ...previous, [config.mode]: config }));
        setMode(config.mode); setScreen('setup');
    };

    return <main className="safe-screen min-h-screen min-h-[100dvh] bg-black font-sans text-white">
        <div className="mx-auto w-full max-w-2xl space-y-4 py-4 sm:py-8">
            {offline && <p role="status" className="rounded-xl bg-gray-900 p-3 text-xs text-gray-400">Offline — the timer and local training log remain available.</p>}
            {notice && <p role="status" className="rounded-xl border border-gray-700 p-3 text-xs leading-relaxed text-gray-300">{notice}</p>}
            {needRefresh && <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-700 p-3">
                <p className="text-xs text-gray-300">{screen === 'training' ? 'Update ready. Save and exit your session before updating.' : 'A new app version is ready.'}</p>
                <button disabled={screen === 'training'} className={buttonClass + ' bg-gray-800 text-white'} onClick={() => updateServiceWorker(true)}>Update app</button>
            </div>}
            {loading ? <p className="py-12 text-center text-gray-400">Loading…</p> : screen === 'training' && activeSession
                ? <Training key={activeSession.id} initialSession={activeSession} onExit={exit} onRepeat={repeat} />
                : screen === 'setup' ? <Setup key={mode} mode={mode} savedConfig={modeConfigs[mode] || savedConfig} history={history} onStart={begin} onBack={() => setScreen('home')} />
                : <Home savedConfig={savedConfig} savedSession={savedSession} history={history} onMode={select} onResume={() => {
                    setActiveSession(savedSession); setScreen('training');
                }} />}
        </div>
    </main>;
}
