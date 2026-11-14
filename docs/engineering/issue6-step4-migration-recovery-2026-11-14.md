# Issue #6 step 4 — migration failure and forward recovery

14 November 2026, Asia/Beirut. Builds on the [protected local maintenance runner](issue6-step3-maintenance-2026-11-14.md). This work uses disposable fictional PostgreSQL databases only. No hosted database, Auth/Storage schema, account, APK, deployment or paid service changed.

## Result

The local fixture now uses a journaled migration runner instead of applying the whole schema bundle as one transaction. Each successful migration and its exact source checksum commit together. A failure rolls back the current file and stops the batch; earlier committed files remain recorded and later files are not run.

**8 transaction-safety unit checks and 23 PostgreSQL recovery integration checks passed.** Named outcomes, runtime versions and source/lock/migration hashes are in [migration-recovery-verification.json](../../database/migration-recovery-verification.json). Reproduce with npm run test:data-migrations. Its deliberately bad, corrected and forward-fix migrations are in-memory test fixtures, not application migration files. The six existing application migration SQL files were not changed in this step.

The drill also exposed and fixed an unhandled checked-out PostgreSQL client error after forced connection termination. Broken connections are now discarded safely. Retrying reads the journal and applies only files that have not committed.

## Local executor boundary

scripts/database/migrations/runner.mjs accepts only the explicitly configured loopback PostgreSQL owner pool from the fictional fixture. It checks host, port, user, database-name prefix and a database-level fixture marker before DDL. There is no connection-URL/environment fallback or hosted apply command. The fixture validates the actual Docker image and loopback port binding before creating that pool.

The private mawid_fixture_migrations.applied journal stores version, filename, SHA-256 and application time. It forces RLS and has no API-role schema privilege. This is a **local rehearsal journal**, not Supabase's hosted migration-history schema. It must not be used to fabricate hosted migration state.

Files require unique, strictly ordered 14-digit versions and validated filenames. Hashes bind exact valid UTF-8 bytes, including BOM and line endings. Invalid UTF-8 is rejected rather than normalized. Recorded history must be an exact prefix of the supplied manifest: changed applied bytes, missing/renamed versions and unknown future history stop execution.

The runner acquires the same advisory-lock key as maintenance, using a session lock held across file commits. It refuses a busy lock rather than applying concurrently. This coordinates migration and maintenance executors; it does not itself quiesce application traffic. Local fixture startup runs migration before exposing HTTP.

Each file uses one checked-out connection for BEGIN, SQL, journal insertion and COMMIT/ROLLBACK, with local 2-second lock and 30-second statement timeouts. In-file transaction control, role switching and supported nontransactional-operation patterns are rejected. Comments, quoted strings and dollar-quoted function bodies are handled separately from top-level commands. This is a safety check for trusted, reviewed SQL, not a sandbox or a general SQL-dump importer.

Dry run executes pending transactional changes and journal inserts inside one outer rollback-only transaction. It returns metadata inventory, then rolls back DDL, DML, privileges and the journal. A new journal created during a dry run is rolled back too. Migrations must not contain external calls or irreversible side effects; transaction rollback does not constitute an external-system recovery mechanism.

## Verified cases

| Case                                                         | Observed result                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| First real migration to current schema                       | Both tenants' original profiles, bookings, catalogs, hours and locations remain intact; all remaining checksums are journaled. |
| Repeat identical manifest                                    | No migration is reapplied.                                                                                                     |
| Edited applied file or divergent manifest                    | Refused without changing data or journal.                                                                                      |
| Failure after a prior file commits                           | Only the earlier file is recorded; the failed file's schema/data changes are absent and later files never run.                 |
| Failure after changing security objects                      | Data update, added column, disabled RLS, dropped policy, public grant and replaced function all roll back.                     |
| Corrected unpublished/unapplied fixture                      | Retry resumes after the exact committed prefix; it does not rerun earlier files.                                               |
| Committed behavior bug                                       | An appended correction repairs a wrong default/backfill while keeping the original migration checksum/history unchanged.       |
| Dry run and failing dry run                                  | No pending column, data mutation, grant/RLS change or journal entry remains afterward.                                         |
| Competing executor                                           | Migration refuses maintenance's held lock; maintenance skips an in-flight migration.                                           |
| Deliberately terminated migration connection                 | Uncommitted DDL disappears, no applied record is written, the process survives and retry applies only the interrupted file.    |
| PostgreSQL restart                                           | Committed data and journal survive; replay is a no-op and the existing API projection still works.                             |
| Missing extension prerequisite                               | Empty-schema application fails atomically; no core schema or journal is left behind.                                           |
| Empty-to-current dry run and application                     | Rollback-only rehearsal leaves no new schemas; actual application records every source checksum exactly once.                  |
| Existing unknown metadata namespace or absent fixture marker | Refused and preserved; no automatic drop or overwrite occurs.                                                                  |

The connection test terminates a backend during an uncommitted transaction. It is not a power-loss, storage-corruption or provider-outage test. No database restore or automatic destructive down-migration was performed. The completed Supabase-source artifact recovery was not rerun.

## Upgrade and recovery runbook

### Before an upgrade

1. Use reviewed source and the pinned Node/npm lockfile. Record the current source revision, exact migration manifest/checksums, schema inventory and last committed journal prefix. Validate prerequisites and any schema-name collision. Keep the original source files unchanged once applied.
2. Rehearse on an isolated fictional database from empty and from the previous supported schema. Run npm run test:data-migrations plus the API, authorization and maintenance suites. Exercise both read compatibility and any changed write path before release.
3. For a future deployed change, separately authorize the target and execution. Verify target identity/exposure and an appropriate recoverable backup/deletion-ledger plan. Stop or drain writers and maintenance before applying. The local lock does not replace traffic quiescence, operational backup approval or real identity verification.
4. Prefer additive expand/backfill changes that keep the prior application usable. Rehearse the appended correction and application-version fallback. Destructive contract/removal work needs its own compatibility and recovery review.

### If execution fails or connectivity is lost

1. Stop the batch. Preserve safe error code/SQLSTATE, filename/checksum, source revision, schema inventory and journal state; omit SQL payloads, contacts and credentials from logs.
2. Reconnect to the verified same target and inspect the journal before deciding what committed. A lost COMMIT acknowledgement can make the client's last result ambiguous; do not infer database state from a console failure or blindly replay data writes.
3. Confirm the failed/uncommitted file has no applied record and inspect its expected objects/data/security state. Earlier committed files remain in place. Diagnose prerequisites, locks, source validity and data constraints.
4. If an **unpublished local file has never applied anywhere**, correct it, rehearse again and retry from the exact committed prefix. The test fixture demonstrates this case only.
5. If the original published file can succeed after a reviewed prerequisite or data repair, preserve its bytes, perform the separately reviewed repair, then retry that same file. Do not change an already-applied checksum or mark failed work as applied.
6. For intrinsically invalid published SQL, stop and prepare an explicit history-reconciliation plan across affected environments. This tool does not skip a failed published migration or forge its success so a later file can run.

### If SQL committed but application behavior is wrong

1. Preserve the committed migration and journal entry. Where compatibility has been verified, return the application to the previous compatible version while retaining the additive schema.
2. Append a new, ordered corrective migration. Fix the default/constraint/function or perform the required backfill transactionally; do not edit the old applied file or drop data to hide the problem.
3. Dry-run and apply the correction in an isolated rehearsal, rerun compatibility/security/data checks, then obtain the separately required target execution/release authorization. Record exact source, migration hashes and outcomes.
4. If safe forward correction cannot preserve required data, stop for a reviewed restore/recovery decision. No automatic restore or destructive down path is authorized by this runbook.

### After an upgrade

Verify the exact applied prefix, checksum match, expected schema and data inventory, tenant/role permissions, affected API reads/writes and maintenance startup reconciliation. Only then resume traffic/maintenance and assess release acceptance. A committed migration is not proof of correct application behavior or a release.

## Regression evidence and remaining work

The 282 authorization checks, 32 API checks, 6 scheduler tests and 28 maintenance checks passed with journaled startup. Existing app tests: 22 passed. Strict types passed. Lint passed with 0 errors and the same 11 existing warnings. Normal/Pages builds, Pages artifact/toolchain checks, both browser tests and the local startup/cleanup smoke check passed. No dependency upgrade or lockfile change was needed in this step.

Step 4 is complete for the local implementation. Step 5 remains: review the full local change, commit/push a focused PR, run GitHub CI, then review and merge. These steps do not automatically close #6 or establish live readiness. Real identity is #5, booking transitions #7, notification delivery #8 and operational backups/recovery targets #11. The four preserved evidence gaps remain unverified and non-blocking for local engineering.

The runner follows PostgreSQL's [transaction guarantees](https://www.postgresql.org/docs/17/tutorial-transactions.html), [advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS) and node-postgres's [same-client transaction requirement](https://node-postgres.com/features/transactions).

Final recorded source hashes match the local implementation. Disposable recovery databases and containers were removed. All changes remain uncommitted; nothing was pushed, merged or deployed.
