# GitHub engineering readiness — 7 November 2026 (Asia/Beirut)

**Verdict: partially prepared; not yet ready for plan execution.** Web source changes
are on `codex/github-readiness-2026-11-07` for review. Private mobile import/PR,
source provenance, account metadata/settings and final CI/merges remain gates.
No P1 product capability, backend, production release, app publishing or paid service
was implemented or provisioned.

## Live audit and baseline

- Repository: https://github.com/saeed-alorm/mawid-pro (public; unchanged ownership/visibility).
- Actual default branch: `main`, head `cbf16d7fb5b7384690952613faab4bb3cf125742`.
- Only existing secondary branch: `codex/github-pages`; no open PRs/issues before this task. PRs #1/#2 were already merged. No readiness work was overwritten.
- Actual Cloud checkout had only `.github/workflows/deploy-pages.yml`, with push/manual deployment and no PR trigger. The local handoff's warning about possibly existing PR CI was checked against the actual checkout; no duplicate PR workflow was added.
- Latest pre-task Pages run: https://github.com/saeed-alorm/mawid-pro/actions/runs/33301691777 (30 August; historical success only).
- Owner permission API reports `admin`. Connector scope is narrower: protection inspection returned 403, webhook API is unsupported, profile exposes no account plan. Branch summary reports `protected: false`; rulesets returned `[]`.
- Current Projects cannot be comprehensively inspected/changed through this connector; browser has no signed-in session. No Project URL is claimed.
- Accessible repository inventory/search found no authoritative mobile repository/history. The handoff snapshot has no `.git` history.
- [Notion HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea) returned 404 to the current connection. Its supplied link is retained without inventing feature/database links.

Checks were run **before editing** at the default-branch commit, on Node 24.22.1/npm 11.9.0:

| Baseline check | Actual result |
|---|---|
| Clean `npm ci` | Passed |
| Unit/integration tests | 22 passed in 2 files |
| ESLint | Failed: 1 existing formatting error; 11 existing fast-refresh warnings |
| Strict TypeScript | Failed: 42 diagnostics, including optional/array/index-signature handling |
| Normal build | Passed |
| Pages build | Failed: Vite prerender preview called unavailable interface enumeration |
| Pages verification | Failed because prerender emitted no entry document |
| Browser/readiness workflow | None existed on inspected default branch |

## Completed source work (awaiting review/merge)

- [x] Preserved history, local demo behavior, Pages base path and SPA fallback.
- [x] Replaced inherited wrapper with explicit Vite, React, TanStack Start, Tailwind,
  paths and build-only Nitro plugins; retained the normal build target for compatibility,
  without approving production hosting. Explicit loopback preview fixes local prerender.
- [x] Removed wrapper dependency, obsolete metadata, runtime reporting hooks,
  inherited connection instructions, Bun lock/config; regenerated the npm lockfile.
  Useful general SSR error capture/page and route console handling remain.
- [x] Fixed baseline lint error and strict type issues without disabling rules or
  weakening existing test assertions. Existing 11 fast-refresh warnings remain visible.
- [x] Added read-only PR validation `web-checks`: clean install, existing tests, lint,
  types, normal build, Pages build, original artifact assertions, independent-toolchain
  scan and Chromium deep-link/EN/RTL smoke checks.
- [x] Kept Pages deployment separate, restricted to `main`; deployment permissions
  apply only to its deploy job. No PR receives deployment credentials.
- [x] Added pinned setup, README/source map, CONTRIBUTING, AGENTS, feature/bug forms,
  PR template, historical prototype brief and release evidence guidance.
- [x] Preserved all 50 feature IDs/phase assignments in the [traceability index](engineering/feature-index.md).
- [x] Created 14 real, deduplicated engineering issues, assigned to eligible `saeed-alorm`.
  Dependencies link actual issues; private mobile issue remains prepared, not created.

## Final local verification

| Check | Result |
|---|---|
| Clean web install | Passed |
| Existing unit/integration tests | 22 passed |
| ESLint | Passed: 0 errors, 11 pre-existing warnings |
| Strict TypeScript | Passed; strict flags unchanged |
| Normal SSR/Nitro build | Passed |
| Pages build + original route/artifact checks | Passed |
| Independent-toolchain source/lock/built-client scan | Passed |
| Chromium browser smoke | 2 passed: deep-link hydration/booking navigation; Arabic persistence/staff route |
| Mobile locked dependency resolution | Passed |
| Flutter analysis | Passed, no issues |
| Existing Flutter unit/widget tests | 5 passed |
| Private bundle hash/variant/bridge/runtime check | Passed |
| Android APK compile | Attempted; final outcome recorded below when available |
| Emulator / physical Android / two-device live-service checks | Not run; no usable emulator/KVM or live shared service |
| Account setup continuation | Python/shell/JS syntax checked; not live account mutation tested |

Chromium's initial CDN download was truncated; smoke checks ran with the matching
vendor Chrome-for-Testing headless build from its official distribution. CI uses
the standard Playwright installer. Initial Flutter startup was blocked by automatic
review because bot detection attempted cloud metadata access. Inspection of the
SDK showed its CI flag bypasses that unnecessary probe; checks passed with
`CI=true FLUTTER_SUPPRESS_ANALYTICS=true`. No metadata request was authorized or retried.

## Gates and next steps

| State | Work / evidence required |
|---|---|
| Awaiting merge | Web readiness PR; review actual remote checks and diff, then maintainer merges |
| Awaiting access/import | Create/reuse private `saeed-alorm/mawid-mobile`, import reviewed source on its readiness PR; never put it here |
| Awaiting source | Recover the private web Android variant source/history and exact generating commit; full source regeneration cannot yet be verified |
| Awaiting account access | Current plan/allowance, one Engineering Project, phase/type/priority labels, P0–P5 no-date milestones, branch controls |
| Awaiting account audit | Verify/remove only active Lovable-only authorization/webhook; repository cleanup does not prove disconnection |
| Pending product decision | Architecture/host/store/providers, spending cap, available capacity, pending/proposed/Any rules, ownership, support and dates |
| Future product implementation | P1 shared booking core, identity, isolation, notifications and cross-channel clients; later phases remain epics |

[Account continuation and exact commands](engineering/account-setup.md) provides
an idempotent gh/API script for operations this connection cannot perform. No
Project, label, milestone, branch protection or account disconnection is claimed
as completed. New work remains Backlog until actual dependencies/decisions allow
Ready. After setup merges and gates are resolved, start
[P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4), a decision/feasibility
spike that does not provision infrastructure or commit delivery dates.

## Release/build distinction

No version/tag or production release was invented. The web prototype is untagged;
Android snapshot declares 0.2.0+2 with debug/test signing, not a store-ready release.
[Release evidence requirements](engineering/release-evidence.md) cover exact commits,
variant, locks, CI, hashes, platform and target acceptance. Pages build provenance
is generated from the checked source commit; local dirty builds are marked as such.
The [mobile provenance gap](mobile-handoff.md) remains explicit.

GitHub owns engineering status/source/docs/builds/releases; Notion owns intent,
business work, pilots, decisions and later support/CRM. No second editable engineering
board or paid sync was created. Three pilot shops and two paid discussions are targets.
The historical 6 November review is not a new deadline. Saeed leads engineering;
Rabeeh/Rabih is a partner, with no inferred product role or GitHub account.

## Created issue links

- [ENG-SETUP #3](https://github.com/saeed-alorm/mawid-pro/issues/3)
- [P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4)
- [P1-IDENTITY #5](https://github.com/saeed-alorm/mawid-pro/issues/5)
- [P1-DATA #6](https://github.com/saeed-alorm/mawid-pro/issues/6)
- [P1-BOOKING #7](https://github.com/saeed-alorm/mawid-pro/issues/7)
- [P1-NOTIFY #8](https://github.com/saeed-alorm/mawid-pro/issues/8)
- [P1-WEB #9](https://github.com/saeed-alorm/mawid-pro/issues/9)
- [P1-BRAND #10](https://github.com/saeed-alorm/mawid-pro/issues/10)
- [P1-OPS #11](https://github.com/saeed-alorm/mawid-pro/issues/11)
- [P1-ACCEPT #12](https://github.com/saeed-alorm/mawid-pro/issues/12)
- [EPIC-P2 #13](https://github.com/saeed-alorm/mawid-pro/issues/13)
- [EPIC-P3 #14](https://github.com/saeed-alorm/mawid-pro/issues/14)
- [EPIC-P4 #15](https://github.com/saeed-alorm/mawid-pro/issues/15)
- [EPIC-P5 #16](https://github.com/saeed-alorm/mawid-pro/issues/16)
