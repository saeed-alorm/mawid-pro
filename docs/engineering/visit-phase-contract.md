# Local visit contract and execution checklist

This implementation extends the shared booking core described in #4, #6 and #7. Identity remains under #5, notifications under #8, customer and management clients under #9/#10, operations and acceptance under #11/#12, selected gallery and multi-service scope under #13, and reviews under #31. The architecture, FEAT-01–50 and the [engineering continuation exception](../decisions/2026-11-14-issue4-approval-and-continuation.md) apply.

## Confirmed behavior

Both partner managers control bookings. Other employees only view their own appointments. Customers can cancel strictly before the appointment starts. A customer cancellation with less than 60 minutes remaining qualifies, excluding exactly 60 minutes. The fourth qualifying cancellation within a rolling 90 days per salon raises the existing flag and does not trigger an automatic ban. Review invitations are automatic two minutes after the scheduled end.

## Local implementation assumptions

- A visit has ordered service segments, each with one preferred professional or Any. Partners resolve every Any preference before confirming.
- Approval, offers, rescheduling and cancellation apply atomically to the visit. The first service start determines eligibility and any late cancellation counts once. Partial approval and cancellation are deferred.
- Local rescheduling policy for review. Partners may make a new reschedule only before the first assigned service starts and while the visit has zero submitted reviews. Book another appointment as a new visit to retain the original schedule and review history. An authorized exact retry of a successful operation returns its stored result across the cutoff under the existing idempotency rules.
- Segments run in order with no discretionary gaps or simultaneous service. Each professional owns the entire buffered interval for their segment. Two consecutive services with the same professional require both internal buffers in sequence. This mandatory turnover is visible between services and included in elapsed visit duration. Different professionals can use overlapping buffers around consecutive services. A repeated professional with overlapping buffered intervals elsewhere in the chain is unavailable.
- Pending requests do not reserve capacity. One additional reminder goes to both current partners after 15 opening-time minutes.
- Caller intake uses a display name and an optional phone. An existing record must already be associated with the location to appear in lookup. A new record is created without an account binding and in the same transaction as its visit.
- One review invitation becomes due two minutes after the final scheduled service end, without a manual completion action. The verified visit owner may submit one integer score from 1–5 per distinct assigned professional and one final review per visit/professional. Written feedback is visible to management. Public profiles show genuine averages and review counts.
- No-show and overrun policy, marketing, campaigns, awards, Instagram and iOS are deferred.

## Execution

| Deliverable | Status | Evidence or remaining work |
| --- | --- | --- |
| A. Contract, data and compatibility | Implemented and verified locally | Historical ID/allocation/event/retry preservation, explicit legacy upgrade response, v2 export, retention and migration/recovery fixtures |
| B. Server booking | Implemented and verified locally | Complete-chain validation, second-segment conflicts and races, scope, holds, expiry, rescheduling and replay |
| C. Caller intake | Implemented and verified locally | Location-scoped lookup, app-less caller creation and exact retry replay |
| D. Booking and calendar UI | Implemented and verified locally | Connected visit form, employee-first Arabic/RTL booking, management visit schedule and read-only employees |
| E. Durable jobs | Implemented and verified locally | Opening-time reminder, two current partners, competing workers and recipient rechecks |
| F. Reviews | Implemented and verified locally | Signed ownership, final-end timing, booking revision checks, distinct scores, scoped feedback, aggregate and erasure |
| G. Private Android | Verified on the API 35 emulator | The customer APK requested a two-segment visit, the management APK approved the whole visit once, and the customer APK displayed the confirmation after reconnecting. Physical two-device acceptance remains open |

Only local fictional fixtures are in scope. Hosted identity-to-booking and live-pilot acceptance remain tracked under their existing issue homes.

## Contract versions

Single-service clients keep `booking-core`. A legacy appointment list with a visible multi-service visit returns HTTP 409 and `MULTI_SERVICE_VISITS_REQUIRE_UPDATE` so a partial schedule cannot look complete. Direct v1 reads and edits of an authorized multi-service visit return the same upgrade response. `visit-core` provides visit-shaped read projections and accepts ordered `segments` for requests, slots and staff intake. Any is represented by an omitted preferred professional. Explicit staff assignments use a positional array, and mutations carry `expected_version` when editing an existing visit and `operation_id` for retry. Use `contract=2` for visit-aware notification links and export downloads. The visits API accepts up to eight segments and has a seven-day picker. The advisory picker and every confirmed transaction validate the complete chain.

Approval at the requested time preserves the requested sequence. Staff use a proposal if a different assignment changes the timing or a specific preference. A partner reschedule of a confirmed visit changes the entire schedule and releases the earlier allocations only after the replacement passes validation. The server recalculates timing and uses the existing workspace transaction lock and allocation exclusion constraint.

The web reschedule picker sends the visit ID in `POST visit-core/visits/:id/reschedule-slots` with its expected version and optional positional assignment overrides. Missing or null entries preserve saved assignments. The preview uses the confirmed segment durations and saved buffer snapshots, excludes only that visit's own allocations, and validates the current professional and opening schedules. Checking the original future start first gives off-grid appointments priority within the search budget. The reschedule transaction repeats all checks and checks its cutoff again at the write. Partner visit projections include `can_reschedule` for confirmed visits.

Web slot requests can pass `search: {}` to scan the current Beirut calendar day, `search: { date }` to select a day, or `search: { cursor }` to continue through the next dates in the seven-day window. Tokens expire after 15 minutes and bind the actor, location and original search inputs, including the visit version for a reschedule preview. Availability is recomputed on each page. `search.status` distinguishes a completed search from a page that has more dates or encountered a bound. An exhausted page keeps successful results and indicates that the user can continue, select a different date, or narrow professional choices. The default seven-day request keeps the existing Android `items` contract and visits later days even when a candidate exhausts its budget. It returns an explicit `AVAILABILITY_SEARCH_INCOMPLETE` conflict if it reaches a bound with zero results.

An additional pending reminder is attached to a v2 request's original event and uses its 15-opening-minute deadline. Assigning an Any preference keeps that reminder while the request stays pending. Confirmation, acceptance, intake and rescheduling create review jobs for their exact visit revision. The regular legacy notification contract continues to read single-service bookings. New reviews retain anonymous scores until visit retention removes the records and scrub written feedback on erasure. The local signed fixture uses simulated delivery.
