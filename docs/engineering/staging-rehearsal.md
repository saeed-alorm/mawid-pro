# Verified booking staging rehearsal

18 November 2026 · Candidate source `ea9cb26ce581899006c43d048cfdb4805fbda1b5`.

Saeed owns the staging target, deployment and recovery approval. The current work
covers local preparation and hosted reads. The hosted grants, booking writes,
scheduler, OTP and push sends, restore, rollback and target-device runs below
are steps for a separately authorized rehearsal. Keep `PILOT_ACCESS=disabled`,
use fictional accounts and fixtures exclusively, and keep staging separate from
production and the GitHub Pages demo.

## Target and read-only diagnosis

| Surface | Target and evidence |
| --- | --- |
| Email OTP staging | Historical origin `https://mawid-auth-staging.saeed-alorm.workers.dev`, Worker `mawid-auth-staging`. The baseline [manifest](../../wrangler.staging.jsonc) serves `staging/dist` with an SPA fallback and has no Worker entry point. The [identity handoff](issue5-identity-contract-2026-11-16.md) records the earlier hosted sign-in proof. Fresh public responses are recorded below. The active immutable version and route ownership remain unverified. |
| Verified booking staging | Proposed separate Worker `mawid-booking-staging`, entry point `scripts/database/hosted/worker.mjs`, source candidate `mawid-booking-staging@ea9cb26`, [reviewed manifest example](../../wrangler.booking-staging.example.jsonc). Route `/v1/*` on a dedicated approved HTTPS staging host, with that origin set in `MAWID_API_ORIGIN` and the exact rehearsal clients. The example has `workers_dev: false`, `preview_urls: false`, no attached route or assets, and required placeholders. Saeed must identify the Cloudflare account, zone, hostname, routing method and active version privately before execution. An approved Cloudflare Custom Domain is an option when the Worker will own the host. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) |
| Supabase staging | Use the isolated staging Auth issuer and session pooler tied to the same project. Confirm their identity against the existing account inventory and reviewed operator configuration. Exact project, pooler, fictional subject and scope values belong in that private inventory. |

- The [native completion handoff](native-completion-public-handoff.md#verification-record)
  records a signed GET-only probe at 2026-11-17 20:20:49 UTC. On the historical
  Auth origin, `/v1/workspaces` and `/v1/session` both returned 404
  `NOT_FOUND`. The probe reused an existing session.
- On 18 November 2026, anonymous curl GETs reached the historical Auth origin
  using the permitted network retry after sandbox DNS failures. The initial
  `/v1/session` attempt timed out before HTTP. The successful responses were:

  | UTC | GET and request type | Response |
  | --- | --- | --- |
  | 09:58:55 | `/`, browser navigation headers | 200 `text/html`, MAWID staging page marker |
  | 09:59:00 | `/v1/workspaces`, JSON | 404 `application/json`, `NOT_FOUND` |
  | 09:59:25 | Unknown `/v1/` control path, JSON | 404 `application/json`, `NOT_FOUND` |
  | 10:00:05 | `/v1/session`, JSON retry | 404 `application/json`, `NOT_FOUND` |
  | 10:00:07 | `/v1/workspaces`, browser navigation headers | 404 `application/json`, `NOT_FOUND` |

  The successful API responses carried `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`.
- The tracked Auth manifest is assets-only, and Cloudflare can return SPA HTML
  for navigation to an unmatched asset path. The fresh JSON responses, including
  navigation to `/v1/workspaces`, are consistent with the prior local permissions
  Worker for the same script name. That build claimed `/v1/*`, used the same
  404 body and headers, returned 404 when the allowlist or pilot guard failed,
  and omitted the `/v1/session` handler. The deployed implementation, runtime
  guard state and source SHA remain unverified. A scoped read can also return
  intentional 404. The original intermittent fixture 500 exception was never
  captured. The cause remains unresolved. [Cloudflare SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- The cached Wrangler OAuth session had expired and the existing dashboard
  session could not be accessed. Deployment and version metadata remain pending
  an authenticated read-only check.

The next read-only check is to inspect the existing Workers dashboard for both
script names, active immutable versions, attached routes/DNS, deployment source,
asset handling and binding names. Compare that metadata with the probe time
and the intended source. For the verified API, compare browser navigation to
`/` on the Auth origin and `Accept: application/json` GETs to the two API paths
on the approved API origin. Record status, content type and recognized
error code only. An unauthenticated GET reaching the configured shared API
returns JSON 401 `SESSION_REQUIRED`. With an already-valid fictional session
and known allowed scope, `GET /v1/workspaces` returns only current staff
memberships and `GET /v1/session?workspace_id=<uuid>&location_id=<uuid>`
returns the authorized actor, roles, scope and customer IDs. Record the
projection shape or counts. A deliberately wrong scope should return generic
404. The booking scope transaction acquires database locks. Confirm its runtime
principals in the authorized rehearsal before relying on a signed GET probe.
The shared HTTP bridge checks both the request host and any browser
`Origin` against the configured API origin. Connected browser acceptance
needs a reviewed same-origin serving arrangement. Earlier hosted OTP evidence
covers sign-in only.

## Operator preflight and migration order

1. Bind the candidate to a reviewed exact source SHA and artifact hash. Inventory
   the current staging deployment/route, trigger state, active secret versions,
   actual DB migration history, extension and role inventory, function ownership,
   effective transitive privileges and current rows/jobs by aggregate count.
   Keep that inventory in the restricted ops record. Verify the runtime against
   a staging-only target and keep dispatch stopped until the test recipient
   boundary is verified. Confirm PR validation stays `contents: read` and has
   no hosted credentials.
2. Quiesce staging application writes and scheduled jobs for the authorized
   change. Prepare and successfully restore the pre-change backup to an isolated
   database as described below. Rehearse the exact ordered SQL on both an empty
   fictional database and a copy with the actual applied prefix. Check
   `btree_gist` and the expected `mawid_local_actor` and
   `mawid_local_maintenance` NOLOGIN groups before their first use. Check for
   schema/role collisions, migration-created group attributes and any legacy
   grants. Keep synthetic SQL logins and auth-fixture policies out of staging.
3. Compute the SHA-256 of each exact checked-in SQL file at the deployment SHA,
   and compare the version, filename, checksum and schema evidence with the
   hosted applied prefix. Apply only the reviewed pending suffix in order,
   stopping on the first failure. Each successful transactional file and its
   history entry must agree. Treat missing, partial or conflicting history as a
   reconciliation blocker. The [local migration runner](issue6-step4-migration-recovery-2026-11-14.md)
   is restricted to marked fictional fixtures. Its journal is local rehearsal
   evidence. The candidate order in [the migration directory](../../supabase/migrations/)
   is:

   ```text
   20261114162225_tenant_model.sql
   20261114162232_local_authorization.sql
   20261114162239_assisted_transfers.sql
   20261114162405_retention_and_constraints.sql
   20261114172144_authorization_export_scope.sql
   20261114174231_protected_local_maintenance.sql
   20261115063746_local_booking_worker.sql
   20261115101500_local_notifications.sql
   20261116130000_verified_shop_identity.sql
   20261117132037_professional_scope_late_cancellation.sql
   20261117144500_visit_segments.sql
   20261117150000_caller_visit_intake.sql
   20261117151500_scheduled_booking_notifications.sql
   20261117153000_visit_reviews.sql
   20261117220000_native_notification_packages.sql
   ```

4. After the migration, review and apply only the approved portions of
   [staging-grants.review.sql](../../supabase/hosted/staging-grants.review.sql)
   in a separately recorded change. Reconcile any existing actor/session roles
   first. The review SQL creates dormant NOLOGIN booking and notification
   roles. The session pooler runtime requires separate usable credentials for
   those exact role names. Resolve and record the explicit login activation,
   custody and applicable write settings before deployment. The staged actor's
   write enablement is a separate operator gate. The booking and notification
   roles require their scoped writes for the rehearsal. The session reader
   remains read-only throughout.
5. Provision only the fictional fixture's reviewed identity bindings, memberships,
   professionals and customer records through the trusted operator path.
   Confirm the private allowlist, issuer/audience, role grants and app mappings,
   one scope at a time. Bind the four credentials and sender through restricted
   operator configuration. Verify public exposure and the real API error shape
   with cron stopped before enabling test writes and then the scheduled run.

| PostgreSQL principal | Bindings and checks |
| --- | --- |
| `mawid_staging_session` | `STAGING_SESSION_DATABASE_URL`. Session-reader privilege group `mawid_identity_reader`, no actor or job memberships. Confirm function execution in a READ ONLY transaction targeting only the currently verified issuer, subject and session with a live binding. Compare owner, fixed `pg_catalog` search path, fully qualified inputs and no PUBLIC execute on `mawid_core.staging_auth_session()`. Supabase-managed Auth grants and policies stay intact. The reader has no direct Auth table grants. |
| `mawid_staging_actor` | `STAGING_SCOPED_DATABASE_URL`. Inherits `mawid_verified_actor`, resolves the actor only from verified session context, and cannot assume booking, notification or maintenance roles. Verify an unbound session resolves no actor. |
| `mawid_staging_booking` | `STAGING_BOOKING_DATABASE_URL`. Inherits only the reviewed booking worker group `mawid_local_booking`. Verify it cannot assume actor, notification or maintenance roles. |
| `mawid_staging_notify` | `STAGING_NOTIFICATION_DATABASE_URL`. Inherits only the reviewed notification worker group `mawid_local_notify`. Verify it cannot assume actor, booking or maintenance roles. |

For each runtime login, verify its exact identity, membership, role flags and lack
of object ownership or unintended grants. Verify RLS and FORCE RLS on protected
tables where defined. Test that `PUBLIC`, `anon`, `authenticated` and Data API
`service_role` cannot access the private core via direct schema/table/function
exposure. The migration/restore owner and maintenance roles stay separate from
the four runtime credentials. Use the provider's staging session pooler on
5432, database `postgres`, TLS with hostname and certificate verification and
`STAGING_DB_CA` where required. Each URL uses its expected role qualified to the
pinned project. The [runtime config](../../scripts/database/hosted/config.mjs)
enforces role/host/issuer agreement and checks the TLS configuration.
[Supabase connection and SSL guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

Use Worker secrets for the database URLs, the optional CA and the retained
32-byte `MAWID_PUSH_KEY_BASE64`. Keep the push key, recovery material and
rotation/re-registration evidence under separate private custody. Rollback uses
only the authorized key version matching stored ciphertext. If rotating the key,
pause dispatch, replace the key through the operator’s vault, exercise fresh
registrations and verify that queued jobs resume only with usable current tokens. Put
`STAGING_AUTH_ISSUER`, the bounded `MAWID_SESSION_POLICY`, `STAGING_SUBJECTS`
(one to eight fictional Auth subjects) and `MAWID_APPLICATION_SCOPES` with
reviewed workspace/location values in operator-controlled staging configuration.
Keep private UUIDs, addresses, connection URLs, bearer/refresh tokens, OTPs,
FCM registration tokens, sender credentials and secret values out of Git and
logs. Limit the fictional cohort to customer, both partners, own-assignment
employee, unrelated customer and cross-shop principal, with an unallowlisted
or revoked identity for denial cases. Use current provider sessions and
operator-provisioned bindings. Maintain the staging SMTP credentials in Supabase
Auth settings and restrict OTP rehearsal to approved fictional inboxes.

## Recovery and intermittent-error evidence

Before activation, record a UTC restore point, schema/migration manifest,
immutable Worker versions and artifacts, route/cron state and vault references.
Keep a consistent encrypted independent core export and protected deletion ledger
copy, plus a private role/grant inventory. Review backup coverage for Auth
identity mappings, files and external configuration separately. Restore to
an isolated compatible target with outbound SMTP/FCM and scheduled dispatch
disabled. Reapply approved roles/RLS, reconcile deletion ledger actions before
opening any API and verify restored visit segments, allocations, versions,
idempotency, event/outbox state, cross-tenant denials and exact manifest.
Record duration, coverage and results. The approved pilot objectives are 24 h
RPO, four staffed hours RTO, seven daily encrypted backups in owner-controlled
Google Drive plus a local copy, and separate key custody. This rehearsal must
measure restoration and confirm available destinations. [P1 operations and exit](p1-operations-and-exit-2026-11-14.md#backup-and-exit-scope)
· [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups)

On migration failure, retain the committed prefix and stop the batch. On unsafe
behavior, route failure or rising 5xx during the rehearsal, pause test writes
and scheduled/provider activity, preserve the UTC window and confirm the last
known compatible staging version. Use that version or detach the candidate
route if there is no compatible prior API. Verify route, binding and trigger
state independently during rollback. Preserve committed additive migrations and
any data, and prepare a reviewed forward correction. If a restore is necessary,
recover to an isolated target first and explicitly reconcile writes, deletion
ledger and external delivery since the cut-off before cutover. Job state must
prevent stale or duplicate dispatch following restore. Record the rollback
version, health and denial probes and the owner decision to resume.
[Cloudflare Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

For the intermittent 500, keep an operator-only record keyed by a short random
correlation value or a Cloudflare Ray ID. Record UTC timestamp, normalized path
template, method, status, allowlisted error code, latency, build/version and a
fixture role label. Correlate with the actual request-serving Worker version and
boundary outcomes for host/origin, session/JWKS, reader, actor/booking/notify
connection and privilege checks, schema/SQL and downstream sender as applicable.
If current telemetry cannot identify the boundary, review a staging-only,
time-bounded instrumentation change before deploying it. Capture reason categories
or allowlisted SQLSTATE only. Exclude headers, query values, paths containing real
IDs, credentials, IPs, raw exceptions, SQL parameters, provider bodies and
customer data. Compare a failed sample with a successful same-version,
same-scope sample using sequential read-only GETs first. Test TLS/principal and
schema history by read-only inventory before proposing a fix. In current source,
the Worker catches setup/bridge exceptions as 503 `TEMPORARILY_UNAVAILABLE`.
The shared HTTP API maps recognized dependency outages to 503 and other
uncategorized errors to 500 `INTERNAL_ERROR`. A different response could
come from routing, a different deployment or another layer. No correlated
500 was obtained in the current read-only investigation.
[Worker entry](../../scripts/database/hosted/worker.mjs) · [Shared HTTP API](../../scripts/database/api/http-server.mjs)

## Hosted acceptance after authorization

1. **#5 identity and #7 booking.** Sign in the fictional customer and each
   partner with staging Email OTP in the exact native customer and management
   packages. Enter the email and received code in the app, then read and verify
   the current workspace/location projection before any booking write. Check
   sign-in expiry, logout and revoked-session reuse on a second device, and deny
   forged app/scope, revoked,
   unrelated-customer and cross-shop requests. Exercise employee access to
   their own assignment and deny employee management or other appointments.
   Test a confirmed multi-segment visit from pending through approval, a
   proposal/retry or reschedule, and cancellation. Confirm full visit and
   version consistency across customer and partner clients, real Beirut hours,
   no duplicate under concurrent requests, and restart/reconnect. Exercise
   the late-cancellation count with boundary fixtures: exactly 60 minutes
   excludes the visit, less than 60 minutes before start counts once, and four
   qualifying cancellations in 90 days flag the customer only in partner
   context. Keep authority server-side. [Visit contract](visit-phase-contract.md)
2. **#8 sender prerequisites.** Review and bind a private `FCM_SENDER` service
   implementing the [sender contract](native-completion-public-handoff.md#hosted-adapter-and-reviewed-configuration).
   The adapter requires the binding during startup, including the HTTP path;
   hold cron until the sender's staging project, least-privilege permission,
   short-lived keyless identity and refresh behavior are verified. An approved
   platform-managed identity or narrowly scoped workload federation are
   candidate authentication mechanisms. Account, project, identity, quotas and
   route are operator decisions. Preserve package restrictions, replacement
   tags, generic EN/AR message text, bounded retry and the in-app fallback.
   Validate staging device registrations for `com.mawid.customer.platinum`
   and `com.mawid.management` against exact scope and co-installation.
   Exercise token replacement, logout/revoke, stale destinations, wrong
   package, isolated workspace, invalid token and transient provider errors.
   [FCM HTTP v1 authentication](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
   · [Google workload identity federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
3. **#8 real-time scheduled evidence.** With the approved version and
   configured one-minute cron, create and confirm a real fictional staging
   visit with two consecutive services. Use the normal API/client and a real
   server clock. Write down the final scheduled end in UTC and its Beirut
   display. At final end plus exactly two minutes the single current-revision
   invitation becomes due, with no manual completion. Check it is absent
   before that boundary, including between the two services. Capture the due
   time, UTC scheduled/actual cron execution, inbox creation, FCM acceptance,
   physical device receipt and tap separately. The due time measures the
   policy. The next scheduler tick, processing and provider transport contribute
   to receipt latency. Report the measured delay and investigate missed
   ticks or excessive lag before acceptance. Only the verified customer
   receives the review invitation. Tapping uses the visit-aware inbox open endpoint with `contract=2` and loads
   the currently authorized visit and review. The customer can submit one rating
   per distinct assigned professional. Check duplicate cron/retry, stale revision after reschedule,
   cancelled visit, logged-out installation and other customer denial. In a
   separate controlled visit, verify that the first after-hours staff push
   waits for opening and the later 15-opening-minute reminder goes once to
   both current partners. Use an eligible weekday or configured fictional
   opening and record the actual calculation. [Visit policy](visit-phase-contract.md)
   · [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
4. **#11 and #12 evidence.** Record the staged source/service/mobile commits,
   artifact and migration hashes, exact Android package/build/signing
   fingerprints, authenticated web build, device/OS versions, locale,
   sanitized probe and receipt times, tests, restore/rollback outcomes and Saeed's
   review. Check exact customer and management packages on physical devices, in
   EN/LTR and AR/RTL. Repeat a fresh eligible event with each target in the
   foreground and background with notification permission granted. Record
   in-app foreground behavior and any displayed notification, background/lock-screen
   display, process restart, launch from a notification and the authorized
   workspace/account refresh after opening. Record provider acceptance, device
   display, opening and authorized refresh as distinct observations. Keep real
   identities, recipients and evidence with private branding in restricted
   records. [Release evidence](release-evidence.md)

Hosted results remain pending under [#5 identity](https://github.com/saeed-alorm/mawid-pro/issues/5),
[#7 booking](https://github.com/saeed-alorm/mawid-pro/issues/7),
[#8 notifications](https://github.com/saeed-alorm/mawid-pro/issues/8),
[#11 operations](https://github.com/saeed-alorm/mawid-pro/issues/11) and
[#12 acceptance](https://github.com/saeed-alorm/mawid-pro/issues/12).
P1 follow-on includes reporting, approved salon content, brand/link/QR checks,
identity binding/invitations/recovery and abuse controls, customer A/B plus
management acceptance, operational backups, signing and release readiness. Those release gates remain open. [P1 implementation gates](p1-architecture-decision-2026-11-14.md)

## Public engineering handoff

The local `codex/native-staging-rehearsal` branch starts at fetched main
`dc4bad2f60612a69b3fdfffab3f60e91fa179832` ([PR #35](https://github.com/saeed-alorm/mawid-pro/pull/35)).
Commit `a021397e044e7114f2203b6602831890e164c918` exercises the current
customer visit detail, a first service inside the final hour while the second
starts outside it, exactly 60 minutes, just under 60 minutes, the start cutoff
and one counted cancellation after idempotent replay. Commit
`ea9cb26ce581899006c43d048cfdb4805fbda1b5` applies the optional visit cancellation
acknowledgement to first submissions and replays. The guard checks the same
server clock used to record cancellation. A new customer operation with false
acknowledgement returns 409 `LATE_CANCELLATION_CONFIRMATION_REQUIRED` when late.
After showing the warning, the client can retry with true and the original
operation key and version. The replay fingerprint excludes this acknowledgement.
Already committed outcomes replay as before and existing clients may omit the
field. The public CI workflow is unchanged. The companion private branch
`codex/native-ui-rehearsal` contains the Android candidates and evidence.

**Suggested PR title**

Verify the multi-service cancellation boundary and rehearse verified booking staging

**Suggested PR description**

Guard late cancellation using the existing booking clock and preserve exact
replay across acknowledgement. Verify one count per multi-service visit. Record the active sign-in origin’s read-only results and the checks for
a separate verified booking deployment. Include migration, grant, recovery,
native Email OTP, device and provider acceptance steps for the isolated
fictional cohort.

### Local verification

Node 24.22.1/npm 11.9.0, locked `npm ci`, existing disposable fixture Docker
images and a local Chromium browser. Command logs and sanitized receipts are
under `visit-phase-evidence/work-order-public/` in the shared workspace.

| Command | Final local result |
| --- | --- |
| `npm ci`, `npm test`, `npm run typecheck`, `npm run verify:toolchain` | Passed. 30 unit tests. |
| `npm run lint` | Equivalent ESLint CLI passed in an LF-normalized snapshot with 11 existing Fast Refresh warnings. The initial CRLF checkout failed Prettier formatting. |
| `npm run build`, `npm run build:pages`, `npm run verify:pages`, `npm run test:browser` | Passed after allowing loopback prerender on retry. 2 Pages smoke checks. |
| `npm run build:staging` | Passed with the existing approved publishable browser settings supplied in memory. |
| `npm run test:data-api`, `npm run test:data-auth`, `npm run test:data-csv` | Passed 32, 282 and 14 checks. |
| `npm run test:identity`, `npm run test:identity-email` | Passed 36 token/session/config unit, 282 signed, and 19 disposable real Email OTP/Auth checks. OTP stayed within the local mail catcher. |
| `npm run test:booking`, `npm run test:visits`, `npm run test:meeting-policy`, `npm run test:reviews`, `npm run test:booking-clients` | Passed. Booking 23, meeting policy 17 synthetic plus 17 signed, connected browser 12. |
| `npm run test:notifications` | Passed 9 unit plus 15 integration. |
| `npm run test:data-migrations`, `npm run test:visit-migration`, `npm run test:data-maintenance`, `npm run test:data-db` | Passed. Recovery 8 unit and 23 integration, maintenance 6 scheduler and 28 integration, foundation 61. Transient disposable PostgreSQL startup failures required serial retries. The visit-migration and maintenance integration scripts passed under pinned `node --import file:///…/postgres-readiness-probe.mjs` with the redacted readiness probe. |
| `python -m py_compile scripts/github-setup.py`, `python -m unittest discover -s tests -p test_github_setup.py` | Passed. 5 setup tests. |

`wrangler deploy --dry-run --config wrangler.booking-staging.example.jsonc --outdir <local bundle directory>`
passed with pinned Wrangler 4.162.0 (494.63 KiB upload estimate, 102.60 KiB gzip).
The three-file dry-run bundle tree SHA-256 is
`6e0d8cc88f14c4363698e61ed6eb3a06bf07e201d8683326e848b0a707599d05`.
The checkout config SHA-256 is
`67d1085c3598fa89f376932868592ba122c2a7beec2bc9c6905b176e006b02d0`.
Dry run covers the tracked manifest and adapter bundle. The signed and real
Auth fixtures cover the shared HTTP and database behavior and restricted Auth
reader. The cancellation guard reruns passed visits, reviews, notifications,
meeting policy, data API and connected Chromium. Exact commands, checkout
source hashes and the bundle receipt are in the local
`work-order-public/guard/guard-verification.json`. Effective hosted routes,
grants, binding values and TLS remain
deployment checks. The merged PR’s web and data jobs passed with the original
CI coverage. [PR #35 CI](https://github.com/saeed-alorm/mawid-pro/actions/runs/44249430680)

The simulated delivery suites verify the 15-opening-minute reminder boundary
for both current partners on `com.mawid.management`. The signed review fixture
checks the current due time at final assigned end plus 120,000 ms, package
scope to `com.mawid.customer.platinum`, cancellation/rescheduling suppression,
stale opening and revoked grants. Notification/identity fixtures exercise
token replacement, invalidation and revocation. Simulated acceptance is a
local sender result. Real provider acceptance, device display, notification
opening and authorized refresh are separate hosted observations.

The private Notion plan could not be opened. The work order and the committed
[meeting decision record](../decisions/2026-11-16-pilot-workflow-delta.md) supply
the cancellation, staffing and review policy for local review.
