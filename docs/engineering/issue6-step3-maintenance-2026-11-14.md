# Issue #6 step 3 — scheduled local maintenance

14 November 2026, Asia/Beirut. Follows [step 2 authorization](issue6-step2-authorization-2026-11-14.md) and the approved retention/export/import contract. This is fictional local implementation; no hosted scheduler, operating-system task, real account, APK, deployment or paid service was created.

## Result and activation

The local runner now performs protected maintenance before starting HTTP, then schedules subsequent runs every 60 seconds after the preceding run completes. It uses a dedicated maintenance connection, separate from all API identities. The runner drains scheduled work during shutdown, closes both connection pools and removes its disposable database.

Run npm run data:local as before. It starts a fresh fictional environment; the scheduler runs only while that command is active. npm run data:local -- --check verifies startup maintenance, an authenticated API read and cleanup. No command is scheduled on the user's computer for future execution, and nothing continues running after the local process exits.

A startup failure or a busy reconciliation lock blocks the HTTP listener. On a later restart, startup maintenance catches up before serving data. During normal operation, failures are retried after 1, 2, 4 and subsequent doubled seconds, capped at 60 seconds. A successful run resets the failure backoff. These are local engineering timing defaults, not a production availability or erasure SLA.

## Work performed

| Work                     | Behavior                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expired import artifacts | Clears staged raw rows at/after their 24-hour preview deadline, even if status was already changed. Active previews survive. A generated metadata-only has_staged_rows flag avoids granting the worker raw-staging SELECT access.                                                         |
| Expired export jobs      | Removes expired job metadata. Downloads already enforce expiry and authorization independently of cleanup. Export data is generated on demand; no external file bucket exists here.                                                                                                       |
| Retry cache              | Prunes committed retry outcomes after seven days. Stable operation references remain, so cache expiry cannot silently make an old intent new. Retry endpoints still belong to booking service work.                                                                                       |
| Booking history          | Deletes histories older than twelve UTC calendar months after the latest requested/assigned appointment end or cancellation fact, subject to documented active preservation. Removes dependent allocations, events and outbox rows in the same transaction.                               |
| Customer erasure         | Processes up to 100 pending trusted-operator requests per run. Removes profile contact and subject binding, substitutes the deleted-customer label and opaque key, and records only opaque IDs/action/time in the deletion ledger. No customer-facing erasure-request endpoint was added. |
| Preservation review      | An active documented hold marks an erasure request needs_review. Merely removing/expiring that hold does not approve it: the trusted operator must review and requeue it. Preserved history is not pruned. No legal requirement is invented by the fixture.                               |
| Restore reconciliation   | Reapplies already-recorded deletion decisions before serving HTTP and during maintenance. Reconciliation now updates only rows whose identifying data differs; repeated runs do not invalidate configuration or otherwise rewrite already-erased profiles.                                |

The 24-hour deadline is enforced for preview use regardless of scheduler health. Physical staging cleanup occurs on the next successful local run. A stopped/suspended process cannot guarantee deletion at exactly 24 hours; startup catch-up and real deployed scheduling/monitoring remain necessary before live-data use.

Existing deletion decisions override data reintroduced by a restore. If an already-queued erasure finds its profile temporarily missing, it still records a protected tombstone so a later profile restore cannot resurrect contact details. The ledger must therefore be retained separately from a restorable dataset in a real operating process. This step tests reconciliation of fictional restored profile contents; it does not repeat or claim a new pass for the completed Supabase-source artifact recovery, off-device backups, RPO or RTO.

## Protected worker boundary

The migration requires a separately bootstrapped NOLOGIN mawid_local_maintenance privilege group. The local fixture creates a dedicated synthetic login in that group, with no API actor membership, table ownership, superuser, role/database creation or BYPASSRLS privilege. Startup verifies this boundary.

All application tables still force RLS. Existing actor policies now apply specifically to mawid_local_actor, and narrowly scoped worker policies apply to mawid_local_maintenance. The worker has explicit table/column/function privileges for erasure and retention. It can read the profile fields required for reconciliation; it cannot read raw staged import JSON or membership tables. It cannot issue API sessions. Actor roles cannot execute maintenance functions, inspect the erasure queue or inspect maintenance run records.

Functions remain SECURITY INVOKER. No public mutation grant or SECURITY DEFINER bypass was introduced. This remains trusted server/operator code; the worker is not a sandbox against arbitrary SQL by the trusted maintenance operator. Real customer identity verification and operator provisioning are separate #5 work.

## Atomicity, concurrency and evidence

Each run acquires a PostgreSQL transaction-level advisory lock before touching data. Another worker skips an already-held lock instead of overlapping. A per-instance guard also prevents concurrent calls in the same process. The lock is released on commit/rollback.

Reconciliation, queued erasures, pruning and the success record commit together. An injected mid-run error rolls back all data changes and leaves pending requests retryable. After rollback, a separate safe failure record is attempted. If the database is unreachable, failure metadata may only be available in the process log until connectivity returns; no durable audit write is claimed during an outage.

maintenance_runs contains only run IDs, times, status, aggregate counts and a stable safe error code. erasure_requests contains opaque workspace/customer/request IDs, status and times. Neither table stores deleted contact contents or failure SQL. Failure logs contain no error text, staged rows, credentials or profile contacts. These records remain in the disposable local database; production audit retention and protected custody remain operational work.

## Verification

Run npm run test:data-maintenance:

- **6 scheduler tests passed:** sequential execution, shutdown draining, capped/resetting backoff, unexpected worker/observer failures, lock-busy timing and invalid configuration rejection.
- **27 PostgreSQL integration checks passed:** worker privilege isolation; denial for all fixture API roles; raw-staging/membership read denial; idempotent tenant-scoped erasure queue; legal review/requeue; pre-listener reconciliation; idempotent repeated runs; failed/busy startup blocking; injected rollback and later retry; expiry cleanup across tenants/statuses; durable retry references; history/allocation/event/outbox cleanup with preservation; independent-worker locking; actual timer execution; stop/drain; database-restart recovery; missing-profile erasure tombstones; no public maintenance endpoint; metadata-only evidence.

Exact source/lock/migration hashes and integration outcomes are saved in [maintenance-verification.json](../../database/maintenance-verification.json). Test containers are disposable and cleaned up.

The **282 authorization checks** and **32 API checks** also passed after the role-policy and lifecycle changes. The 61-check database suite passed across all six migrations. Existing app tests: 22 passed. Strict types passed; lint passed with 0 errors and the same 11 existing warnings. Normal/Pages builds, Pages artifact/toolchain checks and both browser tests passed. No dependency upgrade or lockfile change was needed for this step.

## Next step and limits

Step 3 is complete for the current local runner. Step 4 is explicit failed-migration rollback and forward-recovery verification/runbooks. Step 5 is commit/push/CI/review/merge. Everything remains local and uncommitted.

Real identity/erasure requests and live security proof remain #5. The public demo remains browser-local; booking transitions remain #7; notification dispatch #8; operational backup scheduling, independent deletion-ledger custody and recovery targets #11. The four preserved evidence gaps remain unverified and non-blocking for continued local engineering.

Implementation follows PostgreSQL's [privilege model](https://www.postgresql.org/docs/17/ddl-priv.html), [row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and [transaction-level advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).

Final source hashes match the recorded local evidence. Test fixtures were removed. Changes remain uncommitted and have not been pushed or merged.

## Step 4 continuation

[Migration recovery](issue6-step4-migration-recovery-2026-11-14.md) now uses the maintenance exclusion lock during fixture upgrades. Local startup journals per-file commits and checks exact applied history before maintenance/API startup. The maintenance and authorization regressions were rerun successfully.
