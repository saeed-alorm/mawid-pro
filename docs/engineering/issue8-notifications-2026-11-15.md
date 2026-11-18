# Issue #8: local transactional notifications

**17 November preparation:** the [native integration handoff](native-completion-public-handoff.md)
records package-scoped customer/management registration, session-bound dispatch,
current visit/review opening, and the separate staging adapter/configuration review.
Earlier demo-only descriptions below are the dated original slice. Hosted
configuration and device delivery are separate evidence gates; pilot access remains disabled.

Tracks [#8](https://github.com/saeed-alorm/mawid-pro/issues/8), FEAT-32/34.
Base main: `f6b9a98656d681dbac2060c925dfa7e0e754ee0e` (merged #23, with #21/#22).
Real authentication remains in [#5](https://github.com/saeed-alorm/mawid-pro/issues/5).
Full client integration and device acceptance remain in
[#7](https://github.com/saeed-alorm/mawid-pro/issues/7). Neither issue is closed.
This adapter accepts only fixture-created, short-lived synthetic sessions and
loopback PostgreSQL; it is not a production authentication or hosting service.

## Delivery and fallback

The booking transaction continues to commit its event and outbox row atomically.
The separate notification worker materializes due events with row locks and
`SKIP LOCKED`, creates one inbox record per event/recipient and one push job per
destination, and sends outside the booking transaction. A notification failure
cannot roll back a booking. The authoritative booking projection remains
available regardless of delivery status.

The persisted in-app inbox is the fallback. Each job records `simulated` or `fcm`
transport explicitly; simulator acceptance is never presented as FCM delivery.
Push states are `pending`, `sending`,
`accepted`, `failed`, `skipped` and `no_destination`. `accepted` means provider
acceptance, never confirmed display, receipt or reading on a device. The outbox's
old `delivered` vocabulary is migrated to `accepted` to avoid claiming device
delivery. Owner/manager status includes failures; customers see only their own
authorized records. Opening a notification authorizes its current recipient and
fetches the current booking through the authoritative booking service again.

Each job has a fenced 60-second lease, a 10-second sender timeout and at most five
persisted attempts. Backoff starts at 30 seconds, doubles with jitter to a
15-minute ceiling, and honors a provider Retry-After bounded to one hour. Worker
failures also back off; batches of at most five sends never overlap. Expired leases recover after a
crash. FCM cannot supply exactly-once delivery across the acceptance/persistence
crash window: retries can repeat a generic alert. Stable IDs, Android replacement
tags, unique inbox/destination keys and idempotent opening prevent repeated
booking changes or duplicate inbox entries. No booking mutation accepts a push
payload as authority.

Only committed events create notifications. The core's existing `deliver_after`
defers an after-hours request's initial staff notification to the next configured
opening. Superseded events are skipped. Pending remains non-reserving; its
15-opening-minute overdue flag is staff-only booking metadata. This worker
creates no overdue pushes, reminders or new booking events on a timer.

## Registration and access

All endpoints require the existing server-issued session:

| Method | Path beneath `/v1/workspaces/:workspace/locations/:location/notifications/`                                     |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| POST   | `registrations` — installation UUID, server-allowlisted application/environment, EN/AR locale and private token |
| DELETE | `registrations/:installation` — revoke this actor's scoped installation                                         |
| GET    | `inbox` — bounded status list with authoritative current booking state                                          |
| POST   | `inbox/:notification/open` — idempotent open and fresh authorized booking projection                            |

Actor identity comes from the session, never registration tokens, application IDs,
brand values or request fields. Registration, dispatch and opening all recheck
workspace/location/object access. A token already active for another actor cannot
be rebound by presenting it. Rotation updates the encrypted destination version;
a delayed invalid-token result cannot disable a newer token. Invalid tokens and
logout revoke the destination and clear its ciphertext. Stale destinations are
not dispatched after 90 days. Revoked actors receive no booking data on opening.

The worker has its own non-login privilege group and an allowlisted local login,
with no superuser, RLS bypass or actor membership. Tables force RLS; HTTP actors
cannot read destination ciphertext or mutate notification jobs directly. Tokens
are AES-256-GCM encrypted with recipient binding as authenticated associated
data and keyed digests for matching. Keep the 32-byte encryption key and server
credentials outside Git and outside Flutter. Retain that key across a worker
restart; loss requires device re-registration, not logging decrypted tokens.

## Private Android and Firebase boundary

The authoritative Android source is private `saeed-alorm/mawid-mobile`, verified
main `c234ad939b719afe71a345b16ba2ce3f025509ba`. The user's checkout is at
`C:\Users\Saeed\Desktop\mawid\mawid-mobile`; issue work is isolated in a private
worktree. Public Pages output is never copied into that checkout. Android source,
assets, client Firebase configuration, tokens and APKs are excluded from this
public repository. Private build provenance and exact device results stay in the
private repository's evidence directory.

On 15 November the actual Firebase Console showed MAWID Development on
**Spark / No-cost ($0/month)**, with HTTP v1 enabled and legacy messaging disabled.
No billing or infrastructure change was made. The Android package/configuration
match was verified before SDK integration. The owner selected keyless Google
ADC; the manual sign-in completed and credentials remain in the user's external
ADC location. No service-account key was generated or placed in Flutter.

FCM is listed as a no-cost product on the
[Firebase pricing-plan documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).
The local worker and in-app fallback require no provisioned paid infrastructure.
Android notifications are opt-in; background lock-screen text contains only a
generic bilingual update, with opaque routing IDs. The app must fetch current
booking state on opening. Console transport testing and real booking-event
delivery are separate verification milestones; neither is inferred from a build
or simulator pass.

## Verification

`npm run data:local` runs the asynchronous worker with the simulated sender by
default. Set `MAWID_NOTIFICATION_TRANSPORT=fcm` explicitly to use real HTTP v1 in
the approved development project. Keyless ADC is discovered outside Git; an
existing `GOOGLE_APPLICATION_CREDENTIALS` file is also accepted only outside Git
and only for the supported trusted Google credential types. No credential can
be selected through HTTP input. Authentication-library exceptions and provider
message bodies are never logged.

The runner prints only the paths to external private synthetic-session files.
Use `node scripts/database/notifications/pair-android.mjs /absolute/path/to/android-notifications.private.json`
with `ANDROID_HOME` set and one connected authorized device. This validates the
debug APK (version code 4+), forwards the loopback port and writes only the
short-lived synthetic actor session into app-private storage. It does not copy
FCM server credentials. Open the app's Notifications and connect the local test
inbox. Native booking UI and real authentication remain outside this bridge.

The fixture encryption key lives only in the local server process; a fresh
`data:local` process creates a fresh disposable database. The worker constructor
accepts a retained external 32-byte key for restart/recovery tests. Do not
promote this disposable local runner into production infrastructure.

Run `npm run test:notifications` for token privacy, bounded backoff, scheduler
concurrency and real PostgreSQL integration with the minimal simulated sender.
The integration checks cover session/tenant/object isolation, after-hours gating,
event replay, duplicate claims, retry persistence across database/worker restart,
attempt exhaustion, late lease completion, stale event suppression, token
rotation/invalidity, logout/revocation and customer-visible failure without losing
a confirmed booking. No real token, credential or provider message is retained
in test output. Live transport and exact-build device results are recorded only
after their actual execution.

### Observed development-device results

On 15 November 2026, server source
`156cf969a4fa8c3ceb7efd99f271c6550fa7f6a2` dispatched a committed synthetic
request through real FCM. The operator observed its notification with the private
Android app in the background, then opened it and saw authoritative Pending
version 1. The server persisted that authorized open at
`2026-11-15T12:14:32.931Z`. A subsequent committed confirmation produced a
foreground in-app update; opening the inbox row fetched Confirmed version 2,
with the authorized open persisted at `2026-11-15T12:19:31.717011Z`.
Each provider send was accepted on its first attempt. These device observations
are separate from provider acceptance and from the earlier Console tests.

The exact private mobile runtime source was
`8ac50bae3efde3740905dae159c1aa1a43f3fafe`, debug version `0.3.1+4`, APK SHA-256
`345897b19362ac0b837433d0c478591d4d7ebadd6ea85082484e2dc7f7ee257d`,
on BBB100_2 / Android API 27. USB forwarding remained connected for the local
authorized API fetches. See [sanitized live evidence](../../database/notification-live-verification.json).
The disposable fixture and its synthetic sessions were stopped after evidence
capture. Android 13+ permission behavior, terminated-process receipt, multi-brand
acceptance, real authentication and complete booking-client integration remain
unverified; #5 and #7 remain open.

### Final local regression

All 16 clean-install/regression commands passed with pinned Node 24.22.1 and
npm 11.9.0. This includes 9 notification unit/contract tests, 13 notification
PostgreSQL checks, 23 booking checks, 32 local API checks, 282 authorization
checks, maintenance/migration/CSV suites, 22 web tests, strict types, normal
and Pages builds, artifact/toolchain verification and 2 browser tests. Lint has
zero errors and the 11 existing warnings. The independent isolated-schema run
passed all 61 checks, and all 5 Python setup tests passed. The cold-build baseline
had transient local database-readiness failures; the final sequential runs all
passed without changing their assertions. See
[regression evidence](../../database/notification-regression-verification.json).
These are local results; no remote CI, merge, release or broad device acceptance
is implied. Review commits and PR descriptions are prepared locally.
