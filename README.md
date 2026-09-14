# Apnea Trainer

Production PWA build of the CO₂ / O₂ apnea training application.

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

## Cloudflare Workers Static Assets

Recommended Cloudflare build settings:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Production branch:** `main`
- **Non-production builds:** enabled
- **Cloudflare Access protection:** disabled unless you intentionally want authentication

The included `wrangler.jsonc` also points static assets at `./dist`.

### Public URL

After the build is successful and the app is ready to test, enable the `workers.dev` route in Cloudflare. Do not expose a deployment that uploads the repository root as static assets.

## PWA behavior

- Installable from Safari using **Share → Add to Home Screen → Open as Web App**.
- App shell and production assets are precached for offline use.
- New app versions are allowed to wait rather than forcibly reloading an active training session.
- Session/config/history data stay in browser IndexedDB.

## Important migration note

IndexedDB is scoped to the website origin. Data stored under the old Netlify hostname will not automatically appear under the new Cloudflare hostname.
