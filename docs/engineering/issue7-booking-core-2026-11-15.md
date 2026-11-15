# Issue #7 — fictional local authoritative booking core

Scope: FEAT-09/10/11/17/38/45, using the merged data model and dummy sessions from
PRs #21/#22. This is a local PostgreSQL implementation, with no hosted Supabase,
real users, APK, provider dispatch or release. #7 remains open for client/offline
integration and exact target-build/two-device acceptance. #5 remains open.

## Operation contract

Start `npm run data:local` and use one of the temporary server-issued bearer tokens.
All routes below have prefix
`/v1/workspaces/{workspace}/locations/{location}/booking-core/`.

| Method/path                   | Input / behavior                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET `availability`            | Query `service_id`, `start`, optional `professional_id`; advisory only, never reserves                          |
| POST `requests`               | `customer_id`, `service_id`, `start`, optional `professional_id`; customer owns profile, returns pending        |
| POST `walk-ins`               | Same fields, concrete professional required; admin creates confirmed appointment through the same capacity path |
| GET `bookings/{id}`           | Authorized current state, version and server time; resolves elapsed offers                                      |
| POST `bookings/{id}/assign`   | Manager assigns `professional_id` to pending Any request; no reservation                                        |
| POST `bookings/{id}/confirm`  | Admin confirms pending request with concrete selected/assigned professional                                     |
| POST `bookings/{id}/propose`  | Admin supplies future `start` and concrete `professional_id`; creates held offer                                |
| POST `bookings/{id}/accept`   | Owning customer accepts unexpired proposal, rechecking availability                                             |
| POST `bookings/{id}/decline`  | Admin declines pending/proposed request                                                                         |
| POST `bookings/{id}/withdraw` | Owning customer withdraws pending/proposed request, including rejecting an offer                                |
| POST `bookings/{id}/cancel`   | Owning customer through inclusive 30-minute cutoff, or authorized admin                                         |

Every POST requires a UUID `operation_id`; existing-booking POSTs also require
`expected_version` as a positive decimal string. Unknown body/query fields are
rejected. Times use minute precision with explicit `Z` or a Beirut-valid numeric
offset. Wall times in DST gaps or with the wrong offset are rejected; folded
times require the intended offset. API results present UTC instants and the
explicit `Asia/Beirut` timezone. The local engineering booking horizon is 180 days;
schedule lookup is bounded to 370 days. These bounds are implementation defaults,
not a change to approved salon policy.

## Atomicity and policy enforcement

The trusted local booking worker has a separate NOLOGIN group and disposable
server login. It has neither superuser/BYPASSRLS nor actor-role membership. Its
explicit private-schema RLS policies are intended for a trusted server worker;
they are not per-user isolation for arbitrary SQL. Actor credentials cannot mutate
bookings/allocations or access the worker. Identity comes from the existing
server-owned session, never from a request actor/role field. Each worker transaction
locks and rechecks current scoped membership/customer binding before any replay.
Worker credentials must never reach a client or hosted/public SQL API.

A transaction-scoped workspace advisory lock serializes booking operations,
including professionals reused across locations. Membership/profile SHARE locks
coordinate revocation; an organization SHARE lock coordinates the existing
configuration-version triggers. Booking row locks and the existing GiST exclusion
constraint protect capacity. This intentionally favors correctness over throughput
for the bounded local core; no production load claim is made. Lock/deadlock timeouts
return 503 `RETRY_SAME_KEY`, with no unbounded retry loop or provider call.

Service duration/buffers, active professional, explicit eligibility, configured
availability, breaks/absences, weekly hours and holiday overrides are checked before
request creation, assignment and reservation/acceptance. Pending/Any hold nothing;
offers hold only their proposed buffered interval. Admin and manager remain explicit
additive roles. No automatic winner or manager-to-admin inheritance is introduced.
Rebooking means a fresh request after a terminal state. Confirmed-appointment
rescheduling remains deferred under the approved contract.

Booking, allocation, actor event, outbox and retry outcome commit together. Every
committed mutation version has one event/outbox record. Identical retries replay
the committed outcome after permission checks; changed input conflicts; pruned
seven-day retry outcomes cannot resurrect an operation because stable intent rows
remain. Outbox rows are not proof of push delivery (#8).

Fifteen actual opening minutes computes the pending response target. Closed-hours
requests persist immediately with initial staff delivery deferred to next opening.
Overdue is staff-only metadata, never expiry or an extra outbox event. Past-start
requests remain pending and cannot confirm without a future proposal. Offers expire
after 60 elapsed minutes or at appointment start, whichever is sooner, across closing.
Reads/mutations resolve elapsed holds; availability ignores elapsed holds, so delayed
maintenance does not decide capacity. The existing protected retention worker is
unchanged. Customer cancellation records feed the existing per-salon rolling 90-day
count without automatically blocking later requests.

## Verification and remaining acceptance

Executed locally on Windows using pinned Node 24.22.1/npm 11.9.0 and disposable
PostgreSQL 17.12: locked clean install; 23 booking scenarios; 32 existing API checks;
282 authorization checks; 28 maintenance integration checks and scheduler tests;
23 migration-recovery checks and runner safety tests; 14 CSV tests; 61 schema/
persistence checks; 22 app tests. Strict types, normal/Pages builds, Pages and
toolchain checks, two browser tests and local runner startup/cleanup passed.
Final lint has zero errors and the same 11 existing warnings. Formatting failures
from an intermediate test edit were corrected before the final lint/booking run.
Source hashes and named booking scenarios are in `database/booking-verification.json`;
existing data evidence files were regenerated by their actual verification suites.

`npm run test:booking` exercises actual HTTP plus disposable PostgreSQL connections:
competing confirmations, retry/stale/version conflicts, Any role separation,
offer acceptance/expiry, withdrawal/decline, walk-ins, breaks/absence/buffers/holidays,
failed outbox rollback, overdue/past-start handling, cancellation counting/replay,
opening-clock/deferred delivery, revocation, actor write denials, DST and cutoff
boundaries. The data-checks CI job includes this suite and uploads metadata evidence.

Assistant self-review covers explicit authorization before replay, atomic failure,
workspace serialization, deferred consistency triggers, expiry and customer projection.
This is not Saeed's review or an independent approval. Maintainer merge remains separate.

Remaining: real identity/security (#5), connected EN/AR/offline client flows (#9/#10),
management warning/history presentation, notification dispatch/failure UI (#8),
target-build/device acceptance (#12), production throughput and operational release
verification (#11). Clients must show offline actions as unconfirmed and fetch server
state after resume/reconnect; the unchanged browser-local demo is not that evidence.
