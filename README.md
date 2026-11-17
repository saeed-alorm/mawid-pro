# MAWID | موعد

[16 November workflow changes](docs/decisions/2026-11-16-pilot-workflow-delta.md):
partner-only booking management, own-only employee reads and permitted late
cancellation with a strict 60-minute counting boundary are the first local slice.
Run `npm run test:meeting-policy` for synthetic and signed-fixture verification.
Consecutive multi-professional visits, timed reminders and reviews remain tracked
work, not features enabled by this policy change.

[Web demo](https://saeed-alorm.github.io/mawid-pro/) · [Product HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea) · [Engineering readiness](docs/github-readiness.md) · [Feature traceability](docs/engineering/feature-index.md)

The public web demo is a bilingual, browser-local salon booking prototype. Identity/OTP
(`123456`), customers, appointments and business data are fictional. Reset demo data
restores seeded state. The private Flutter Android candidate is separate. iOS has no
verified build.

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

The [issue #5 identity proof](docs/engineering/issue5-identity-contract-2026-11-16.md)
adds `npm run test:identity` and `npm run test:identity-email`. They require Docker
and use disposable fictional data, a local Supabase Auth instance and a mail
catcher. They do not enable pilot sign-in or change the Pages demo.

## Hosted Email OTP staging

Create `.env.staging.local` with the staging project's public browser settings.
Keep the Resend SMTP credentials in Supabase Auth settings.

```dotenv
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<staging-publishable-key>
```

Use `npm run dev:staging` for local UI testing against hosted Auth. Build and
deploy the separate `mawid-auth-staging` Worker from the intended Cloudflare account.

```sh
npm run build:staging
npx wrangler@4.162.0 deploy --config wrangler.staging.jsonc
```

Use an existing staging user whose email the SMTP sender can deliver to. Enter
the code on the MAWID staging page and look for **Email verified**. The page
confirms the account with Supabase and keeps the session in memory until sign-out,
expiry, or reload. Booking and staff access remain unavailable in this build.

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

**Confirmed distribution — 8 November 2026** is recorded in [PRODUCT.md](PRODUCT.md): dedicated salon-branded customer Android apps, MAWID-operated publishing with zero salon store-account work, and one shared MAWID management Android app plus web portal from the first pilot. Shared source/configuration and one booking service; one customer app per brand is the working assumption. Publishing eligibility/policy and store outcomes remain unverified. See [architecture](docs/engineering/p1-architecture-analysis.md) and [distribution acceptance](docs/engineering/android-distribution.md).

Android first, retaining branded mobile web, stable booking links/QR and staff
workspace. All channels eventually share one booking core. Manual approval is initial.
P0 prepares pilots; P1 establishes the dependable mobile/shared core; P2 adds daily
operations/queues; P3 retention; P4 repeatable branded distribution/integrations;
P5 payments/POS/commerce/inventory. None of those future capabilities is implied
by the current prototype. Three pilot shops and two paid discussions are targets.
Implementation stack, publishing feasibility, spending cap, capacity, delivery dates and post-pilot pricing remain open. The distribution model is confirmed.

Saeed (`saeed-alorm`) is lead engineer. Rabeeh/Rabih Bou Diab is a partner; no product
role or GitHub username is inferred. Follow [CONTRIBUTING](CONTRIBUTING.md) for branches,
review, acceptance and releases. No paid sync is required.
