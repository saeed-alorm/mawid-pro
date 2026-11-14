# Issue #6 step 1 — local server data operations

14 November 2026, Asia/Beirut. Builds on the [local data foundation](issue6-local-review-2026-11-14.md) and the [approved contract](p1-architecture-decision-2026-11-14.md). This is fictional local engineering under the existing continuation approval. No hosted resource or real identity-provider account is used.

## Result

Local HTTP operations now persist and read data through PostgreSQL. The API has fixed operations for scoped profiles, catalog and booking reads, CSV preview/confirmation and authorized export jobs/delivery. It uses the existing migrations and SQL transfer functions; it does not introduce a second booking engine.

The server uses Node's HTTP implementation and a pinned development-only PostgreSQL driver. It is outside the Vite source tree and is never imported into the Pages app. PostgreSQL and HTTP listeners bind to 127.0.0.1. The fixture creates its own random-named disposable container, validates the pinned image and loopback binding, and supplies explicit local connection configuration. There is no environment-based fallback to a hosted URL. Test cleanup removes only the container it created.

## Session and request boundary

The fixture owner issues opaque, randomly generated fictional bearer sessions with a maximum 15-minute lifetime. They are stored hashed in server memory and map only to preconfigured local database principals. There is no HTTP login, actor-selection or SQL-execution endpoint. Restart invalidates sessions; membership is checked from the database on operations and export delivery. Request bodies reject unknown fields, including actor/role injection.

Each database principal has its own small pool. Authorization uses PostgreSQL session_user and the existing RLS policies. Startup rejects privileged/unmapped principals. Parameterized SQL carries data; application code never constructs identifiers or SQL from a request. A transaction uses one checked-out connection for BEGIN, work, COMMIT/ROLLBACK and release. Raw PostgreSQL details and input rows never enter HTTP error responses or application error logs.

Host and Origin checks protect the loopback API from cross-site/rebinding requests. Responses are marked fictional-local, use no-store and return a server-generated request ID. CSV input is bounded by bytes/rows and explicit allowed fields. An oversized request may be rejected before its body finishes uploading; clients must handle both a 413 response and transport interruption. This is a local development tool, not a production auth/security or abuse-limit proof.

## Operations

All routes require a server-issued bearer session and use the prefix /v1/workspaces/:workspace_id.

| Method and suffix                                                                              | Behavior                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /profiles                                                                                  | Authorized profile projection, keyset pagination with limit 1–50 and optional after UUID. No identity-provider binding.                               |
| GET /locations/:location_id/services                                                           | Staff-scoped service catalog, same pagination.                                                                                                        |
| GET /locations/:location_id/professionals                                                      | Staff-scoped professional catalog, same pagination.                                                                                                   |
| GET /locations/:location_id/openings                                                           | Staff-scoped weekly openings, same pagination.                                                                                                        |
| GET /locations/:location_id/bookings                                                           | RLS-scoped persisted records, same pagination; no customer overdue field. Booking mutations remain #7.                                                |
| POST /locations/:location_id/imports/preview?kind=customers\|professionals\|services\|openings | Manager-authorized text/csv preview; returns job ID, exact-byte SHA-256 and row count.                                                                |
| GET /imports/:job_id                                                                           | Owner/manager-scoped metadata; no staged raw rows.                                                                                                    |
| POST /imports/:job_id/confirm                                                                  | Strict JSON with file_sha256 and confirmed:true; reauthorization and atomic SQL import/audit.                                                         |
| POST /exports                                                                                  | Strict JSON with optional location_id/customer_id; current SQL scope rules apply. Customer supplies own customer ID; manager may request salon scope. |
| GET /exports/:job_id                                                                           | Authorized metadata and expiry state.                                                                                                                 |
| GET /exports/:job_id/download?format=json\|csv                                                 | Reauthorized delivery, explicit fields and formula-safe CSV.                                                                                          |

## Run and verify

Use Node 24.22.1/npm 11.9.0 and Docker, then npm ci.

- npm run data:local starts a fresh disposable fictional environment and prints the loopback API URL and temporary session-file path. Session tokens are outside the source/web root in an OS temporary directory, not console output or Git. Ctrl+C removes the session file and disposable database. Data persists while that fixture exists; restarting this command starts a new fictional dataset.
- npm run data:local -- --check verifies startup and an authenticated read, then cleans up.
- npm run test:data-api applies all local migrations, exercises HTTP operations against PostgreSQL and removes its test container. Metadata-only results and exact source/lock/migration hashes are saved in database/api-verification.json.

**32 integration checks passed**, including positive reads/import/export, denied unauthenticated/cross-tenant/forged-role paths, strict request validation, import preview metadata, explicit confirmation, pagination, rollback and safe errors under an injected database failure, saved-job revocation, session expiry/revocation, server restart and database restart. The original PostgreSQL 61-check evidence remains separate and its migrations are unchanged.

The clean updated-lockfile install passed. Existing 22 app tests, strict types and lint passed; lint retains the same 11 existing warnings. Normal and Pages builds, Pages artifact/toolchain checks, both browser tests and the local API startup/cleanup smoke check passed. npm ci still reports the previously observed 21 dependency advisories; no audit suppression or unrelated upgrades were added.

## Next step and acceptance limits

Next is step 2: complete an explicit endpoint-by-endpoint authorization matrix, including location-scoped memberships, guessed/other-owner job IDs, all request/write/export/import paths and revocation. Existing 32 checks establish the first working HTTP path, not exhaustive endpoint security coverage.

The public demo remains browser-local. Real verified sessions/identity remain #5. Customer app/portal integration is separate channel work; this API does not claim a live multi-device application. Scheduled cleanup/retention is step 3. Failed-migration rollback/forward-recovery work is step 4. Commit/push/CI/review/merge is step 5 and has not happened. Booking transitions remain #7, notification delivery #8 and operational backups #11. The four preserved evidence gaps remain non-blocking and unverified.

Implementation uses the documented [parameterized query](https://node-postgres.com/features/queries) and [same-client transaction](https://node-postgres.com/features/transactions) APIs. No architecture, hosting, spending or release decision changed.

## Step 2 continuation

[Step 2 authorization](issue6-step2-authorization-2026-11-14.md) now verifies all current operation variants. Its explicit profile/booking read guards and narrower location-export projection supersede the corresponding step 1 defaults above. Real identity and the other acceptance limits remain open.
