# Visit stability handoff

This batch is for local engineering review. Pilot access remains disabled. The existing engineering continuation exception and FEAT-01–50 apply. No schema migration was added or modified.

## Source and commits

- Public implementation worktree `C:/Users/Saeed/Documents/ChatGPT/MAWID/mawid-pro-visit-stability`, branch `codex/visit-stability`.
- Public base `c4cba93bc7159ce3c5a8a1285ddaa83d4a16f50b`. The requested PR #33 merge is the fetched `origin/main`.
- Private inspection and APK worktree `C:/Users/Saeed/Documents/ChatGPT/MAWID/mawid-mobile-visit-phase`. Its fetched `origin/main` is the requested PR #6 merge at `ff9a58b94cbe53f486e61e2f1ad92abbe68fb2f1`. The branch and APK application source were left intact.
- The original Desktop checkout stayed on `codex/issue7-booking-core` at `cb550f312907918d16e545948708ba9db1035d65`. Its Git status matched the initial snapshot.

| Local commit | Change |
| --- | --- |
| `3ab44dce94fc146b4dc4ada173f04f985261a65d` | Add the authorized, versioned reschedule preview and exact-allocation exclusion. |
| `dd682d5cc491cdbf12b44382d254c70fb4d8bba0` | Bound availability search and connect the management and customer web pickers. |
| `9d8b7a4d0adfe331e075f50a89de4c71a6c726e8` | Protect started and reviewed visits while preserving exact replay. |
| `6602c804e1cf8982cec2ed83aa87b5c8931a6ed4` | Prioritize the saved appointment, preserve legacy confirmed duration, bound SQL and check the cutoff at the write. |
| `332296212283c8259ca6706d363821324e811e89` | Add the four suites to public CI and remove test-owned PostgreSQL volumes on cleanup. |

The final implementation commit is `332296212283c8259ca6706d363821324e811e89`. The branch tip adds this handoff. Get its exact object ID with `git rev-parse codex/visit-stability`.

## Fixes and regressions

- **Reschedule preview.** The management editor sends the visit ID and expected version, and carries saved assignments unless changed. The preview uses the confirmed duration and saved buffers. It tries the current start before grid searches and excludes only the allocation set keyed to that location and visit. Tests cover keeping and overlapping the original schedule, other customers' bookings and offer holds, catalog timing changes, legacy requested/confirmed duration divergence, changed assignments with same-professional turnover, stale versions, cross-shop access, transaction rollback, and exact replay.
- **Availability.** Web requests can search a Beirut date or continue with an expiring cursor bound to the actor, location and request. Legacy slot requests still receive the existing `items` projection. The legacy search distributes work across dates. Web requests process one day at a time. Candidate and date budgets cap search steps and lookups. A four-second scan deadline and a one-second read statement timeout limit scheduler work. When a scan hits a bound, it returns the matches gathered so far and reports incompleteness. A legacy request with zero results after an incomplete search receives the explicit `AVAILABILITY_SEARCH_INCOMPLETE` conflict. Tests cover a difficult early day and a feasible later day, complete unavailability, continuation scope, saved start priority, SQL timeout recovery, and e2e retention of partial results.
- **Historical visits.** The conservative local policy permits a new reschedule strictly before the first assigned start and while no review exists. The server checks the cutoff again when writing the new schedule. Authorized exact retries return their stored result under the existing retention policy. The signed fixture tests the start boundary, started and elapsed visits, passing the cutoff while validating, independently blocking reviewed visits, unchanged audit events and ratings, different-visit booking and replay after membership revocation.
- **CI.** The migration, visit and review suites run with the public data job. The connected browser suite runs with the public web job after the lockfile Chromium install and a Docker engine check. Both jobs use the repository-pinned Node/npm, `npm ci`, isolated fixtures and 20-minute timeouts. Existing checks and read-only permissions are retained. GitHub-hosted execution remains to be observed when the branch is pushed.

Existing v1 appointments with a visible multi-service visit continue to receive HTTP 409 `MULTI_SERVICE_VISITS_REQUIRE_UPDATE`. The visit suite also checks an ordinary cross-shop 404 and continued single-service behavior. The existing Android packages can use the default slots and reschedule mutation contracts. The visit-aware reschedule preview and date/continuation controls in this batch are web features.

## Verification

Use Node 24.22.1, npm 11.9.0 and the exact lock. Database checks use the repository-pinned PostgreSQL 17.12 fixture image with fictional records.

| Commands | Evidence |
| --- | --- |
| `npm ci` | Installed 533 packages from the repository lock. |
| `npm run test:visit-migration`, `npm run test:visits`, `npm run test:reviews` | Visit migration, snapshot preview, bounded availability, cutoff, review scope and retention. |
| `npm run test:booking-clients`, `npm run test:booking` | 12 connected Chromium checks and 23 legacy booking checks. |
| `npm run test:data-auth`, `npm run test:identity`, `npm run test:identity-email`, `npm run test:meeting-policy` | 282 authorization checks each for synthetic and signed identity, signed-session gate tests, 18 local Email OTP checks, and 16 meeting-policy checks each for synthetic and signed fixtures. |
| `npm run test:notifications`, `npm run test:data-migrations`, `npm run test:data-maintenance` | Notification policy, scheduler and delivery, migration runner and recovery, maintenance scheduler and integration. |
| `npm run test:data-api`, `npm run test:data-csv`, `npm run test:data-db` | 32 API, 14 CSV and 61 schema checks. The schema command used the named network-disabled fixture from CI with its digest and local trust settings. |
| `npm test`, `npm run lint`, `npm run typecheck` | 30 unit tests, lint with zero errors and 11 existing Fast Refresh warnings, and strict TypeScript. |
| `npm run build`, `npm run build:pages`, `npm run verify:pages`, `npm run verify:toolchain` | Normal and Pages builds, /mawid-pro/ entry and fallback, artifact and toolchain verification. |
| `node node_modules/playwright/cli.js install chromium`, `npm run test:browser -- --workers=1` | Playwright Chromium installation and two Pages smoke tests. Windows used a local wrapper for the pinned npm CLI in the Pages preview subprocess. |
| `python -m py_compile scripts/github-setup.py`, `python -m unittest discover -s tests -p test_github_setup.py`, `git diff --check` | Five setup helper tests and patch whitespace. |

The first reschedule, progressive search and cutoff regressions reproduced the baseline 404, 422 and successful post-start mutation respectively. The new paths pass those regressions. A connected browser run started after Beirut closing time and timed out waiting for an immediate notification. The corrected fixture explicitly opens the early cases and closes the shop for the deferred-delivery case. The legacy duration check initially reused an administrator revoked by the preceding reminder case. The corrected fixture restores that fictional membership after verifying revocation. The first full run reported two formatting errors and a Windows Pages preview subprocess resolving npm from the wrong directory. The corrected run formats the changed files and uses a local wrapper for the pinned CLI. Existing Fast Refresh warnings are retained.

All 26 commands in the corrected matrix exited successfully. Local command logs and 12 archived fictional database receipts are under `visit-phase-evidence/visit-stability-checks/` in the shared workspace.

## Android

Fresh local acceptance passed on a separate read-only Android API 35 emulator. The backend was `332296212283c8259ca6706d363821324e811e89`. Both unchanged debug APKs identify as `0.3.2+5` and were built from private source `7d0f817fca5443808a06eae39f1e14bbac6f7dff`.

| Package | SHA-256 |
| --- | --- |
| `com.mawid.customer.platinum` | `b483ac35e6b4cc547e65c54718400a69035e58ad86ed3044060128a47db00b37` |
| `com.mawid.management` | `fd475a88585fd7c0db6b71d594c4bb6124af5e5bdbb59f800bac7c544fe7d779` |

The customer requested one visit with two services and different professionals. The database showed a pending visit at version 1 with zero reservations. One management approval created a single confirmation event and two confirmed allocations. The customer APK displayed `confirmed · v2` after reconnecting. The full report is `visit-phase-evidence/android-visit-stability-acceptance.json` in the shared workspace. The first headless attempt exceeded the acceptance driver's 22-second install limit. The rerun checked package-manager readiness and allowed up to 90 seconds for each APK installation. The test emulator and its fixture were removed after the run. The separate visible preview was left running.

## Suggested PR description

Fix the management reschedule picker so it previews saved visits and preserves their confirmed timings, assigned professionals and capacity until the replacement commits. Bound generic and reschedule availability searches and let web users continue incomplete searches across dates. Protect started and reviewed visits while retaining authorized exact retries. Add visit, review, migration and connected-client coverage to public PR CI.

Native reviews, per-package push, installed legacy APK presentation of the upgrade response, hosted identity-to-booking and physical two-device acceptance remain open. Keep the pilot disabled while those checks proceed. No branches were pushed and no external status, deployment or release was changed.
