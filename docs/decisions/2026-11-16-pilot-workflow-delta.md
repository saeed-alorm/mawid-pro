# Pilot workflow delta — meeting of 16 November 2026

Recorded 17 November, Asia/Beirut. Sources: the owner's meeting account, partner
notes and explicit follow-up answers, consolidated in the private
[meeting record](https://www.notion.so/41af53c2a11d818a9dd2f4d496bb7981).
The [implementation plan](https://www.notion.so/41bf53c2a11d818e95e8e2334032eb9a)
maps requirements to existing issues. Named pilot details/assets remain private.

## Confirmed changes

- Two partner managers control booking creation, approval, rejection, proposals
  and cancellation. Other professionals view only their own appointments. Existing
  roles remain additive: partner setup needs both admin and manager capabilities;
  a role label or app configuration never grants access by itself.
- Customers can cancel before appointment start, including inside the final hour.
  A customer cancellation of a confirmed appointment qualifies for the flag only
  with **less than 60 minutes** remaining. Exactly 60 minutes is uncounted. Keep
  the fourth qualifying cancellation in a rolling 90 days per salon, no automatic
  ban, and the exclusions for salon cancellations, withdrawn pending requests,
  expired offers and duplicate retries. This supersedes the 30-minute prohibition.
- A still-pending request needs an additional management reminder after 15 minutes.
  This supersedes the no-extra-overdue-push direction. The request remains pending
  and non-reserving. Confirm clock/count/closing semantics before implementing the
  timer; retain prior opening-time policy as the proposed starting point.
- Review invitations are automatic **two minutes after scheduled booking end**,
  without a manual completion prerequisite. Cancelled bookings are excluded.
  Reviews are tracked separately in [#31](https://github.com/saeed-alorm/mawid-pro/issues/31).
- A visit can contain consecutive services performed by different professionals.
  Both normal booking and employee-profile entry must support this requirement.
- Partner-entered appointments must support callers without the app. Minimal
  customer records do not automatically create or claim authenticated accounts.
- Prioritise team/booking near the hero, large employee photos, service images,
  descriptions and genuine professional ratings. Existing employee booking links
  are extended; a minimal portfolio and later social integrations are distinct.

## Requests requiring further rules or scope selection

Whole-visit versus per-segment acceptance/cancellation, gaps, Any assignment across
segments, partial conflicts, and rating each professional versus the entire visit
need a concrete contract. No-show/start-boundary handling and calendar overruns
also remain open. Exact-start cancellation stays denied in the local slice;
post-start customer cancellation is not silently enabled.

Introductory discounts, loyalty points, monthly employee/customer recognition,
broadcasts and two-month inactivity messages are recorded requirements. Their
commercial values, eligibility, reversals, ranking definitions, audience, channel,
cadence and first-pilot priority are not invented. They remain decomposed through
#13/#14 and the existing FEAT IDs. The budget discussion's desired iOS scenario
must be reconciled with the Android-first repository scope under #15.

Actual catalog/durations, six-person team schedules, hours/holidays and approved
media are awaited. They are needed for salon acceptance, not synthetic development.

## Implementation and history

The first local implementation slice is own-professional scope and the confirmed
cancellation rule. It adds a trusted binding table, narrows SQL/API/notification
reads and removes employee mutation UI. No binding is inferred from contact text,
professional name, package or client-supplied ID. The local fixture operator creates
fictional bindings; real employee account provisioning is still separate.
See the [implementation and verification record](../engineering/issue7-meeting-policy-implementation-2026-11-17.md)
for this slice's evidence and acceptance limits.

The cancellation count is a derived warning under the new timestamp rule. Existing
booking and event rows are preserved, not rewritten or backfilled. Accordingly,
earlier cancellations that do not meet the new rule no longer contribute to this
derived count in the fictional fixture. Adoption/effective-date handling against
live history requires explicit review before any hosted migration; none occurs here.

Earlier decision records retain their history. This delta supersedes conflicting
role, cancellation and reminder wording only. The approved architecture, shared
source, non-reserving pending requests, proposal holds and
[non-blocking engineering exception](2026-11-14-issue4-approval-and-continuation.md)
remain. A PR, merge or passing fixture is not a released APK or live-pilot acceptance.
