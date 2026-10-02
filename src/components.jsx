import React from 'react';
import { formatTime, MODES, summarizeTable } from './training.js';

export const buttonClass = 'min-h-12 rounded-xl px-4 py-3 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const inputClass = 'w-full min-h-12 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white';

export function TimeInput({ label, value, onChange, hint, allowZero = false }) {
    const seconds = Number.isFinite(value) ? value : 0;
    return <fieldset className="rounded-xl border border-gray-700 bg-gray-900 p-4">
        <legend className="px-1 text-sm font-medium text-gray-200">{label}</legend>
        <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" min="0" max="10"
                aria-label={label + ' minutes'} className={inputClass + ' w-20 text-center'}
                value={Math.floor(seconds / 60)}
                onChange={(event) => onChange(Math.min(10, Math.max(0, parseInt(event.target.value, 10) || 0)) * 60 + seconds % 60)} />
            <span className="text-sm text-gray-500">min</span>
            <input type="number" inputMode="numeric" min="0" max="59"
                aria-label={label + ' seconds'} className={inputClass + ' w-20 text-center'}
                value={seconds % 60}
                onChange={(event) => onChange(Math.floor(seconds / 60) * 60 + Math.min(59, Math.max(0, parseInt(event.target.value, 10) || 0)))} />
            <span className="text-sm text-gray-500">sec</span>
        </div>
        {hint && <p className="mt-2 text-xs leading-relaxed text-gray-400">{hint}</p>}
        {!allowZero && value === 0 && <p className="mt-2 text-xs text-red-300">Choose a time greater than zero.</p>}
    </fieldset>;
}

export function TablePreview({ table, mode, prepTime = 0, activeRep, results = [], showSummary = true }) {
    const summary = summarizeTable(table, prepTime);
    return <section aria-label="Table preview" className="space-y-3">
        {showSummary && <dl className="grid grid-cols-3 gap-2 rounded-xl bg-gray-900 p-3 text-center">
            {[
                ['Longest hold', summary.longestHold], ['Shortest recovery', summary.shortestRecovery], ['Total time', summary.duration],
            ].map(([label, value]) => <div key={label}>
                <dt className="text-xs text-gray-400">{label}</dt>
                <dd className="mt-1 font-mono text-lg text-white">{formatTime(value)}</dd>
            </div>)}
        </dl>}
        <p className={'text-xs ' + MODES[mode].text}>{MODES[mode].pattern}</p>
        <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-900 text-xs text-gray-400"><tr>
                    <th scope="col" className="p-3">Rep</th><th scope="col" className="p-3">Hold</th>
                    <th scope="col" className="p-3">Recovery</th>
                    {results.length > 0 && <th scope="col" className="p-3">Recorded</th>}
                </tr></thead>
                <tbody>{table.map((row, index) => {
                    const result = results.find((item) => item.rep === index + 1);
                    return <tr key={index} className={'border-t border-gray-800 ' + (activeRep === index ? 'bg-gray-800' : '')}>
                        <th scope="row" className="p-3 font-normal text-gray-400">{index + 1}</th>
                        <td className="p-3 font-mono text-cyan-300">{formatTime(row.bh)}</td>
                        <td className="p-3 font-mono text-orange-300">{formatTime(row.rb)}</td>
                        {results.length > 0 && <td className="p-3 text-xs text-gray-300">{result
                            ? formatTime(result.recordedSeconds) + ' · ' + (result.ending === 'timer' ? 'timed' : result.ending) : '—'}</td>}
                    </tr>;
                })}</tbody>
            </table>
        </div>
        {showSummary && <p className="text-xs text-gray-500">Total time includes preparation and the final recovery.</p>}
    </section>;
}

export function TrainingNotice() {
    return <aside className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-xs leading-relaxed text-gray-400">
        <p>Dry training: choose comfortable, submaximal timings. Breathe normally; do not hyperventilate.
            Stop if you feel unwell. A timer or hold ceiling cannot establish that a breath hold is safe.</p>
        <p className="mt-2">In-water apnea requires direct supervision by a trained, rescue-capable buddy.
            These presets are not an individual training prescription.</p>
        <details className="mt-2">
            <summary className="cursor-pointer text-gray-300">About these presets</summary>
            <p className="mt-2">CO₂ and O₂ describe the intended training emphasis; both gases change during apnea.
                FIPH is associated with William Trubridge's pool training. This dry eight-hold pyramid is an illustrative adaptation;
                its shape and timings have not been validated as an optimal protocol. Timings never increase between sessions automatically.</p>
            <div className="mt-2 flex flex-wrap gap-3">
                <a className="underline" href="https://dan.org/alert-diver/article/freediving-safety-awareness/" target="_blank" rel="noreferrer">DAN safety guidance</a>
                <a className="underline" href="https://www.freedivinginstructors.com/article/203" target="_blank" rel="noreferrer">FII table guidance</a>
                <a className="underline" href="https://www.michaelawerner.com/online-courses" target="_blank" rel="noreferrer">FIPH pool context</a>
            </div>
        </details>
    </aside>;
}

export function TimerDisplay({ session }) {
    const meta = {
        PREP: ['BREATHE NORMALLY', '#4ade80'], BH: ['BREATH HOLD', '#22d3ee'], RB: ['RECOVERY', '#fb923c'],
    }[session.phase];
    const fraction = Math.max(0, Math.min(1, session.remainingMs / session.phaseDurationMs));
    const circle = 2 * Math.PI * 90;
    return <div className="relative mx-auto my-5 flex h-64 w-64 flex-col items-center justify-center rounded-full bg-gray-900 sm:h-80 sm:w-80">
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#1f2937" strokeWidth="8" />
            <circle cx="100" cy="100" r="90" fill="none" stroke={meta[1]} strokeWidth="8"
                strokeDasharray={circle} strokeDashoffset={circle * (1 - fraction)} strokeLinecap="round" />
        </svg>
        <div className="z-10 text-center">
            <div className="font-mono text-6xl font-light sm:text-7xl" aria-label="Time remaining">{formatTime(Math.ceil(session.remainingMs / 1000))}</div>
            <p className="mt-2 text-lg font-medium" style={{ color: meta[1] }}>{meta[0]}</p>
            <p className="mt-1 text-sm text-gray-500">{session.phase === 'PREP' ? 'Relax and breathe' : 'Rep ' + (session.rep + 1) + ' / ' + session.table.length}</p>
        </div>
    </div>;
}
