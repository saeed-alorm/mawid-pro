# Issue #6 — data model and migration plan

14 November 2026, Asia/Beirut. Documentation-only review following merged [PR19](https://github.com/saeed-alorm/mawid-pro/pull/19), merge commit 63466f7817ee15a2ebf44624769378ac07baf553. Refs [#6](https://github.com/saeed-alorm/mawid-pro/issues/6), [approved contract](p1-architecture-decision-2026-11-14.md) and [explicit non-blocking continuation](../decisions/2026-11-14-issue4-approval-and-continuation.md). No DDL, hosted configuration, identity account, APK or notification integration is performed.

## Scope and dependency interpretation

Supabase PostgreSQL is approved. Proceed with reviewable engineering and fictional local tests without waiting for the four listed evidence gaps. They remain unverified, not passed: workflow/schedule/assets; legal/operator eligibility/quotes; #3 readiness/product synchronization; #5 real identity/security verification. This is not a production-readiness or live-data permission exception. Keep unrelated substantive dependencies. External calendars are after the first pilot.

#4 documentary reconciliation: workload/allowances/cost/exit plan is saved; internal contract and seven-day retries approved; pending/Any/hold/cancellation rules approved; $20–40 monthly planning boundary, 24–30h/week, owners and effort baseline approved; both management surfaces and conditional central Android publishing assessment retained. Documentary approval does not prove legal eligibility, permission enforcement, off-device retention or live recovery targets. #4 may remain open for final tracking/review without blocking this plan on the four waived gaps.

## Proposed entity model

Technical design defaults below implement the approved policies; they do not create a second booking core or a per-salon fork.

| Entity | Scope and invariant |
|---|---|
| organizations | Opaque UUID organization/workspace identity; one salon tenant. Branding/package values never grant access. |
| locations | UUID and organization_id, IANA timezone; organization/location separation from day one without multi-branch operations in P1. |
| memberships | Organization/location-scoped actor and explicitly assigned role; active/revoked state. Identity-provider binding is isolated behind the server identity adapter. No employee account provisioning in this work. |
| customer_profiles | Minimal per-organization customer ID plus server-verified subject binding when available. Keep contact data separate from booking facts; no password/token storage. |
| professionals / services | Tenant-scoped professional and service IDs, eligibility join, duration/buffers and schedule version. Named professional and Any requests share the same resource model. |
| opening_intervals / schedule_exceptions | Location weekly opening rules plus closed-day/holiday exceptions; staff availability/breaks/absences separately scoped. Fictional hours only until actual schedule supplied. |
| bookings | organization_id/location_id/customer_id/service_id, requested and assigned professional, requested/assigned UTC start/end, authoritative state/version, submitted time and response-clock reference. Pending reserves nothing; overdue is derived separately and only exposed to staff. |
| allocations | Concrete professional UTC interval [start,end), owning booking and kind confirmed/offer, with offer expiry. Tenant/professional overlap prevention; assignment alone creates no allocation. |
| booking_events / outbox | Immutable event identity, tenant/object/version/actor/action/time plus minimal safe metadata; outbox committed atomically. Delay closed-hours initial staff push until next opening; no overdue push. |
| idempotency_records | Tenant+actor+operation+retry key, canonical input hash, safe committed outcome and timestamps. Retain seven days; authorize before replay and reject changed payload. |
| import_jobs / export_jobs | Manager/subject ownership, tenant scope, manifest/hash, preview/validation status, explicit confirmation, audit result, temporary artifact expiry. No credentials or unnecessary raw PII in logs. |
| deletion_ledger | Minimal protected erasure/anonymization actions needed to reconcile restores; do not retain deleted profile contents in this ledger. Privacy/audit retention requires a documented purpose. |

Use primary/unique constraints and composite foreign keys including organization_id (and location_id where needed) so cross-tenant references fail at the database. Index FK lookup prefixes and tenant/time query paths; avoid broad cascading deletion of booking/audit records. Review actual query plans after implementation rather than claim performance from indexes alone.

## Authorization and capacity boundary

Start application tables in a proposed private schema, mawid_core, outside effective API exposure. Verify absence/collision and effective exposure immediately before any later hosted application; do not alter the existing rehearsal or Auth/Storage schemas. Deny PUBLIC/anon/authenticated direct mutation and function execution by default. No schema or grants are created by this plan.

All operations use authenticated server identity, membership and object-level scope, with RLS as defense in depth and matching UPDATE USING/WITH CHECK rules. Never trust a client-supplied actor, custom role switch, editable JWT user metadata or arbitrary session setting as authorization. No blanket SECURITY DEFINER workaround. Real authentication integration is separately verified before real-data use; local synthetic role tests are not that evidence.

Booking write transaction: authorize, check version/retry key, lock request and resources in stable order, expire relevant offers using server time, check eligibility/hours/capacity, write booking/allocation/event/outbox and commit. Evaluate a PostgreSQL range exclusion constraint scoped by organization/professional; inspect btree_gist availability before a future migration, without enabling it now. Pending can be confirmed after the response target if valid; past requested time requires a future proposal. The response clock uses actual opening intervals; a 60-minute elapsed offer crosses closing and is capped at proposed start.

Seven-day retry retention is not permission to resubmit an old intent as a new booking. Clients discard/refresh old offline actions; a stale action cannot silently become a fresh mutation. Persist stable operation/booking references and version checks independently of response-cache pruning.

## Import/export defaults for implementation review

Initial assisted CSV scope: customer profiles, professional/service catalog and schedule configuration, with explicit allowed columns; exclude account/password imports and automatic confirmed booking creation. Start with UTF-8 CSV, maximum 1,000 rows / 5 MiB per job, formula-safe exports, strict types/timezone parsing and bounded error output. These are adjustable engineering defaults, not newly approved product limits.

Preview runs without writes. Bind preview to file hash, tenant, actor and configuration version. Explicit manager confirmation reauthorizes and revalidates, rejects changed/stale inputs, detects intra-file and existing-record duplicates and never silently overwrites. Commit accepted changes with audit in one transaction; injected mid-batch failure must roll back all changes. Delete staged raw artifacts after processing or a proposed 24h maximum; do not put contact details in CI logs.

Customer exports contain only the authenticated customer's own profile/history. Salon exports require manager membership and authorized scope. Reauthorize delivery, use short-lived authenticated access, exclude credentials and cross-tenant rows, and escape spreadsheet formulas. Export/download expiry is distinct from the twelve-month source history policy.

## Migration and retention sequence

1. Review this model against approved contract and synthetic two-tenant examples; record schema/contract version and expected inventory.
2. Prepare ordered local migrations: tenant/location primitives, profiles/catalog/schedules, booking/allocation constraints, events/retries, import/export/deletion metadata, then explicit privileges/RLS/functions. Keep secrets/config out of migrations.
3. Apply from empty local PostgreSQL 17; migrate a previous synthetic version; record checksums and restart persistence. Use expand/contract compatibility for future deployed changes, with reviewed rollback/forward-fix strategy. A failed transaction rolls back; destructive down-migrations are not automatically safe recovery.
4. Implement retention: booking/cancellation history twelve months then remove/anonymize identifying details; customer deletion requests separately; fourth-cancellation count rolling 90 days per salon. Explicitly document legal preservation when applicable rather than invent it.
5. Daily encrypted backups retained seven days, Google Drive plus local copy; separate key custody. No backup job here. RPO 24h / RTO four staffed hours are objectives, not measured production capabilities. Reapply deletion ledger actions before serving a restored dataset.
6. Any future hosted application requires a fresh read-only collision/exposure/config check and separately authorized execution. Preserve mawid-auth-test users/sessions/Auth/Storage and the existing rehearsal. No paid service, Twilio or APK change.

## #6 verification matrix — all implementation checks pending

| Acceptance | Required local evidence |
|---|---|
| Persistence and authorization | Save/restart/read with synthetic identities; wrong tenant/customer/role and revoked membership denied. |
| Every read/write/export/import path | Two fictional organizations, guessed IDs, forged scope and cross-tenant FK attempts; test preview, confirmation, job status, download and retry replay separately. |
| Migrations/import safeguards | Empty and prior-version upgrade, dry-run inventory, duplicate/stale-preview checks, injected failure rollback, successful audit and no credential/PII logs. |
| Organization/location model | Same professional/time IDs in separate tenants do not conflict; wrong-location links fail; no P1 multi-branch UI commitment. |
| Approved booking semantics | Non-reserving overdue pending, opening-clock pause/resume, after-hours submit/push scheduling, future proposal after past start, concurrent overlaps/Any/hold races, cutoff/flag scope. Preserve historical proof limits. |
| Retention/deletion | Boundary fixtures for twelve months, 90-day count, seven-day retry pruning, customer erasure and restoration reconciliation. No real data. |

Do not rerun the completed Supabase-source artifact recovery without a changed schema/recovery requirement or conflicting evidence. This plan creates no such artifact and claims no new recovery pass. Implementation, migrations, security tests and target-build evidence remain pending.
