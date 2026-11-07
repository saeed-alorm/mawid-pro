# MAWID readiness — 7 November 2026, Asia/Beirut

**Overall: not fully ready for plan execution.** PR17 remains open for Saeed's merge
review. Private source and a regenerated bundle are prepared and verified locally;
private GitHub import/PR, its checks and merge remain separate gates. Android debug compilation now passes locally.
No P1 production service, database, app-store release or paid infrastructure was created.

| Area | Current evidence / state | Remaining owner action |
|---|---|---|
| Public web readiness | [PR17](https://github.com/saeed-alorm/mawid-pro/pull/17) inspected; standard independent toolchain retained; [review verdict](engineering/pr17-review.md) | Saeed reviews/merges after the current `web-checks` is green |
| Private mobile source onboarding | Original prepared history reused; new private delta/source commits appended locally; no authoritative remote found in accessible inventory | Saeed runs the narrow import command with his existing authenticated account; private repository/import PR not yet created here |
| Private web source/build | Working-source supplement ported as a 34-path delta against public commit `16ca565831a67588dc1df9967b6740f44b757f99`; actual generating source now committed | Maintain/review the private delta and merge its import PR; historical generating commit stays unknown |
| Android build reproducibility | Flutter analysis/tests and private bundle checks pass; full compile status recorded in the continuation evidence below | Local debug compile passed; private remote CI/import review remain pending; emulator/physical acceptance is later and unrun |
| Optional account enforcement | Current main reports unprotected; rulesets `[]`; connector cannot administer settings/Projects or report plan; browser signed out | Apply available controls with existing authority; no paid plan or broad token request |
| Product decisions | [P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4) analysis started; [alternatives/cost/capacity/effort draft](engineering/p1-architecture-analysis.md) | Saeed/Rabeeh review decision requests; no architecture, provider, budget or date is approved |
| Later pilot acceptance | No usable emulator/KVM, physical-device rehearsal or live two-device service evidence | Saeed and eventual pilot participants verify exact target builds; three shops/two paid discussions remain targets |

## Audit and preservation

Actual default branch remains `main` at `cbf16d7fb5b7384690952613faab4bb3cf125742`.
PR17 was open and mergeable at `16ca565831a67588dc1df9967b6740f44b757f99` when reviewed;
it was not merged, replaced or force-pushed. Existing issues #3–#16 and their linked
dependencies remain. All FEAT-01–FEAT-50 IDs and phase assignments remain in the
[traceability index](engineering/feature-index.md). No duplicate engineering board,
50-issue expansion, new dates or customer commitments were created.

The original default-branch baseline had 22 passing tests and a normal build;
lint had one error/11 warnings, strict types had 42 diagnostics, and Pages prerender
failed in this environment. PR17 fixed those failures without relaxing tests/types
and removed the inherited wrapper, metadata, hooks, dependency/lock entries and
connection instructions. General SSR/route error handling and Pages routing remain.
The original audit is retained in [the earlier readiness revision](https://github.com/saeed-alorm/mawid-pro/blob/16ca565831a67588dc1df9967b6740f44b757f99/docs/github-readiness.md).

## Checks and exact source provenance

| Check | Result |
|---|---|
| Public implementation CI at 16ca565 | [Successful web-checks](https://github.com/saeed-alorm/mawid-pro/actions/runs/42369439217): clean install, 22 tests, lint/types, normal/Pages builds, original artifact/toolchain checks, 2 browser tests |
| Public continuation at af8e405 | [Successful web-checks](https://github.com/saeed-alorm/mawid-pro/actions/runs/42376320950): clean install, 22 tests, lint/types, both builds, artifact/toolchain scans, 2 browser checks and setup-script syntax. This checklist follow-up also receives [its own PR checks](https://github.com/saeed-alorm/mawid-pro/pull/17/checks); final exact SHA/run is recorded in the PR comment |
| Supplied private snapshot | All 195 selected file hashes verified; base 6367a318… is context, not an old bundle generator |
| Private web unit/integration/bridge tests | 113 passed across 8 files |
| Private strict types/lint | Passed without relaxed flags; lint 0 errors/18 warnings in the larger supplied private runtime |
| Private normal/static builds and original artifact checks | Passed using PR17's Vite/React/TanStack/Tailwind/Nitro configuration and npm lock |
| Private vendor-hook/source/lock/client scan | Passed; no inherited builder dependency or runtime hook restored |
| Rendered private bridge | 2 Chromium checks passed: manual approval/route continuity; tenant rejection/Arabic reload, scoped private palette verified |
| Bundle reproduction from a clean detached source checkout | 40 non-HTML runtime files matched exact hashes; HTML differed only in one TanStack prerender timestamp; build manifest has a per-build timestamp. No byte-identical HTML/APK claim |
| Flutter analysis and tests after regeneration | Analysis clean; all 5 existing unit/widget tests passed |
| Android debug APK compile | **Passed**: `flutter build apk --debug --no-pub`, full JDK 17, Gradle 8.14, Android platform 36/Build Tools 35.0.0/NDK 28.2.13676358; private debug test artifact only. Mobile source `62e454b0b63ce90203478c2e41f91cd1e94c9a6b`; Android Debug signature verified; all 42 embedded web files match their provenance. APK SHA-256 `666f82bda8f3cfcb1bb7546b44a91ec5e346e25c65cd304b3cad04b1d5ce733d`. Logs and full toolchain are in the private evidence package |
| Emulator/physical-device/live two-device acceptance | Not run; no acceptance inferred from web CI or a compile |

Workspace maintenance removed unsaved local continuation artifacts after an earlier successful execution. The original prepared private history was recovered from its saved package, and the supplied working source was reverified and ported again. Recreated continuation commits have new SHAs; previous unsaved aa04d1a/67d5af0 references are superseded here. All current restored-source web/build/browser/reproduction checks were actually rerun; this is not a relabeling of the old results.

New private web output was generated after committing source
`ec7f005c689304ce34536cc9d419a9a32edb0fda`; generated bundle commit
`62e454b0b63ce90203478c2e41f91cd1e94c9a6b` records that source, the public pin,
Node 24.22.1/npm 11.9.0, command `npm run build:android:platinum`, lock hash and all
42 packaged output hashes. Its content is kept private. The historical bundle's
generating SHA remains null. Old bundle hashes identify an artifact only and do not
prove source equivalence. The newly maintained source is a port of a working snapshot,
not a recovered clean historical commit.

The private layout has one documented public-source pin, one shared patch and added
private bridge/assets/tests. Materialized `.work/web` is disposable, not a second
editable application. It retains `mawid.platinum.demo.v1`, `MawidNativeBridge` v1,
manual approval and simulated demo identity. Public Pages is never synced over it.
A separately delivered private Git bundle retains the original prepared history
plus these source/setup/output commits; no private source/assets are placed here.

## Gradle diagnosis and authorized fix

The old `Network is unreachable` distribution failure did not establish a server
outage, DNS failure, bad credentials or source compile error. HTTPS transport through
the session proxy was verified with normal certificate checking: services.gradle.org
redirects via github.com to release-assets.githubusercontent.com and returns 200.
The official Gradle 8.14 archive was checksum-verified before seeding its standard
local wrapper cache. No URL repository substitution or TLS bypass was used.

The Java/Gradle process needs explicit task-local proxy properties; single-use Gradle
processes prevent reuse of an expired session proxy. Plugin resolution was then
observed from plugins.gradle.org. A concurrent diagnostic/build cache lock was
resolved by ending the diagnostic and retrying sequentially; locking was not disabled.
Subsequent checks identified two missing environment requirements: full JDK 17 with
`javac` (the installed runtime lacked the compiler), and AGP 8.11.1's Build Tools
35.0.0 alongside Android platform 36. Both were installed from official sources;
Temurin JDK 17.0.21+9 and its provider checksum were verified. Setup/CI preflight now
requires the compiler and correct Build Tools; CMake 3.22.1 is pinned in setup/CI.

The downloaded JDK initially lacked the supplied proxy CA and reported PKIX chain failures to dl.google.com, repo.maven.apache.org and storage.googleapis.com. Pointing Java to the provided `/etc/ssl/certs/java/cacerts` trust store resolved that TLS trust configuration without disabling verification. The original execution compiled an APK successfully. After workspace recovery, native analysis and all five tests were rerun; restoring the official extracted flutter_tester executable permission resolved its launch failure. The restored-source final compile passed, and Android Debug signature plus all 42 embedded web hashes were verified. No source assertion was relaxed.

A repeated workspace build had unreadable Gradle transform metadata and staged temporary native files. A clean `/tmp` source clone and task-local cache resolved that environmental failure without disabling locks. The restored cold compile passed in 436.7 seconds; the final scoped-palette rebuild passed in 19.0 seconds. The APK has 203 entries, no hidden/staged paths, and all 42 embedded web hashes match the current provenance. Emulator/physical acceptance remains unrun.

No authentication challenge or DNS failure was observed. No broad network policy change has
been needed on the verified route. Any later blocked host must be reported from its
actual failure, rather than requesting unrestricted access.

## Remaining narrow account actions

Current tools support source/PR/issue writes but do not expose repository creation,
Project creation or label/milestone administration. Label/milestone endpoint reads
were explicitly rejected by the connector's endpoint allowlist; account plan and
Lovable authorizations are not exposed. The browser is signed out. Owner `admin`
permission on the repository is distinct from the connector's API capability.

Use the existing [gh/API continuation](../scripts/github-setup.py) with Saeed's
already-authenticated account. It preserves edited issues/status, detects duplicates,
recovers empty partially created Projects, refreshes bundle refs after partial imports,
and pushes without force. It does not upgrade plans, change billing, merge, deploy,
change repository visibility or set nonexistent required checks.

```sh
python3 scripts/github-setup.py audit
python3 scripts/github-setup.py mobile-import --bundle ../mawid-private-readiness/mawid-mobile-readiness.git.bundle
python3 scripts/github-setup.py metadata
# Optional branch enforcement, only with an actual successful current checked SHA:
python3 scripts/github-setup.py protect --sha CURRENT_SUCCESSFUL_WEB_PR_SHA
```

`metadata` reuses the 14 live issues and separately creates the prepared mobile issue
only in the private target, then reconciles one private MAWID Engineering Project,
phase/type/priority labels and P0–P5 milestones without dates. New items start Backlog;
existing states are preserved. Private Actions remain gated until included allowance
and a paid-usage hard stop are verified. Optional unsupported enforcement uses manual
PR/check/self-review discipline, not a paid upgrade or impossible independent review.

## Account authorization is a separate unresolved audit

Source/lock/output scans prove code cleanup only. No active GitHub account authorization or
webhook could be inspected or removed with current authority. A separate Lovable profile read returned an internal error and supplied no authorization evidence. Saeed's precise remaining
action: inspect GitHub Settings → Applications (Authorized OAuth Apps and Installed
GitHub Apps), mawid-pro Settings → Webhooks, and the matching project's GitHub connection
in Lovable. Remove only verified Lovable-only access/hooks, preserve unrelated
integrations, and record the actual result. No disconnection is claimed.

## Decision work and next action

P1-ARCH analysis is underway now under the continuation instruction; it does not wait
for emulator/physical acceptance or optional account controls. The draft compares
three unapproved service/storage alternatives, workload/hosting and messaging-cost
assumptions, manual/pending/Any/proposal capacity rules, concurrency/idempotency and
Beirut-time questions, and preliminary effort ranges. The existing #3 dependency is
preserved for implementation readiness. No provider, spending cap, staffing capacity,
delivery date, automatic member eligibility, iOS timing or mass publishing is approved.

Saeed reviews/merges PR17 and completes the narrow private import action; Saeed/Rabeeh
review #4's decision requests in parallel. Product intent/decisions remain in
[Notion HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea), whose feature/database
pages remain unverified. A merged PR, compiled test APK, released fix and resolved
customer ticket are distinct. Follow [release evidence](engineering/release-evidence.md).
