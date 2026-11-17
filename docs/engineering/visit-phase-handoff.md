# Local visit implementation handoff

Public base `c31705c09f3ed2ae52b3dc7c465c391901072b7c` is fetched `origin/main`, the merge of PR #32. Issue #31 tracks reviews. Private Android base `e4ba9a93ba31255632c96c13a7630ef8731b96d3` is fetched private `origin/main`. Both new branches are named `codex/visit-phase`. The Desktop checkout stays on `codex/issue7-booking-core` at `cb550f312907918d16e545948708ba9db1035d65` with its local edits intact.

## Proposed pull requests

| Proposed title | Local commits | Copy for the description |
| --- | --- | --- |
| Preserve booking history and introduce atomic visits | `d77cb78`, `c59a4df` | Extends #4, #6 and #7 and the selected #13 multi-service scope. Preserve IDs, history and retries, add append-only segments and capacity constraints, version the legacy and whole-visit APIs, and validate every allocation in one transaction. Verify with the historical migration, recovery, legacy API and visit fixtures. |
| Support partner caller intake and connected visit booking | `3968fce`, `9880ced` | Extends #7/#9 and selected #13 gallery scope. Add retry-safe caller intake, a location-scoped directory, a bilingual multi-service picker, staff schedule views, and employee read-only controls. Verify the connected Chromium and permission fixtures. |
| Schedule reminders and enable signed visit reviews | `f290548`, `a0bfa1a` | Extends #8 and #31 within the local proof. Reuse the notification outbox and leases for the opening-time reminder and review jobs. Gate reviews on signed ownership and current visit state, derive aggregates from recorded scores, and scrub feedback on erasure. Verify notification, signed reviews and retention fixtures. |
| Add shared visit booking to private Android candidates | Private `c5eff9d`, `7d0f817` | Extends #9/#10 and supports #12. One native client calls the same versioned visit API in separately identified customer and management debug configurations. They start in a native connection screen. The private embedded demo web bundle retains its existing source provenance. |

Use stacked public review ranges or merge the public requests in the order above. Avoid issue-closing keywords. The hosted #5 pilot dependency and target-device acceptance remain open.
The final public follow-up commits `171ff7c` and `f4ef877` carry additional web schedule/feedback controls and acceptance checks. Review the public changes with `git diff c31705c..HEAD` and the private changes with `git diff e4ba9a9..HEAD` in their respective worktrees.

## Verification evidence

- Node 24.22.1 and npm 11.9.0. Exact-lock `npm ci`, 30 unit tests, strict TypeScript, normal/Pages build, Pages artifact and independent toolchain checks passed. Lint reported zero errors and the 11 existing Fast Refresh warnings.
- The repository-pinned PostgreSQL 17.12 container passed the 61 schema checks, visit migration and recovery (8 safety unit and 23 integration checks), 32 local data API checks, 14 CSV checks, and 6 scheduler unit and 28 maintenance integration checks. Local and signed data authorization each passed 282 cases. The local Supabase Auth Email OTP fixture passed 18 checks through its mail catcher.
- The legacy booking suite passed 23 checks. The visit tests exercise second-segment conflict and race, proposal holds and expiry, atomic reschedule and cancellation, repeat-professional buffers, caller replay, scheduled reminder timing and recipients, and signed review ownership and retention. Meeting-policy passed 16 checks each for synthetic and signed fixtures, including four separate employee projections and both partner accounts. Notifications passed 9 unit and 13 integration checks. Connected Chromium passed 10 checks including the Arabic employee-first flow and an employee's read-only view. Pages Chromium passed 2 checks on the single-worker rerun.
- Flutter 3.41.6 at `db50e20168db8fee486b9abf32fc912de3bc5b6a`, Dart 3.11.4, Temurin JDK 17.0.20.1+1. Locked dependency resolution, private bundle verification, Flutter analysis and 15 tests passed. Android Gradle 8.14, Android Gradle Plugin 8.11.1, Kotlin 2.2.20, NDK 28.2.13676358, SDK 36, build tools 35.0.0 and a local API 35 x86-64 emulator are available.
- The local Pages artifact contains 89 files and has tree SHA-256 `408f318d085a18fc3041017459dfa74735c507f3d7902bc9907f183f5748c267`. The build recorded source `171ff7c89b4dc58c8e674147dfd1b751252858d0` with local handoff edits, so `source_dirty` is true. The tree hash includes sorted relative paths separated with NUL bytes and each file's bytes followed by a NUL byte.

### Private Android artifacts

Both APKs use private source `7d0f817fca5443808a06eae39f1e14bbac6f7dff`, version `0.3.2+5`, target API 36 and minimum API 24. Both contain arm64-v8a, armeabi-v7a and x86_64. APK signature verification reported Android Debug. Both installed on the API 35 x86-64 emulator.
The rebuilt customer and management apps each paired with its own fictional actor and loaded authorized catalogs from the same fixture containing a two-segment visit. The emulator automation could not reliably reach the approval control below the intake form. Whole-visit approval and rollback passed the service and connected browser fixtures.

| Candidate in the private worktree's `build/visit-phase/` | SHA-256 |
| --- | --- |
| Branded customer debug APK | `b483ac35e6b4cc547e65c54718400a69035e58ad86ed3044060128a47db00b37` |
| MAWID management debug APK | `fd475a88585fd7c0db6b71d594c4bb6124af5e5bdbb59f800bac7c544fe7d779` |

## Corrected runs and remaining checks

- The initial schema check required its separately named isolated container. A task-created network-disabled container with the pinned image passed all 61 checks and was removed by ID.
- A separate visit-fixture run hit the database startup deadline while both build/toolchain and emulator work were active. The rerun passed the visits and both meeting-policy suites.
- The first parallel Pages browser run timed out while loading. A fresh preview with one worker passed both cases. The initial notification rerun exposed that adding reminders to legacy traffic changed its delivery contract. Reminders were attached to v2 requests and both suites passed.
- Flutter analysis initially reported eight style diagnostics. The fixed analysis and 14 tests passed. The first Android online build failed during Maven metadata resolution with a Java certificate-path error. Offline Gradle rerun uses the unchanged cached dependencies and retains compiler and package checks.
- The first management APK returned the legacy demo startup error. Both dedicated apps now bootstrap the native connection screen directly. The added startup widget check passed and both candidates were rebuilt and signed locally.
- Private Android uses development sessions. Verify booking creation and approval on target devices, including employee role isolation in the Android UI, and rehearse native review links, per-package push, real identity and pilot authorization. Signing, store, brand permissions and hosted migration are release work.
- Public Pages continues to display fictional data. Existing fictional salon/portrait images support the gallery and service cards. Connected cards display true local fixture ratings where available. There are no real salon assets, provider credentials or private source in the public branch.
