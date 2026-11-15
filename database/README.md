# Local issue #6 database

## Booking development (#7)

`npm run data:local` also starts the fictional booking core with seeded eligibility
and availability. See the [booking contract and limits](../docs/engineering/issue7-booking-core-2026-11-15.md)
for routes, explicit roles and versioned retry inputs. Run `npm run test:booking` for
the PostgreSQL booking regression suite. These endpoints remain separate from the
browser-local Pages demo and private Android builds.

This is a PostgreSQL 17 data foundation tested with fictional tenants. The public demo remains browser-local. It does not provision hosted Supabase, touch Auth/Storage, create user accounts, change an APK, or publish anything.

## Run locally

Use the repository's Node 24.22.1/npm 11.9.0 toolchain and Docker. The verifier accepts no connection URL. It checks the exact image, network isolation and absence of published ports before creating its own temporary database, and drops that test database afterward. It restarts this dedicated container to verify persistence; never reuse another workload's container under this name.

1. Start the dedicated local container:

   ```sh
   docker run --detach --name mawid-issue6-local-20261114 --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536
   ```

2. Run `npm run test:data-csv` and `npm run test:data-db`. The latter writes a metadata-only `database/verification.json` with migration checksums and named checks.
3. Remove only this dedicated disposable container when finished: `docker rm --force mawid-issue6-local-20261114`.

The local verifier creates btree_gist in its disposable database, synthetic PostgreSQL login roles and a NOLOGIN privilege group. These are local test identities with no passwords or application identity-provider accounts. Migrations require the group and extension but do not create a hosted role or enable a hosted extension. Never apply them to an existing service without the separately authorized collision/exposure/identity review.

## Model and authorization

The canonical tenant key is `workspace_id`, matching the approved contract. `organizations` is the tenant entity; no second tenant identifier is introduced. Composite foreign keys carry workspace and location. All application tables force RLS. PUBLIC has no schema use or application function execution. Capacity uses a half-open UTC range exclusion constraint and deferred booking/allocation consistency checks.

This rehearsal binds PostgreSQL `session_user` to a seeded synthetic actor. SET ROLE, custom settings and request-supplied claims cannot select a different actor. Membership revocation is checked again for preview, confirmation, job access and export delivery. Roles are additive; admin does not inherit manager. Location managers can import their local catalog/openings, while tenant-wide customer imports require an organization-scoped manager. Customer exports contain their own profile and history across locations. Salon exports require manager scope.

These database principals represent a **trusted local server adapter**, never browser/mobile credentials. SECURITY INVOKER functions and RLS share that adapter's scoped table privileges; the functions are not a privilege sandbox against arbitrary SQL by the trusted adapter. Real verified identity, session revocation, rate limits and the production server API still belong to #5 and the booking service work. This is not live authentication evidence.

## Assisted transfers

CSV supports customers, professionals, services and weekly opening intervals with exact allowed headers, strict UTF-8, at most 1,000 records and 5 MiB. Credential/account columns are rejected. External keys are explicit, lowercase and tenant-scoped; duplicate detection uses those keys, not speculative name/phone matching. Holiday exceptions, staff availability and eligibility exist in the model but are not CSV import kinds in this iteration.

The CSV parser binds exact bytes to SHA-256. Preview validates without catalog/customer writes, then stores staged rows behind a 24-hour preview deadline. It binds tenant, location, actor, file/payload hashes and configuration version. Confirmation requires an explicit true value, current membership, identical hashes and configuration, and full revalidation. Inserts, audit and staging cleanup commit together. A mid-batch error rolls back all effects. Successful previews cannot be recommitted. Expired staging is deleted when protected maintenance runs; the local runner now schedules that maintenance while active (see step 3 below).

Export jobs expire after 15 minutes; delivery reauthorizes and projects explicit fields without identity bindings, credentials or staff-only overdue fields. The CSV renderer prefixes spreadsheet formula triggers and escapes quotes. No unauthenticated download link or external artifact storage is created. Job expiry is separate from source-data retention.

## Retention and remaining service work

Maintenance is not granted to actor roles. The local runner uses a separately verified maintenance identity. It clears expired staging, prunes seven-day retry responses while preserving stable operation references, and deletes booking/event/allocation history older than twelve calendar months after its latest appointment/cancellation fact. A documented, time-limited preservation record prevents automatic history removal and directs customer-erasure requests to review. Erasure removes profile contact/subject binding; the protected ledger retains only opaque IDs, action and time. Restore reconciliation reapplies ledger actions before data is served. A separate protected ledger copy still needs an operational backup/restore process. No backup job or legal-compliance claim is included.

Booking mutation grants are deliberately absent. The authoritative transition service must still implement schedule/eligibility checks, opening-time response clocks, Any assignment, offer expiry, expected versions, replay behavior and atomic event/outbox writes. Those are not proved by these schema constraints. Notification dispatch, real auth, independent-session service races, off-device backups and target-build acceptance remain unverified. The four non-blocking evidence gaps remain tracked.

## Step 1: local HTTP operations

The fictional local API now connects scoped server operations to this PostgreSQL model. Run `npm run data:local` or `npm run test:data-api`; see the [step 1 report](../docs/engineering/issue6-step1-local-api-2026-11-14.md) for endpoints, sessions, commands and limits. The API is separate from the browser-local Pages demo.

## Step 2: endpoint authorization

### Dummy roles for development

Real accounts are not required for local booking development. `npm run data:local`
now enables the existing authorization fixtures and writes all nine short-lived
sessions to the temporary `sessions.json` path printed at startup. Choose a session
by its name and send its token as `Authorization: Bearer <token>`.

| Session name                  | Server-owned scope                                      |
| ----------------------------- | ------------------------------------------------------- |
| `managerA`, `otherManagerA`   | Workspace A manager                                     |
| `locationManagerA`            | Workspace A, location A manager                         |
| `professionalA`               | Workspace A, location A professional                    |
| `adminA`                      | Workspace A admin; does not inherit manager permissions |
| `customerA`, `otherCustomerA` | Separate customers in workspace A; own records only     |
| `managerB`, `customerB`       | Workspace B isolation fixtures                          |

The expanded fixture includes a second A location and two additional A customer
profiles. Use the IDs in the session file for the primary A/B workspaces and
locations. Restart the runner to obtain fresh sessions after their 15-minute
expiry; shutdown removes the temporary file and disposable database. Run
`npm run data:local -- --check` for startup, customer/professional read and
cross-workspace denial checks.

These names describe fixtures, not client-supplied authorization claims. There is
no HTTP role-selection endpoint, and selecting a different token cannot change
that identity's database membership. Keep tokens outside the frontend bundle.
Use `managerA` for an owner operating the shop; no new all-powerful owner role is
introduced. This supports local #7 work; #5 remains open for real identity,
production sessions and verified client integration.

Run `npm run test:data-auth` for the 282-check authorization matrix. The [step 2 report](../docs/engineering/issue6-step2-authorization-2026-11-14.md) records the fixes, exact operation/role scope and remaining limits. Location-filtered exports now include only readable profiles linked to that location's bookings. Location-only staff have no salon-wide profile-list access.

## Step 3: scheduled protected maintenance

`npm run data:local` now reconciles protected deletion decisions before opening HTTP and schedules cleanup/retention every 60 seconds while active. Run `npm run test:data-maintenance` for the scheduler and PostgreSQL failure/recovery checks. The [step 3 report](../docs/engineering/issue6-step3-maintenance-2026-11-14.md) documents timing, privilege boundaries, operator-reviewed erasure requests and remaining operational limits. No OS or hosted background job is installed.

## Step 4: migration failure and forward recovery

Local fixture startup now applies migrations one file per transaction and records a private exact-checksum journal. Run `npm run test:data-migrations` for 8 safety checks and 23 PostgreSQL recovery checks. See the [step 4 runbook](../docs/engineering/issue6-step4-migration-recovery-2026-11-14.md) for dry runs, failure diagnosis, immutable applied files, appended corrections and execution limits. This tooling accepts only explicitly marked fictional local fixture databases and does not administer hosted migration history.
