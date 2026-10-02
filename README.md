# Apnea Trainer

Installable, offline-capable dry apnea timer with adjustable CO₂, O₂ and FIPH-inspired pyramid presets.

## Training controls

- Timings are repeated unchanged between sessions. There is no automatic weekly escalation.
- Each training type keeps its own last-used settings when switching between presets.
- Every hold respects the user's explicit hold ceiling. CO₂ recovery decreases only to the chosen minimum; O₂ holds increase only to the ceiling.
- The complete table, longest hold, shortest recovery and duration (including final recovery) are shown before the timer is opened.
- The illustrative FIPH-inspired dry pyramid is a custom adaptation, not a verified reproduction of William Trubridge's pool protocol or a claim of optimal effectiveness.
- **End hold now** starts recovery immediately. In the pyramid, unused hold time is added to recovery so the cycle stays constant.
- Pausing, hiding all timer views or leaving the app during a hold records an interruption and pauses recovery. Reloading never resumes an interrupted hold as though apnea continued.
- Browser stalls pause the session instead of silently advancing into a new hold. Audio and screen-wake-lock availability are reported accurately.
- Completed and stopped sessions retain recorded hold durations, early endings, optional difficulty, notes and user confirmation of actual completion.
- History compares repeats of the same table; a finished timer alone does not confirm physical completion.

These timings are adjustable examples, not individualized training prescriptions. A hold ceiling or recovery duration does not establish physiological safety. Do not hyperventilate. In-water apnea requires direct supervision by a trained, rescue-capable buddy.

## Floating timer

On browsers with the Document Picture-in-Picture API, select **Floating timer** from the training screen before switching tabs. The always-on-top window shows the same countdown, phase and repetition, with Start/Resume, Pause, End hold now and Stop session controls. Both views share one session and log.

Opening the window requires an explicit button gesture; switching tabs alone cannot reliably open it. Support is detected in the current browser. Browsers without the API keep the regular timer and explain that the training tab must remain visible.

Training continues while the floating timer is visible, even if the original tab is hidden. Closing or hiding the floating window when the original tab is also hidden pauses the session and interrupts any active hold into recovery. Closing the floating window while the original tab remains visible keeps training running there. Reloading or closing the original tab still interrupts training; the floating window cannot outlive it. Saving and exiting closes the floating window.

## Existing data

The existing IndexedDB name and stores are preserved. Earlier history remains visible as timer-only records. Old starting settings are imported without weekly overload; incompatible old timer snapshots cannot resume and display a notice. New snapshots store their own settings and table.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Vite writes the deployable application to `dist/`.

## Validation

```bash
npm test
npm run build
```

The Node tests cover table bounds, fixed cycles, explicit limits, migration, partial logging, interruption/resume behavior and visibility handling with a floating timer. The GitHub workflow runs tests and a production build on pushes and pull requests.

## Cloudflare Workers Static Assets

For a Git-connected Cloudflare Worker, use **Settings → Build**:

- **Git repository:** `erminioottone/freedive`
- **Production branch:** `main`
- **Root directory:** repository root
- **Build command:** `npm test && npm run build`
- **Deploy command:** `npx wrangler deploy`

The included `wrangler.jsonc` points static assets at `./dist`. There is no separate output-directory setting needed for this Workers configuration. The GitHub validation workflow checks the app; deployment is handled by the existing Cloudflare Git integration.

### Public URL

After the build is successful and the app is ready to test, enable the `workers.dev` route in Cloudflare. Do not expose a deployment that uploads the repository root as static assets.

## PWA behavior

- Installable from Safari using **Share → Add to Home Screen → Open as Web App**.
- App shell and production assets are precached for offline use.
- New app versions are allowed to wait rather than forcibly reloading an active training session.
- Session/config/history data stay in browser IndexedDB.

## Important migration note

IndexedDB is scoped to the website origin. Data stored under the old Netlify hostname will not automatically appear under the new Cloudflare hostname.
