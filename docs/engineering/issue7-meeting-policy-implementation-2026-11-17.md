# Meeting policy implementation — 17 November 2026

This implements the independent permissions/cancellation slice of the
[16 November decision delta](../decisions/2026-11-16-pilot-workflow-delta.md).
Base: `main` at `c5d7958fdb0b8a1855400c213518447499856b86` (PR #30).
Related engineering work: #4/#5/#6/#7/#8/#9/#12; review feature tracked in #31.
Feature traceability: FEAT-09/10/11/17/26. No release version or tag is created.

## Result

Trusted actor/professional bindings replace location-wide professional booking
reads. SQL RLS, core lists/details, notification materialization/inbox/opening and
queued dispatch all apply the effective assigned/requested professional scope.
Unassigned Any requests do not belong to an employee. Initial action notifications
go to active admin/manager accounts. Both fictional partner accounts exercise the
existing additive admin and manager capabilities; four separate employee accounts
exercise read-only access. Employee clients have no booking mutation form.

Customer cancellation is allowed strictly before the appointment starts. The UI
warns that cancelling with less than 60 minutes remaining contributes to the late
cancellation flag. Exactly 60 minutes is excluded. The derived counter retains
the fourth qualifying cancellation/rolling 90-day rule, salon scope, duplicate
replay protection and no automatic ban. Earlier uncounted cancellation, salon
cancellation and pending withdrawal remain distinct. Start/post-start behavior
is not expanded; those definitions remain open.

The new migration is appended, not substituted for an applied file. It was
generated with Supabase CLI 3.2.0 and applied only to disposable fictional local
databases. No hosted migration, identity provisioning or backfill is performed.
Existing historical booking/event rows are unchanged; the counter is derived
using the new rule, as explained in the decision delta.

## Verification

Node `24.22.1`, npm `11.9.0`, exact-lock `npm ci`, PostgreSQL `17.12` with the
repository-pinned image digest. Chromium 145 / Playwright 1.58.2 exercised the
local connected web client. Notification delivery is simulated; signed sessions
are fixture identities, not production sessions.

| Command / evidence | Result |
| --- | --- |
| `npm run test:meeting-policy` | 15 checks with local identities and 15 with signed fixture identities |
| `npm run test:booking` | 23 booking checks, including late cancellation/replay and continued booking eligibility |
| `npm run test:data-auth` | 282 authorization checks |
| `npm run test:identity` | 33 session checks and 282 signed authorization checks |
| `npm run test:notifications` | 9 unit and 13 integration checks |
| `npm run test:data-db` | 61 schema, persistence and migration checks |
| `npm run test:booking-clients` | 9 actual connected browser checks, including employee read-only controls and enabled late cancellation with warning |
| `npm run test:data-csv`, `test:data-api` | 14 CSV and 32 API checks |
| `npm run test:data-maintenance` | Scheduler unit and 28 integration checks |
| `npm run test:data-migrations` | 8 safety unit and 23 recovery integration checks |
| `npm test`, `npm run typecheck` | 30 unit tests and strict types pass |
| `npm run lint` | No errors; 11 existing Fast Refresh warnings |
| `npm run build`, `build:pages`, `verify:pages`, `verify:toolchain` | Pass |
| `npm run test:browser` | 2 Pages navigation and Arabic/RTL persistence checks |
| Python GitHub setup validation | Compile and 5 unit tests pass |

The policy metadata in `database/meeting-policy-*-verification.json` records
checks and SHA-256 values for the migration, fixture and policy sources.
`database/booking-client-verification.json` records the connected UI source hashes.
Other regenerated verification files are local run evidence, not deployment proof.

Baseline before edits: unit/type checks, 23 booking checks and 282 authorization
checks passed. Initial new fixture failures exposed the required explicit
professional mapping and PostgreSQL row-lock policy semantics; these were fixed
with retained permission assertions, then rerun successfully. A worker can lock
bindings but cannot rewrite them. Employee direct mapping writes are denied.

The first broad run exhausted the local Docker VFS disk. After removing only this
task's disposable fixtures, database and browser reruns passed sequentially.
Local real-Auth Email OTP verification remains pending at publication while its
isolated stack is rerun; the PR CI includes `test:identity-email`. The optional
staging build was attempted without hosted URL/publishable-key configuration and
correctly rejected missing configuration; it is not a hosted staging result.
Default-sandbox preview port restrictions required running the Pages checks with
local-network permission; the completed artifact and browser checks passed.

The local Pages build was made from the modified working tree above base, with
no version/tag and `source_dirty: true`. Its client tree SHA-256 is
`d45d557e59e407008644457e1b5f6c449455ea0351d32d5f844b37c43a45136c`
(sorted relative file paths plus NUL, file bytes plus NUL). This is a local web
artifact, not a signed mobile release. The PR head and CI record identify the
published source and independent validation.

## Self-review and acceptance limits

Codex reviewed the RLS/API/notification scope together, direct binding write
denials, revoked binding suppression, guessed-ID behavior, cancellation
boundaries/counting and replay behavior. No checksummed migration, lockfile,
private brand asset or deployment credential was replaced. Maintainer review
and merging remain with Saeed.

This slice does not implement visit/segment booking, new-caller intake,
15-minute scheduled reminders, automatic review invitations/ratings, loyalty,
campaigns, reporting or hosted identity-to-booking integration. Their issue
requirements now reflect the meeting; unresolved product definitions remain
explicit. Existing engineering-continuation exceptions remain non-blocking.

No private mobile source, APK, iOS target, physical-device delivery or pilot
acceptance is established by these tests. No release or production deployment
was performed. The engineering issues remain open for their wider acceptance.
