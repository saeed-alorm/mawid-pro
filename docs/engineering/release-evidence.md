# Versioned build and target acceptance

No production release/tag is created by readiness work. The current web prototype
has no declared release version/tag. The supplied Android candidate declares
`0.2.0+2`, not a verified store or pilot release.

For each future build, record:

| Field | Required evidence |
|---|---|
| Version/tag | Approved identifier; distinguish test candidate, preview and production |
| Sources | Exact web/service/mobile commits and relevant migration/schema version |
| Provenance | Lock hashes, toolchain versions, build command, CI run and artifact hash |
| Variant/platform | Public Pages vs private Android variant; Android API/device/ABI or browser; signing class |
| Checks | Passed/failed/not run, with test/analysis/build outputs and CI links |
| Acceptance | EN/LTR and AR/RTL; device/restart/offline/error flow; reviewer/date and unresolved defects |
| Recovery | Known prior artifact, compatible data/schema rollback and restore drill where live data exists |
| Support | Release note, rollout/rollback owner, linked defects and independently confirmed ticket outcomes |

Pages emits `build-provenance.json` with exact checked commit, source-dirty flag,
lock hash, Node version, command and timestamp. A dirty local build is exploratory
and cannot be treated as a reproducible tagged release. The private mobile workflow
records the mobile commit, Flutter version, bundled-web provenance and APK hash.
Until the private web source commit is recovered, its provenance gap remains visible.

After merge move the Engineering Project item to Ready to release, then verify the
actual versioned target artifact. Done requires the issue's acceptance/release
criteria, not merely a merged PR. A released defect fix does not resolve a Notion
customer ticket until its customer outcome is confirmed. Readiness does not authorize
production deployment, data provisioning, a store release or paid services.

## Distribution evidence required — 8 November 2026

Follow [Android distribution design and validation](android-distribution.md) for FEAT-01/FEAT-24: brand-to-package/account mapping, separate management identity, signing/upload public fingerprints and custody/recovery, per-package versionCode/versionName, source/manifest/asset/lock/tool hashes and artifact SHA-256, read-only PR versus protected release credentials, approval and actual review/rollout outcomes. Two brand apps must co-install from one source commit, pass EN/AR/tenant/notification isolation, and receive one shared fix rebuilt for both. Include shared management Android plus web portal from pilot one. All remain acceptance requirements; no store upload/approval or device validation occurred in this documentation update. Keep secret custody and real assets/source private. Central-account consequences, maintenance time and support capacity must be measured; iOS remains future feasibility in #15.

