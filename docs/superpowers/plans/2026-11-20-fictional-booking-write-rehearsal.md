# Fictional Booking-Write Rehearsal Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans after owner approval. The checkboxes are execution gates, not authorization to deploy or write staging data.

**Status:** Plan approved; allowlist implemented and verified locally. No live deployment, Auth changes, or staging database writes were made. Fixture sign-off and explicit live authorization are still required.

**Goal:** Verify one fictional two-service visit through request and exact retry, confirmation, customer readback, cancellation, and cross-shop denial.

**Architecture:** Keep the current probe as the default. Add an explicit, expiring staging rehearsal mode that admits only exact method/path pairs for one approved workspace and location, before invoking the shared API. Keep the existing verified-session and shop authorization checks in the shared API; the route guard is not a substitute for either.

**Tech stack:** Cloudflare Workers, dedicated Hyperdrive bindings with the existing staging CA and `verify-full`, and Supabase staging.

**Spec:** [Staging rehearsal packet](../../engineering/staging-rehearsal.md) and [visit contract](../../engineering/visit-phase-contract.md). The packet's cited revision, `59e3ac5530c551928b21dbf4e2e7344d7a590109`, is available in local Git. The deployed probe includes working-tree changes beyond local base commit `da7b3d9`; record the candidate source and bundle hash rather than treating that commit as proof of the deployed bytes.

## Global Constraints

- Target only `mawid-booking-staging` and the linked Supabase staging project. Do not deploy to or modify the Auth Worker, another Worker, production, or the mail sender.
- Keep `PILOT_ACCESS=disabled`, notifications disabled, cron empty, and preview URLs disabled. Do not toggle probe-only off to expose the broader API. Hyperdrive currently rejects the non-probe setting; permit only the new bounded rehearsal mode, not arbitrary non-probe Hyperdrive use.
- Proposed, not approved: Shop A, its existing fictional manager (Staff 2), and one explicitly linked fictional customer. Staff 1 from Shop B is a denial-only control and receives no new grants. No positive writes to Shop B.
- Keep IDs, private emails, keys, access tokens, raw response bodies, and database URLs out of Git, Notion, and shared logs. Report only sanitized statuses, counts, and version evidence.

## 1. Review The Allowlist Locally

- [x] In [hosted config](../../../scripts/database/hosted/config.mjs) and the [Worker](../../../scripts/database/hosted/worker.mjs), require explicit rehearsal configuration: one exact workspace/location pair, reviewed fictional subjects, and a UTC expiry. Reject malformed or incompatible mode settings. Before the window and after expiry, return to the normal GET-only probe routes without a deploy.
- [x] Keep only the two existing GET probes plus the following routes. Here `<base>` is exactly `/v1/workspaces/<approved-workspace>/locations/<approved-location>/visit-core`, and `<visit>` is a single canonical visit UUID.

| Method and path | Purpose |
| --- | --- |
| `GET /v1/workspaces`, `GET /v1/session` | Existing identity and scope probes |
| `POST <base>/requests` | Create one customer request at the prechecked start |
| `POST <base>/visits/<visit>/confirm` | Manager confirmation |
| `GET <base>/visits/<visit>` | Customer reads the confirmed visit and two assigned segments |
| `POST <base>/visits/<visit>/cancel` | Cancel that visit as the customer |

- [x] Reject all other methods and paths, including import/export, profiles, notifications, reviews, legacy booking, generic visit routing, and slot/availability routes. Reject extra path segments, encoded separators, alternate scopes, and queries on visit routes. Use independent read-only inventory queries for scheduling evidence; do not add an inspection endpoint.
- [x] Add regression tests beside [hosted config tests](../../../scripts/database/hosted/config.test.mjs). Verify deny-by-default, expiry, alternate methods/paths, and that out-of-scope requests do not reach the shared handler. The 42 focused tests, local visit suite, 282 signed authorization checks, local Workerd route-gate smoke test, and Wrangler dry run passed. The dry run used the probe manifest; it did not configure a live rehearsal window.

For a reviewed candidate only, bind `MAWID_HOSTED_REHEARSAL` privately as a JSON string
with exactly `workspaceId`, `locationId`, `startsAt`, and `expiresAt`.
The IDs must be canonical lowercase UUIDs. Timestamps use `YYYY-MM-DDTHH:mm:ssZ`
and the window may span at most one hour. Only requests admitted from the start
through strictly before expiry can reach the visit routes; requests already
in progress at expiry still require reconciliation. Keep the probe flag true
and scope `STAGING_SUBJECTS` to the three approved test accounts. Leave the
rehearsal binding unset on the rollback probe.

## 2. Approve Fixtures And Cleanup Before Opening Writes

- [ ] Have Saeed approve the exact shop, location, manager, customer, two services, two eligible distinct professionals, start time, UTC window, and cleanup owner. The approved customer must have a current binding to its own fictional customer profile; do not create or rebind it without separate approval. Shop B's manager must have no membership or customer access in Shop A.
- [ ] Read back the active probe version, route state, bindings, and off flags. Confirm the baseline rollback target is `78cbbbc8-b19a-434b-be8b-30539a967c34` and the original two staff subjects can be restored. Record an approved restore point and privately capture counts for the scoped fixtures, allocation windows, events, and outbox. Visit mutations can expire proposals across the workspace: require no unrelated proposals that can expire during the window, or stop.
- [ ] Check that no consumer can dispatch the rehearsal outbox. Agree how to retain the cancelled audit record and quarantine or remove only rehearsal jobs using an approved scoped procedure. Do not delete all pending jobs, remove audit history ad hoc, or enable dispatch to clear the queue. No approved cleanup or no verified rollback means no live writes.
- [ ] Use a start comfortably more than 60 minutes away during approved Beirut opening hours. Check both service slots including buffers, professional eligibility, and no conflicting allocations. Baseline a fresh operation ID for each mutation and keep those IDs private.

## 3. Run Only The Approved Rehearsal

- [ ] After explicit live approval, deploy only the reviewed candidate to the staging probe. Verify its active version, deliberate expiry, account/shop allowlist, closed routes, and off settings before making the first write. Use genuine Supabase sessions for the approved fictional subjects; a no-email login verifies Auth and authorization, not SMTP.
- [ ] As the customer, request exactly one visit with two ordered services. Expect `201`, pending state and two requested segments. Replay the exact method, path, principal and body with the same `operation_id`. Verify the same visit ID and version, exactly one visit, two segments, no duplicate receipt or event, and zero confirmed allocations.
- [ ] Before the authorized confirmation, use the Shop B manager's session on the **same allowed Shop A confirmation path** with a fresh operation ID and the pending version. Expect JSON `404 NOT_FOUND`. Confirm no state/version change and no new allocations, operation record, events, or outbox entries from the denied attempt. This exercises shared shop authorization, not only the outer route filter.
- [ ] As the Shop A manager, confirm once with the saved pending version and the reviewed assignments. Expect `200` and the same visit ID in confirmed state. Verify one confirmation event, the expected outbox delta and exactly two confirmed allocation rows. As the customer, verify that the visit detail shows both assigned segments, distinct professionals, and first service end equal to second service start. The projection shows segments; the database count is independent evidence of reservations.
- [ ] Cancel as the customer with a fresh operation ID, current version, and `acknowledge_late_cancellation=false`. Expect `200` and cancelled state. Verify zero allocations for the visit and that both reviewed intervals, including buffers, have no residual allocation from it. Read the visit back once; do not create another visit to prove release.
- [ ] On an unexpected status, identity mismatch, extra write, off-setting change, or ambiguous response, stop new writes. Disable the rehearsal routes by restoring the probe. Reconcile the existing operation before considering any retry; never submit a new operation ID to recover an ambiguous write.

## 4. Close And Report

- [ ] Reconcile exactly the visit, segments, allocations, operation receipts, events, and outbox delta against baseline. Execute only the approved fixture cleanup, then sign out rehearsal sessions. If rollback happened first, use only the approved cleanup procedure, not a second opening of the write routes.
- [ ] Restore version `78cbbbc8-b19a-434b-be8b-30539a967c34` at 100%; verify its scope, bindings, and off flags. Independently recheck anonymous `GET /v1/workspaces` and `GET /v1/session` for JSON `401 SESSION_REQUIRED`, and confirm write routes are closed with a harmless route-gate check.
- [ ] Record sanitized UTC times, candidate/rollback versions, source and bundle hashes, statuses, allocation counts, denial evidence, and cleanup outcome. Leave pilot activation, email delivery, and notification delivery open; this rehearsal does not approve any of them.
