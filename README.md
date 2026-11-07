# MAWID | موعد

[Web demo](https://saeed-alorm.github.io/mawid-pro/) · [Product HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea) · [Engineering readiness](docs/github-readiness.md) · [Feature traceability](docs/engineering/feature-index.md)

A bilingual, browser-local salon booking prototype. Identity/OTP (`123456`), customers,
appointments and business data are fictional. Reset demo data restores seeded state.
There is no real authentication, backend, SMS, payment collection or production tenant
isolation. The private Flutter Android candidate is separate; iOS has no verified build.

## Development

Use Node **24.22.1** (`nvm install && nvm use`) and npm **11.9.0**. npm and
`package-lock.json` are authoritative; clean installation must use `npm ci`.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run build:pages
npm run verify:pages
npm run verify:toolchain
npx playwright install --with-deps chromium
npm run test:browser
```

Development defaults to loopback port 8080. The normal build retains the existing
Nitro Cloudflare target for compatibility; this is not production hosting approval.
Pages uses `/mawid-pro/`, prerenders the launcher and copies it to `404.html` for
SPA deep links. `npm run preview:pages` serves the built client on port 4173.

## Source map

- `src/routes/`, `src/router.tsx`: routing and application shell.
- `src/components/`: customer/staff screens and bilingual UI.
- `src/lib/`: local data, scheduling, booking transitions and demo persistence.
- `src/server.ts`, `src/lib/error-*`: useful general SSR error handling.
- `scripts/`: Pages packaging, artifact checks and authorized metadata setup.
- `docs/engineering/`: traceability, issue definitions and release evidence requirements.
- `.github/`: separate PR validation and Pages demo deployment.

The Android-specific web source referenced in the handoff is **not in this checkout**.
Do not substitute this public Pages output for its private branded bundle. See
[mobile dependency and provenance](docs/mobile-handoff.md).

## Product direction

Android first, retaining branded mobile web, stable booking links/QR and staff
workspace. All channels eventually share one booking core. Manual approval is initial.
P0 prepares pilots; P1 establishes the dependable mobile/shared core; P2 adds daily
operations/queues; P3 retention; P4 repeatable branded distribution/integrations;
P5 payments/POS/commerce/inventory. None of those future capabilities is implied
by the current prototype. Three pilot shops and two paid discussions are targets.
Architecture, spending cap, capacity, delivery dates and post-pilot pricing remain open.

Saeed (`saeed-alorm`) is lead engineer. Rabeeh/Rabih Bou Diab is a partner; no product
role or GitHub username is inferred. Follow [CONTRIBUTING](CONTRIBUTING.md) for branches,
review, acceptance and releases. No paid sync is required.
