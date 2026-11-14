# Issue #6 step 2 — local endpoint authorization

14 November 2026, Asia/Beirut. Continuation of [step 1](issue6-step1-local-api-2026-11-14.md), using the approved workspace/location/role contract and fictional local identities only. No hosted execution, real identity account, APK, push, merge or release occurred.

## Result

**282 authorization checks passed across 19 operation variants covering all 11 current HTTP route patterns.** The test inventory, individual scenarios, PostgreSQL/Node versions and exact source/lock/migration hashes are in [authorization-verification.json](../../database/authorization-verification.json). Run npm run test:data-auth to reproduce them in an automatically removed, loopback-only PostgreSQL fixture.

The fixture contains two fictional organizations, two locations in organization A, customers with separate identities, an unbooked customer profile, organization-wide managers, a second manager in the same organization, an admin, a location-only manager and a location-only professional. Synthetic identities are server-owned; a client cannot choose a database role. The local service bounds configured principal pools to 12; this fixture uses nine.

## Findings fixed

1. Profile-list reads previously relied on RLS returning an empty list for location-only staff. They now explicitly require either organization-wide manager/admin scope or the actor's own customer-profile binding. A disallowed salon-wide profile read returns uniform NOT_FOUND rather than implying a usable endpoint with an empty result.
2. The requested location filtered bookings in an export but did not filter its profile list. The new ordered local migration, 20261114172144_authorization_export_scope.sql, restricts profiles to customers linked to bookings at that location. Existing RLS continues to restrict which profiles/contact fields are readable. No new profile privilege is granted to location-only managers.
3. Booking reads now check the requested staff location explicitly. Staff cannot substitute an unassigned or another tenant's location. Customers retain their own-record filter; a query at a location with no own history returns no other customer's records.

The first two regression probes were observed failing before their fixes and passing afterward. Functions remain SECURITY INVOKER in the private schema. There is no SECURITY DEFINER permission workaround, direct public mutation grant or hosted exposure change.

## Permission matrix

All operations require an unexpired server-issued session. Explicit roles combine; manager does not implicitly confer admin and admin does not implicitly confer manager.

| Operation                                  | Customer                                 | Organization manager/admin                                      | Location-only staff                                                                                                   |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Profile list                               | Own profile only                         | Organization manager or admin may read salon profiles           | No salon-wide contact list; own-customer capability remains separate                                                  |
| Services/professionals/openings reads      | Denied in this staff data API            | Manager/admin within authorized organization/location           | Manager/professional at assigned location only                                                                        |
| Booking reads                              | Own history only                         | Manager/admin within authorized scope                           | Manager/professional at assigned location only                                                                        |
| Customer import preview                    | Denied                                   | Organization manager only; admin alone denied                   | Denied because customer profiles are organization-scoped                                                              |
| Catalog/opening import preview             | Denied                                   | Manager only                                                    | Location manager at assigned location; professional alone denied                                                      |
| Import status/confirmation, all four kinds | Denied                                   | Job owner with current manager scope and import-kind permission | Own catalog jobs within current assigned location only                                                                |
| Customer export request                    | Own profile/history only                 | Own-customer capability is separate from staff role             | Own-customer capability is separate from staff role                                                                   |
| Salon export request                       | Denied                                   | Organization manager only; admin alone denied                   | Location manager may request assigned location's booking dataset; no additional tenant-wide profile contact privilege |
| Export status and JSON/CSV delivery        | Own job and current own-customer binding | Own job and current manager scope                               | Own job and current assigned-location scope                                                                           |

A salon manager who requests a location-filtered export receives only that location's bookings and the readable profiles linked to them. An organization-wide export can include all authorized salon profiles, including unbooked ones. Location-only managers receive the scoped booking rows; global profile contacts are excluded by existing RLS. These are conservative local projections, not permission to broaden staff contact access.

Customer export location input does not grant location access or expand scope: the existing SQL normalizes own-customer exports to the customer's own profile/history across locations. A different customer ID is denied, including another customer in the same salon.

## Scenarios covered

- Every operation variant: absent session; unknown token plus forged actor/role/workspace headers; another tenant's actor; workspace substitution; customer/admin/professional/location-manager role expectations; legitimate customer tokens carrying forged role/actor headers; revoked tenant membership; revoked session; expired session.
- Every saved import/export job path: guessed IDs and another manager's known IDs produce the same NOT_FOUND code/message; knowing a job UUID does not grant ownership. Other same-tenant customers cannot read another customer's export metadata or either delivery format.
- Location boundaries: foreign locations, unassigned same-tenant locations, location-only import rights, tenant-wide export denial and membership narrowed after jobs were created. Scope is checked again for saved confirmations and delivery.
- Allowed writes: successful imports for all four kinds with audit records; successful assigned-location catalog imports; current customer/manager export paths. Denial checks do not merely forbid all operations.
- Scope injection: CSV workspace/actor/location columns and JSON tenant/actor/role overrides are rejected. There is no generic SQL endpoint, direct booking mutation endpoint or profile identity-rebinding endpoint.
- Side effects: database-side SHA-256 fingerprints of complete stored data/job/audit rows remain identical across denied-request blocks. Contacts and staged raw rows are hashed inside PostgreSQL and never emitted to the verification log.
- Pooled identity isolation: 30 concurrent reads alternate three customer identities across two tenants; each response contains only that actor's own profile.
- Expired jobs reveal expiry only to their still-authorized owner; unrelated actors continue receiving NOT_FOUND. Removal of a customer's subject binding invalidates old profile/history access and saved exports. Responses and error logs exclude fixture credentials and profile contacts.

The current API has 11 route patterns and 19 variants because CSV kinds, import confirmations, customer/salon export requests and JSON/CSV delivery exercise distinct permission paths. New endpoints or new variants must extend this matrix; this report does not certify future code.

## Regression verification

- Step 1 HTTP suite: 32 checks passed with the tightened permissions and new migration.
- Database foundation suite: 61 checks passed across all five migrations, including previous-version inventory, empty-schema rollback rehearsal, transfer rollback and restart persistence. This is a regression of the issue #6 schema; the previously completed Supabase-source artifact recovery was not rerun.
- Existing app tests: 22 passed. Strict types passed. Lint passed with 0 errors and the same 11 existing warnings. Normal and Pages builds, Pages artifact/toolchain checks and both browser tests passed. No dependency upgrade or lockfile change was needed for step 2; only the new test command was added to package scripts.

## What remains

Step 2 is complete for the current fictional local API. Real identity-provider sessions, live revocation/abuse controls and live security evidence remain #5. The local SQL adapter is trusted server code, not a sandbox against arbitrary SQL by the adapter itself. The public demo remains browser-local and no production-readiness claim follows from these tests.

Next is step 3: schedule protected staged-import cleanup and retention/deletion maintenance. Failed-migration rollback/forward recovery is step 4. Commit/push/CI/review/merge remains step 5. Booking transitions stay in #7; notification delivery in #8; operational backups in #11. The four preserved evidence gaps remain unverified and non-blocking for continued local engineering.

Final evidence hashes match the current local source. All disposable test containers were removed. The implementation remains uncommitted on the local branch; nothing was pushed, merged or deployed.

## Step 3 continuation

[Scheduled local maintenance](issue6-step3-maintenance-2026-11-14.md) is now integrated with the local runner. Its worker has separate protected privileges; all 282 API authorization checks were rerun and passed. The public API still exposes no maintenance/erasure-queue endpoint.
