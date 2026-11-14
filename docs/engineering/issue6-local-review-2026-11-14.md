# PR #20 review and local data foundation

14 November 2026, Asia/Beirut. Reviewed the locally supplied planning ref `b3af265048b4f22c29981ad943e4a34eb317085c` against `main` at `63466f7817ee15a2ebf44624769378ac07baf553`. The diff contains one planning document; no runtime/DDL changes existed in PR #20. GitHub review/approval/merge state was not changed.

## Review result

The plan is suitable for fictional local engineering after correcting its tenant-key name to `workspace_id`, as required by the approved internal contract. `organizations` remains the entity name. The four non-blocking evidence gaps remain unverified; no dependency is represented as passed. Wire defaults remain explicit engineering choices, not production approval.

The local implementation lives on `codex/issue6-local-data-model` in a separate workspace checkout. The supplied Desktop repository was read only. It adds four ordered migrations, tenant/location composite references, catalog/schedule/booking/allocation/event/retry/transfer/deletion metadata, forced RLS and private-schema privileges, a synthetic server identity adapter, transactional assisted transfers, and protected retention/reconciliation functions. It does not connect the browser demo to a database.

## Verification

- PostgreSQL 17.12: **61 checks passed**. Exact migration checksums and named outcomes are in [verification.json](../../database/verification.json). Covers version-one inventory through later migrations; all migrations from an empty schema in a rollback-only rehearsal; tenant/customer/role/location denial; forged settings and session escalation; stale/altered/expired previews; duplicates; explicit confirmation; injected mid-batch rollback; audit/staging cleanup; reauthorized export delivery and expiry; allocation exclusion/adjacency; fourth-cancellation scope; retention/preservation; erasure/restore reconciliation; and restart persistence.
- CSV: **14 checks passed**, covering strict UTF-8, malformed input, allowed headers, byte/row bounds, exact-byte hashing, quoted/multiline content and formula-safe output. One additional database check integrates CSV parsing, byte hash and transactional preview.
- Existing app tests: **22 passed**; strict types passed. Normal and Pages builds passed. Pages artifact/fallback/base-path and independent toolchain checks passed.
- Lint passed with **0 errors / 11 existing warnings** after resolving checkout-only CRLF conversion. Normalizing the isolated working copy introduced no unrelated tracked content changes.
- Browser checks: **2 passed** after installing the pinned Playwright Chromium. The initial missing-browser launch failure was resolved.

The self-review corrected offer expiry to cap at appointment start rather than the earlier buffered allocation start; a regression check passes. The suite also caught PUBLIC function execution inherited from PostgreSQL's global defaults. Explicit schema-function revocations were added and verified; no SECURITY DEFINER bypass was used. Local verification substitutes catalog/RLS/ACL tests for a Supabase-stack advisor run; no hosted advisor/configuration operation occurred.

Clean `npm ci` used the authoritative unchanged lockfile and Node 24.22.1/npm 11.9.0. It reported 21 dependency advisories (8 moderate, 6 high, 7 critical). No dependencies were changed or audit checks suppressed; dependency remediation remains separate work. Build provenance records the actual Node pin.

## Acceptance still open

This completes a local data-foundation increment, not all of #6 or a release. Booking transitions, eligibility/hours evaluation, response clocks, Any/hold race handling, durable retry/replay endpoints and event/outbox dispatch are separate server-service work. The local role adapter is not real identity or live security proof. Holiday/staff/eligibility tables exist, but their CSV import paths are not included. Raw SQL is restricted to the trusted local adapter; its SECURITY INVOKER functions are not a sandbox against that adapter's arbitrary SQL.

Off-device retention, protected deletion-ledger custody, operational backup automation, real recovery targets, live auth, target-build/two-device acceptance and the four preserved evidence gaps remain unverified. No hosted database, identity-provider account, production service, paid usage, external notification, APK, push, merge, or publication changed. The completed Supabase-source recovery was not rerun.

Local run instructions and the exact boundaries are in [database/README.md](../../database/README.md).

The validated Pages artifact records source base `b3af265048b4f22c29981ad943e4a34eb317085c` with `source_dirty: true`, Node `v24.22.1`, and lock SHA-256 `6c41f248a72ff21869fbef0b76b33f20bd9b02a9c3b08a473d5fa279c4be86e7`. This local working change has not been committed, pushed, merged or released.

## Step 1 continuation

[Local HTTP operations](issue6-step1-local-api-2026-11-14.md) now read and persist through PostgreSQL, with 32 API integration checks. This supersedes the absence of a request layer only; the public demo remains browser-local and the other acceptance limits above still apply. A pinned development-only `pg` dependency and its lock entries were added for this continuation; the earlier unchanged-lockfile statement describes the original foundation run.
