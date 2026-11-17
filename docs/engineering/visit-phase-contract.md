# Local visit contract and execution checklist

This implementation extends the shared booking core described in #4, #6 and #7. Identity remains under #5, notifications under #8, customer and management clients under #9/#10, operations and acceptance under #11/#12, selected gallery and multi-service scope under #13, and reviews under #31. The architecture, FEAT-01–50 and the [engineering continuation exception](../decisions/2026-11-14-issue4-approval-and-continuation.md) apply.

## Confirmed behavior

Both partner managers control bookings. Other employees only view their own appointments. Customers can cancel strictly before the appointment starts. A customer cancellation with less than 60 minutes remaining qualifies, excluding exactly 60 minutes. The fourth qualifying cancellation within a rolling 90 days per salon raises the existing flag and does not trigger an automatic ban. Review invitations are automatic two minutes after the scheduled end.

## Local implementation assumptions

- A visit has ordered service segments, each with one preferred professional or Any. Partners resolve every Any preference before confirming.
- Approval, offers, rescheduling and cancellation apply atomically to the visit. The first service start determines eligibility and any late cancellation counts once. Partial approval and cancellation are deferred.
- Segments run in order with no discretionary gaps or simultaneous service. Each professional owns the entire buffered interval for their segment. Two consecutive services with the same professional require both internal buffers in sequence. This mandatory turnover is visible between services and included in elapsed visit duration. Different professionals can use overlapping buffers around consecutive services. A repeated professional with overlapping buffered intervals elsewhere in the chain is unavailable.
- Pending requests do not reserve capacity. One additional reminder goes to both current partners after 15 opening-time minutes.
- One review invitation becomes due two minutes after the final scheduled service end, without a manual completion action. The verified visit owner may submit one integer score from 1–5 per distinct assigned professional and one final review per visit/professional. Written feedback is visible to management. Public profiles show genuine averages and review counts.
- No-show and overrun policy, marketing, campaigns, awards, Instagram and iOS are deferred.

## Execution

| Deliverable | Status | Evidence or remaining work |
| --- | --- | --- |
| A. Contract, data and compatibility | In progress | Migration, single-service access, retention/export and recovery |
| B. Server booking | Pending | Atomic chain validation, authorization, holds and replay |
| C. Caller intake | Pending | Salon-scoped partner access and retry-safe intake |
| D. Booking and calendar UI | Pending | Customer and staff connected UI, English and Arabic |
| E. Durable jobs | Pending | Reminders, leases and suppression |
| F. Reviews | Pending | Owner verification, due time, rating and retention |
| G. Private Android | Pending | Shared contract, candidate build and device checks |

Only local fictional fixtures are in scope. Hosted identity-to-booking and live-pilot acceptance remain tracked under their existing issue homes.
